// CRUD de usuários (painel do administrador) + aprovação, bloqueio e sessões.
import { pool, emTransacao } from "../database/conexao.js";
import { registrarAuditoria } from "../services/auditoria.js";
import { gerarHash, validarForcaSenha } from "../services/senha.js";
import { revogarSessoesDoUsuario } from "../services/tokens.js";
import { removerArquivoPublico } from "../services/arquivos.js";
import {
    ErroHttp, exigirId, exigirNome, exigirEmail, textoOpcional, escolha, listaDeIds, paginacao, termoBusca
} from "../services/validacao.js";

const STATUS = ["pendente", "ativo", "bloqueado", "rejeitado"];

const CAMPOS_LISTAGEM = `
    u.id, u.nome, u.email, u.papel, u.status, u.admin_fixo, u.avatar, u.motivo_status,
    u.ultimo_login, u.aprovado_em, u.criado_em,
    (SELECT COUNT(*) FROM matriculas mt WHERE mt.usuario_id = u.id) AS total_matriculas,
    (SELECT COUNT(*) FROM sessoes s WHERE s.usuario_id = u.id AND s.revogada_em IS NULL AND s.expira_em > NOW()) AS sessoes_ativas`;

async function buscarUsuario(id) {
    const [linhas] = await pool.query("SELECT id, nome, email, papel, status, admin_fixo, avatar FROM usuarios WHERE id = ?", [id]);
    return linhas[0] || null;
}

function protegerAdminFixo(usuario, acao = "alterar") {
    if (usuario.admin_fixo || usuario.papel === "admin") {
        throw new ErroHttp(403, `Não é possível ${acao} o administrador fixo. As credenciais dele ficam no arquivo .env.`);
    }
}

// GET /api/admin/usuarios?status=&busca=&pagina=&limite=&ordem=
async function listarUsuarios(req, res) {
    const { pagina, limite, offset } = paginacao(req.query, { limitePadrao: 15 });
    const filtros = [];
    const valores = [];

    if (req.query.status && req.query.status !== "todos") {
        filtros.push("u.status = ?");
        valores.push(escolha(req.query.status, STATUS, "status"));
    }
    const busca = termoBusca(req.query.busca);
    if (busca) {
        filtros.push("(u.nome LIKE ? OR u.email LIKE ?)");
        valores.push(busca, busca);
    }
    const onde = filtros.length ? `WHERE ${filtros.join(" AND ")}` : "";

    const ordenacoes = {
        recentes: "u.criado_em DESC",
        antigos: "u.criado_em ASC",
        nome: "u.nome ASC",
        ultimo_login: "u.ultimo_login IS NULL, u.ultimo_login DESC"
    };
    const ordem = ordenacoes[req.query.ordem] || "u.admin_fixo DESC, u.criado_em DESC";

    const [usuarios] = await pool.query(
        `SELECT ${CAMPOS_LISTAGEM} FROM usuarios u ${onde} ORDER BY ${ordem} LIMIT ? OFFSET ?`,
        [...valores, limite, offset]
    );
    const [[{ total }]] = await pool.query(`SELECT COUNT(*) AS total FROM usuarios u ${onde}`, valores);
    const [contagens] = await pool.query("SELECT status, COUNT(*) AS total FROM usuarios GROUP BY status");

    res.status(200).json({
        dados: usuarios.map((u) => ({ ...u, admin_fixo: Boolean(u.admin_fixo) })),
        total,
        pagina,
        limite,
        paginas: Math.max(1, Math.ceil(total / limite)),
        contagem_status: Object.fromEntries(contagens.map((c) => [c.status, c.total]))
    });
}

