// Autenticação: cadastro, login, logout, perfil e sessões do usuário logado.
import { pool } from "../database/conexao.js";
import { config } from "../config/ambiente.js";
import { obterConfiguracoes } from "../services/configuracoes.js";
import { registrarAuditoria } from "../services/auditoria.js";
import { gerarHash, compararSenha, validarForcaSenha } from "../services/senha.js";
import {
    criarSessao, definirCookieSessao, limparCookieSessao, lerToken, verificarToken,
    revogarSessao, revogarSessoesDoUsuario
} from "../services/tokens.js";
import { mensagemDeStatus } from "../middlewares/autenticacao.js";
import { ErroHttp, exigirNome, exigirEmail, textoOpcional, exigirTexto } from "../services/validacao.js";
import { caminhoPublico, removerArquivoPublico } from "../services/arquivos.js";

const MAX_TENTATIVAS = 5;
const MINUTOS_BLOQUEIO = 15;

// Dados do usuário que podem ir para o front-end (nunca o hash da senha)
function usuarioPublico(usuario) {
    return {
        id: usuario.id,
        nome: usuario.nome,
        email: usuario.email,
        papel: usuario.papel,
        status: usuario.status,
        admin_fixo: Boolean(usuario.admin_fixo),
        avatar: usuario.avatar || null,
        bio: usuario.bio || null,
        criado_em: usuario.criado_em
    };
}

// POST /api/auth/registro
async function registrar(req, res) {
    if (!obterConfiguracoes().registros_abertos) {
        return res.status(403).json({ mensagem: "Novos cadastros estão temporariamente fechados pelo administrador." });
    }

    const nome = exigirNome(req.body.nome);
    const email = exigirEmail(req.body.email);
    const senha = validarForcaSenha(req.body.senha);
    if (req.body.confirmar_senha !== undefined && req.body.confirmar_senha !== senha) {
        throw new ErroHttp(400, "A confirmação de senha não confere.");
    }

    const [existentes] = await pool.query("SELECT id FROM usuarios WHERE email = ?", [email]);
    if (existentes.length > 0 || email === config.admin.email) {
        return res.status(409).json({ mensagem: "Este e-mail já está cadastrado." });
    }

    const hash = await gerarHash(senha);
    const [resultado] = await pool.query(
        "INSERT INTO usuarios (nome, email, senha_hash, papel, status) VALUES (?, ?, ?, 'aluno', 'pendente')",
        [nome, email, hash]
    );

    await registrarAuditoria(req, "usuario.registro", `Novo cadastro aguardando aprovação: ${nome} <${email}>`, resultado.insertId);

    res.status(201).json({
        mensagem: "Cadastro enviado! Assim que o administrador aprovar, você poderá entrar na plataforma.",
        id: resultado.insertId
    });
}

