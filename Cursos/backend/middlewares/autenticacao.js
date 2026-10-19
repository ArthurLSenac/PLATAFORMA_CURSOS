// Middlewares de autenticação (quem é você?) e autorização (o que você pode fazer?).
import { pool } from "../database/conexao.js";
import { lerToken, verificarToken, limparCookieSessao } from "../services/tokens.js";
import { obterConfiguracoes } from "../services/configuracoes.js";

export function mensagemDeStatus(status, motivo) {
    switch (status) {
        case "pendente":
            return "Seu cadastro ainda está aguardando a aprovação do administrador.";
        case "rejeitado":
            return `Seu cadastro não foi aprovado pelo administrador.${motivo ? ` Motivo: ${motivo}` : ""}`;
        case "bloqueado":
            return `Seu acesso foi bloqueado pelo administrador.${motivo ? ` Motivo: ${motivo}` : ""}`;
        default:
            return "Acesso não autorizado.";
    }
}

// Exige um usuário logado, ativo e com sessão válida
export async function exigirLogin(req, res, next) {
    const encontrado = lerToken(req);
    if (!encontrado) {
        return res.status(401).json({ mensagem: "Faça login para continuar.", codigo: "SEM_SESSAO" });
    }

    // 1) Confere a assinatura e a validade do JWT
    let payload;
    try {
        payload = verificarToken(encontrado.token);
    } catch (erro) {
        limparCookieSessao(res);
        const expirou = erro.name === "TokenExpiredError";
        return res.status(401).json({
            mensagem: expirou ? "Sua sessão expirou. Entre novamente." : "Sessão inválida. Entre novamente.",
            codigo: "SESSAO_INVALIDA"
        });
    }

    // 2) Confere no banco se a sessão continua ativa e carrega o usuário
    const usuarioId = Number(payload.sub);
    const [linhas] = await pool.query(
        `SELECT u.id, u.nome, u.email, u.papel, u.status, u.admin_fixo, u.avatar, u.bio, u.criado_em,
                s.id AS sessao_id,
                (s.ultimo_acesso < NOW() - INTERVAL 5 MINUTE) AS atualizar_acesso
           FROM sessoes s
           JOIN usuarios u ON u.id = s.usuario_id
          WHERE s.id = ? AND s.usuario_id = ? AND s.revogada_em IS NULL AND s.expira_em > NOW()`,
        [String(payload.sid || ""), usuarioId]
    );
    const usuario = linhas[0];

    if (!usuario) {
        limparCookieSessao(res);
        const [situacao] = await pool.query("SELECT status, motivo_status FROM usuarios WHERE id = ?", [usuarioId]);
        if (situacao[0] && situacao[0].status !== "ativo") {
            return res.status(403).json({
                mensagem: mensagemDeStatus(situacao[0].status, situacao[0].motivo_status),
                codigo: `CONTA_${situacao[0].status.toUpperCase()}`
            });
        }
        return res.status(401).json({ mensagem: "Sua sessão foi encerrada. Entre novamente.", codigo: "SESSAO_ENCERRADA" });
    }

    // 3) Confere a situação da conta e as regras globais definidas pelo administrador
    if (usuario.status !== "ativo") {
        limparCookieSessao(res);
        return res.status(403).json({
            mensagem: mensagemDeStatus(usuario.status),
            codigo: `CONTA_${usuario.status.toUpperCase()}`
        });
    }
    if (usuario.papel !== "admin" && !obterConfiguracoes().login_alunos) {
        limparCookieSessao(res);
        return res.status(403).json({
            mensagem: "O acesso de alunos está temporariamente suspenso pelo administrador.",
            codigo: "LOGIN_SUSPENSO"
        });
    }

    if (usuario.atualizar_acesso) {
        pool.query("UPDATE sessoes SET ultimo_acesso = NOW() WHERE id = ?", [usuario.sessao_id]).catch(() => {});
    }
    delete usuario.atualizar_acesso;
    usuario.admin_fixo = Boolean(usuario.admin_fixo);

    req.usuario = usuario;
    next();
}

// Exige que o usuário logado seja administrador
export function exigirAdmin(req, res, next) {
    if (req.usuario?.papel !== "admin") {
        return res.status(403).json({ mensagem: "Acesso restrito ao administrador." });
    }
    next();
}