// GET /api/admin/usuarios/:id  → detalhes, matrículas com progresso e sessões
async function buscarUsuarioPorID(req, res) {
    const id = exigirId(req.params.id);
    const [linhas] = await pool.query(`SELECT ${CAMPOS_LISTAGEM}, u.bio FROM usuarios u WHERE u.id = ?`, [id]);
    if (linhas.length === 0) {
        return res.status(404).json({ mensagem: "Usuário não encontrado." });
    }

    const [matriculas] = await pool.query(
        `SELECT mt.curso_id, v.titulo, v.total_aulas, mt.criado_em, mt.ultimo_acesso, mt.concluido_em,
                (SELECT COUNT(*) FROM progresso_aulas pa JOIN aulas a ON a.id = pa.aula_id JOIN modulos m ON m.id = a.modulo_id
                  WHERE pa.usuario_id = mt.usuario_id AND m.curso_id = mt.curso_id AND pa.concluida = 1 AND a.publicado = 1) AS aulas_concluidas
           FROM matriculas mt JOIN vw_cursos_resumo v ON v.id = mt.curso_id
          WHERE mt.usuario_id = ? ORDER BY mt.ultimo_acesso DESC`,
        [id]
    );
    const [sessoes] = await pool.query(
        `SELECT id, ip, user_agent, criado_em, ultimo_acesso, expira_em FROM sessoes
          WHERE usuario_id = ? AND revogada_em IS NULL AND expira_em > NOW() ORDER BY ultimo_acesso DESC`,
        [id]
    );
    const [certificados] = await pool.query(
        "SELECT codigo, titulo_curso, emitido_em FROM certificados WHERE usuario_id = ? ORDER BY emitido_em DESC",
        [id]
    );

    res.status(200).json({
        ...linhas[0],
        admin_fixo: Boolean(linhas[0].admin_fixo),
        matriculas: matriculas.map((m) => ({
            ...m,
            percentual: m.total_aulas ? Math.round((m.aulas_concluidas / m.total_aulas) * 100) : 0
        })),
        sessoes,
        certificados
    });
}

// POST /api/admin/usuarios  → o admin cadastra um aluno já aprovado
async function cadastrarUsuario(req, res) {
    const nome = exigirNome(req.body.nome);
    const email = exigirEmail(req.body.email);
    const senha = validarForcaSenha(req.body.senha);
    const status = escolha(req.body.status, STATUS, "status", "ativo");
    const bio = textoOpcional(req.body.bio, "bio", { max: 500 });

    const [existentes] = await pool.query("SELECT id FROM usuarios WHERE email = ?", [email]);
    if (existentes.length > 0) {
        return res.status(409).json({ mensagem: "Este e-mail já está cadastrado." });
    }

    const [resultado] = await pool.query(
        `INSERT INTO usuarios (nome, email, senha_hash, papel, status, bio, aprovado_em, aprovado_por)
         VALUES (?, ?, ?, 'aluno', ?, ?, IF(? = 'ativo', NOW(), NULL), IF(? = 'ativo', ?, NULL))`,
        [nome, email, await gerarHash(senha), status, bio, status, status, req.usuario.id]
    );
    await registrarAuditoria(req, "usuario.criado", `Aluno ${nome} <${email}> cadastrado pelo administrador`);

    res.status(201).json({ mensagem: "Aluno cadastrado com sucesso.", id: resultado.insertId });
}

// PUT /api/admin/usuarios/:id  → altera nome, e-mail e bio
async function atualizarUsuario(req, res) {
    const id = exigirId(req.params.id);
    const usuario = await buscarUsuario(id);
    if (!usuario) {
        return res.status(404).json({ mensagem: "Usuário não encontrado." });
    }
    protegerAdminFixo(usuario, "editar");

    const nome = exigirNome(req.body.nome);
    const email = exigirEmail(req.body.email);
    const bio = textoOpcional(req.body.bio, "bio", { max: 500 });

    const [duplicados] = await pool.query("SELECT id FROM usuarios WHERE email = ? AND id <> ?", [email, id]);
    if (duplicados.length > 0) {
        return res.status(409).json({ mensagem: "Este e-mail já pertence a outro usuário." });
    }

    await pool.query("UPDATE usuarios SET nome = ?, email = ?, bio = ? WHERE id = ?", [nome, email, bio, id]);
    await registrarAuditoria(req, "usuario.atualizado", `Dados de ${nome} (#${id}) atualizados`);

    res.status(200).json({ mensagem: "Usuário atualizado com sucesso.", id });
}