// POST /api/auth/login
async function login(req, res) {
    const email = String(req.body.email || "").trim().toLowerCase();
    const senha = typeof req.body.senha === "string" ? req.body.senha : "";
    if (!email || !senha) {
        return res.status(400).json({ mensagem: "Informe e-mail e senha." });
    }

    const [linhas] = await pool.query(
        `SELECT id, nome, email, senha_hash, papel, status, admin_fixo, motivo_status, avatar, bio, criado_em,
                tentativas_login,
                (bloqueado_ate IS NOT NULL AND bloqueado_ate > NOW()) AS temporariamente_bloqueado,
                CEIL(TIMESTAMPDIFF(SECOND, NOW(), bloqueado_ate) / 60) AS minutos_restantes
           FROM usuarios WHERE email = ?`,
        [email]
    );
    const usuario = linhas[0];

    if (usuario?.temporariamente_bloqueado) {
        return res.status(429).json({
            mensagem: `Muitas tentativas incorretas. Tente novamente em ${usuario.minutos_restantes} minuto(s).`
        });
    }

    // compararSenha leva o mesmo tempo mesmo quando o usuário não existe
    const senhaCorreta = await compararSenha(senha, usuario?.senha_hash);

    if (!usuario || !senhaCorreta) {
        if (usuario) {
            const tentativas = usuario.tentativas_login + 1;
            if (tentativas >= MAX_TENTATIVAS) {
                await pool.query(
                    "UPDATE usuarios SET tentativas_login = 0, bloqueado_ate = NOW() + INTERVAL ? MINUTE WHERE id = ?",
                    [MINUTOS_BLOQUEIO, usuario.id]
                );
                await registrarAuditoria(req, "login.bloqueio_temporario", `Conta ${email} bloqueada por ${MINUTOS_BLOQUEIO} min após ${MAX_TENTATIVAS} tentativas`, usuario.id);
            } else {
                await pool.query("UPDATE usuarios SET tentativas_login = ? WHERE id = ?", [tentativas, usuario.id]);
            }
        }
        await registrarAuditoria(req, "login.falha", `Tentativa de login sem sucesso para ${email.slice(0, 120)}`, usuario?.id ?? null);
        return res.status(401).json({ mensagem: "E-mail ou senha inválidos." });
    }

    await pool.query("UPDATE usuarios SET tentativas_login = 0, bloqueado_ate = NULL WHERE id = ?", [usuario.id]);

    // Senha correta, mas a conta precisa estar ativa (aprovada pelo administrador)
    if (usuario.status !== "ativo") {
        return res.status(403).json({
            mensagem: mensagemDeStatus(usuario.status, usuario.motivo_status),
            codigo: `CONTA_${usuario.status.toUpperCase()}`,
            status: usuario.status
        });
    }
    if (usuario.papel !== "admin" && !obterConfiguracoes().login_alunos) {
        return res.status(403).json({
            mensagem: "O acesso de alunos está temporariamente suspenso pelo administrador.",
            codigo: "LOGIN_SUSPENSO"
        });
    }

    const { token, expiraEmMs } = await criarSessao(usuario, req);
    definirCookieSessao(res, token, expiraEmMs);
    await pool.query("UPDATE usuarios SET ultimo_login = NOW() WHERE id = ?", [usuario.id]);
    await registrarAuditoria(req, "login.sucesso", `${usuario.nome} entrou na plataforma`, usuario.id);

    res.status(200).json({
        mensagem: `Bem-vindo(a), ${usuario.nome.split(" ")[0]}!`,
        usuario: usuarioPublico(usuario),
        token,
        expira_em: new Date(Date.now() + expiraEmMs).toISOString()
    });
}

// POST /api/auth/logout
async function logout(req, res) {
    const encontrado = lerToken(req);
    if (encontrado) {
        try {
            const payload = verificarToken(encontrado.token);
            await revogarSessao(String(payload.sid));
            await registrarAuditoria(req, "logout", "Sessão encerrada pelo usuário", Number(payload.sub));
        } catch {
            // token inválido/expirado: basta limpar o cookie
        }
    }
    limparCookieSessao(res);
    res.status(200).json({ mensagem: "Você saiu da plataforma." });
}

// GET /api/auth/me
async function usuarioAtual(req, res) {
    res.status(200).json({ usuario: usuarioPublico(req.usuario) });
}

// GET /api/auth/sessao  → como o /me, mas responde { usuario: null } quando não há login
// (usado pelas páginas públicas para montar o cabeçalho sem gerar erro 401)
async function sessaoAtual(req, res) {
    const encontrado = lerToken(req);
    if (!encontrado) return res.status(200).json({ usuario: null });
    try {
        const payload = verificarToken(encontrado.token);
        const [linhas] = await pool.query(
            `SELECT u.* FROM sessoes s JOIN usuarios u ON u.id = s.usuario_id
              WHERE s.id = ? AND s.usuario_id = ? AND s.revogada_em IS NULL AND s.expira_em > NOW()`,
            [String(payload.sid || ""), Number(payload.sub)]
        );
        const usuario = linhas[0];
        const liberado = usuario && usuario.status === "ativo"
            && (usuario.papel === "admin" || obterConfiguracoes().login_alunos);
        if (!liberado) {
            limparCookieSessao(res);
            return res.status(200).json({ usuario: null });
        }
        return res.status(200).json({ usuario: usuarioPublico(usuario) });
    } catch {
        limparCookieSessao(res);
        return res.status(200).json({ usuario: null });
    }
}

// PUT /api/auth/me
async function atualizarPerfil(req, res) {
    const nome = exigirNome(req.body.nome);
    const bio = textoOpcional(req.body.bio, "bio", { max: 500 });

    await pool.query("UPDATE usuarios SET nome = ?, bio = ? WHERE id = ?", [nome, bio, req.usuario.id]);
    await registrarAuditoria(req, "perfil.atualizado", "Dados do perfil atualizados");

    res.status(200).json({
        mensagem: "Perfil atualizado com sucesso.",
        usuario: usuarioPublico({ ...req.usuario, nome, bio })
    });
}

// PUT /api/auth/me/senha
async function alterarSenha(req, res) {
    if (req.usuario.admin_fixo) {
        return res.status(403).json({
            mensagem: "A senha do administrador fixo é definida no arquivo .env do servidor (ADMIN_SENHA)."
        });
    }

    const senhaAtual = exigirTexto(req.body.senha_atual, "senha atual", { max: 200 });
    const novaSenha = validarForcaSenha(req.body.nova_senha, "nova senha");
    if (senhaAtual === novaSenha) {
        throw new ErroHttp(400, "A nova senha deve ser diferente da atual.");
    }

    const [linhas] = await pool.query("SELECT senha_hash FROM usuarios WHERE id = ?", [req.usuario.id]);
    if (!(await compararSenha(senhaAtual, linhas[0]?.senha_hash))) {
        throw new ErroHttp(400, "A senha atual está incorreta.");
    }

    await pool.query("UPDATE usuarios SET senha_hash = ? WHERE id = ?", [await gerarHash(novaSenha), req.usuario.id]);
    const encerradas = await revogarSessoesDoUsuario(req.usuario.id, { exceto: req.usuario.sessao_id });
    await registrarAuditoria(req, "perfil.senha_alterada", `Senha alterada (${encerradas} outra(s) sessão(ões) encerrada(s))`);

    res.status(200).json({ mensagem: "Senha alterada! Por segurança, as outras sessões foram encerradas." });
}

// POST /api/auth/me/avatar
async function enviarAvatar(req, res) {
    if (!req.file) throw new ErroHttp(400, "Selecione uma imagem.");
    const novoAvatar = caminhoPublico("avatares", req.file.filename);

    await removerArquivoPublico(req.usuario.avatar);
    await pool.query("UPDATE usuarios SET avatar = ? WHERE id = ?", [novoAvatar, req.usuario.id]);

    res.status(200).json({ mensagem: "Foto atualizada.", avatar: novoAvatar });
}

// DELETE /api/auth/me/avatar
async function removerAvatar(req, res) {
    await removerArquivoPublico(req.usuario.avatar);
    await pool.query("UPDATE usuarios SET avatar = NULL WHERE id = ?", [req.usuario.id]);
    res.status(200).json({ mensagem: "Foto removida." });
}

// GET /api/auth/me/sessoes
async function listarMinhasSessoes(req, res) {
    const [sessoes] = await pool.query(
        `SELECT id, ip, user_agent, criado_em, ultimo_acesso, expira_em
           FROM sessoes
          WHERE usuario_id = ? AND revogada_em IS NULL AND expira_em > NOW()
          ORDER BY ultimo_acesso DESC`,
        [req.usuario.id]
    );
    res.status(200).json(sessoes.map((sessao) => ({ ...sessao, atual: sessao.id === req.usuario.sessao_id })));
}

// DELETE /api/auth/me/sessoes/:id
async function encerrarMinhaSessao(req, res) {
    const [resultado] = await pool.query(
        "UPDATE sessoes SET revogada_em = NOW() WHERE id = ? AND usuario_id = ? AND revogada_em IS NULL",
        [String(req.params.id), req.usuario.id]
    );
    if (resultado.affectedRows === 0) {
        return res.status(404).json({ mensagem: "Sessão não encontrada." });
    }
    res.status(200).json({ mensagem: "Sessão encerrada." });
}

// DELETE /api/auth/me/sessoes  (todas, menos a atual)
async function encerrarOutrasSessoes(req, res) {
    const total = await revogarSessoesDoUsuario(req.usuario.id, { exceto: req.usuario.sessao_id });
    await registrarAuditoria(req, "perfil.sessoes_encerradas", `${total} sessão(ões) encerrada(s) pelo próprio usuário`);
    res.status(200).json({ mensagem: `${total} sessão(ões) encerrada(s).` });
}

export {
    registrar, login, logout, usuarioAtual, sessaoAtual, atualizarPerfil, alterarSenha,
    enviarAvatar, removerAvatar, listarMinhasSessoes, encerrarMinhaSessao, encerrarOutrasSessoes
};