// Aplica uma mudança de status (aprovar, rejeitar, bloquear, desbloquear) dentro de uma conexão
async function aplicarStatus(conexao, usuario, status, motivo, adminId) {
    if (status === "ativo") {
        await conexao.query(
            `UPDATE usuarios
                SET status = 'ativo', motivo_status = NULL, tentativas_login = 0, bloqueado_ate = NULL,
                    aprovado_em = COALESCE(aprovado_em, NOW()), aprovado_por = COALESCE(aprovado_por, ?)
              WHERE id = ?`,
            [adminId, usuario.id]
        );
    } else {
        await conexao.query(
            "UPDATE usuarios SET status = ?, motivo_status = ? WHERE id = ?",
            [status, motivo, usuario.id]
        );
        // Corta o login na hora: todas as sessões do usuário deixam de valer
        await revogarSessoesDoUsuario(usuario.id, { conexao });
    }
}

const DESCRICAO_STATUS = {
    ativo: "aprovado/ativado",
    pendente: "marcado como pendente",
    bloqueado: "bloqueado",
    rejeitado: "rejeitado"
};

// PATCH /api/admin/usuarios/:id/status  { status, motivo }
async function alterarStatus(req, res) {
    const id = exigirId(req.params.id);
    const status = escolha(req.body.status, STATUS, "status");
    const motivo = textoOpcional(req.body.motivo, "motivo", { max: 255 });

    const usuario = await buscarUsuario(id);
    if (!usuario) {
        return res.status(404).json({ mensagem: "Usuário não encontrado." });
    }
    protegerAdminFixo(usuario, "alterar o status do");

    await emTransacao((conexao) => aplicarStatus(conexao, usuario, status, motivo, req.usuario.id));
    await registrarAuditoria(
        req,
        `usuario.${status}`,
        `${usuario.nome} <${usuario.email}> foi ${DESCRICAO_STATUS[status]}${motivo ? ` — motivo: ${motivo}` : ""}`
    );

    res.status(200).json({ mensagem: `Usuário ${DESCRICAO_STATUS[status]} com sucesso.`, id, status });
}

// POST /api/admin/usuarios/lote  { ids: [], acao: "aprovar" | "rejeitar" | "bloquear" | "desbloquear" | "excluir", motivo }
async function acaoEmLote(req, res) {
    const ids = listaDeIds(req.body.ids);
    const acao = escolha(req.body.acao, ["aprovar", "rejeitar", "bloquear", "desbloquear", "excluir"], "acao");
    const motivo = textoOpcional(req.body.motivo, "motivo", { max: 255 });

    const [usuarios] = await pool.query(
        "SELECT id, nome, email, papel, admin_fixo, avatar FROM usuarios WHERE id IN (?) AND papel <> 'admin' AND admin_fixo = 0",
        [ids]
    );
    if (usuarios.length === 0) {
        return res.status(404).json({ mensagem: "Nenhum usuário válido selecionado." });
    }

    const statusPorAcao = { aprovar: "ativo", desbloquear: "ativo", rejeitar: "rejeitado", bloquear: "bloqueado" };

    await emTransacao(async (conexao) => {
        for (const usuario of usuarios) {
            if (acao === "excluir") {
                await conexao.query("DELETE FROM usuarios WHERE id = ?", [usuario.id]);
            } else {
                await aplicarStatus(conexao, usuario, statusPorAcao[acao], motivo, req.usuario.id);
            }
        }
    });
    if (acao === "excluir") {
        await Promise.all(usuarios.map((u) => removerArquivoPublico(u.avatar)));
    }

    await registrarAuditoria(req, `usuario.lote_${acao}`, `Ação "${acao}" aplicada a ${usuarios.length} usuário(s): ${usuarios.map((u) => u.email).join(", ")}`);
    res.status(200).json({ mensagem: `Ação aplicada a ${usuarios.length} usuário(s).`, afetados: usuarios.length });
}

// POST /api/admin/usuarios/:id/senha  { nova_senha }
async function redefinirSenha(req, res) {
    const id = exigirId(req.params.id);
    const usuario = await buscarUsuario(id);
    if (!usuario) {
        return res.status(404).json({ mensagem: "Usuário não encontrado." });
    }
    protegerAdminFixo(usuario, "redefinir a senha do");
    const novaSenha = validarForcaSenha(req.body.nova_senha, "nova senha");

    await pool.query(
        "UPDATE usuarios SET senha_hash = ?, tentativas_login = 0, bloqueado_ate = NULL WHERE id = ?",
        [await gerarHash(novaSenha), id]
    );
    await revogarSessoesDoUsuario(id);
    await registrarAuditoria(req, "usuario.senha_redefinida", `Senha de ${usuario.email} redefinida pelo administrador`);

    res.status(200).json({ mensagem: "Senha redefinida. As sessões abertas do usuário foram encerradas." });
}

// DELETE /api/admin/usuarios/:id/sessoes  → derruba todos os logins do usuário
async function encerrarSessoes(req, res) {
    const id = exigirId(req.params.id);
    const usuario = await buscarUsuario(id);
    if (!usuario) {
        return res.status(404).json({ mensagem: "Usuário não encontrado." });
    }
    if (usuario.id === req.usuario.id) {
        throw new ErroHttp(400, "Para encerrar as suas próprias sessões use a página de perfil.");
    }
    const total = await revogarSessoesDoUsuario(id);
    await registrarAuditoria(req, "usuario.sessoes_encerradas", `${total} sessão(ões) de ${usuario.email} encerrada(s)`);
    res.status(200).json({ mensagem: `${total} sessão(ões) encerrada(s).` });
}

// DELETE /api/admin/usuarios/:id
async function excluirUsuario(req, res) {
    const id = exigirId(req.params.id);
    const usuario = await buscarUsuario(id);
    if (!usuario) {
        return res.status(404).json({ mensagem: "Usuário não encontrado." });
    }
    protegerAdminFixo(usuario, "excluir");

    await pool.query("DELETE FROM usuarios WHERE id = ?", [id]);
    await removerArquivoPublico(usuario.avatar);
    await registrarAuditoria(req, "usuario.excluido", `Usuário ${usuario.nome} <${usuario.email}> excluído`);

    res.status(200).json({ mensagem: "Usuário excluído com sucesso." });
}

// GET /api/admin/usuarios/exportar  → planilha CSV (abre no Excel)
async function exportarCsv(req, res) {
    const [usuarios] = await pool.query(
        `SELECT u.id, u.nome, u.email, u.papel, u.status, u.criado_em, u.aprovado_em, u.ultimo_login,
                (SELECT COUNT(*) FROM matriculas mt WHERE mt.usuario_id = u.id) AS matriculas,
                (SELECT COUNT(*) FROM certificados c WHERE c.usuario_id = u.id) AS certificados
           FROM usuarios u ORDER BY u.id`
    );

    // Evita "CSV injection": células que começam com = + - @ viram texto
    const celula = (valor) => {
        if (valor === null || valor === undefined) return "";
        let texto = valor instanceof Date ? valor.toISOString().replace("T", " ").slice(0, 19) : String(valor);
        if (/^[=+\-@\t\r]/.test(texto)) texto = `'${texto}`;
        return `"${texto.replace(/"/g, '""')}"`;
    };
    const cabecalho = ["ID", "Nome", "E-mail", "Papel", "Status", "Cadastro", "Aprovação", "Último login", "Matrículas", "Certificados"];
    const linhas = usuarios.map((u) =>
        [u.id, u.nome, u.email, u.papel, u.status, u.criado_em, u.aprovado_em, u.ultimo_login, u.matriculas, u.certificados]
            .map(celula).join(";")
    );

    await registrarAuditoria(req, "usuario.exportacao", `Exportação CSV de ${usuarios.length} usuário(s)`);
    res.set({
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="usuarios-${new Date().toISOString().slice(0, 10)}.csv"`
    });
    res.status(200).send("﻿" + [cabecalho.join(";"), ...linhas].join("\r\n"));
}

export {
    listarUsuarios, buscarUsuarioPorID, cadastrarUsuario, atualizarUsuario, alterarStatus, acaoEmLote,
    redefinirSenha, encerrarSessoes, excluirUsuario, exportarCsv
};
