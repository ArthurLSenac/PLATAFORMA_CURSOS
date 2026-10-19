// JWT + sessões.
// Fluxo: login válido → cria uma linha em "sessoes" → assina um JWT com o id da sessão (sid)
// → o token vai para um cookie httpOnly (o JavaScript da página não consegue lê-lo).
// A cada requisição o middleware confere a assinatura do JWT E se a sessão continua ativa,
// por isso o administrador consegue "cortar" o login de alguém instantaneamente.
import jwt from "jsonwebtoken";
import crypto from "node:crypto";
import { pool } from "../database/conexao.js";
import { config } from "../config/ambiente.js";

const OPCOES_COOKIE = {
    httpOnly: true,                 // inacessível via document.cookie (protege contra XSS)
    secure: config.cookieSeguro,    // só trafega em HTTPS quando em produção
    sameSite: "strict",             // não é enviado por outros sites (protege contra CSRF)
    path: "/"
};

export async function criarSessao(usuario, req) {
    const sid = crypto.randomUUID();
    const token = jwt.sign(
        { sid, papel: usuario.papel },
        config.jwt.segredo,
        {
            algorithm: "HS256",
            subject: String(usuario.id),
            expiresIn: config.jwt.expiracao,
            issuer: config.jwt.emissor,
            audience: config.jwt.publico
        }
    );

    const { exp } = jwt.decode(token);
    const segundos = Math.max(60, exp - Math.floor(Date.now() / 1000));

    await pool.query(
        `INSERT INTO sessoes (id, usuario_id, ip, user_agent, expira_em)
         VALUES (?, ?, ?, ?, DATE_ADD(NOW(), INTERVAL ? SECOND))`,
        [sid, usuario.id, req.ip ?? null, (req.get("user-agent") || "").slice(0, 255), segundos]
    );

    return { token, sid, expiraEmMs: segundos * 1000 };
}

export function verificarToken(token) {
    return jwt.verify(token, config.jwt.segredo, {
        algorithms: ["HS256"],
        issuer: config.jwt.emissor,
        audience: config.jwt.publico
    });
}

// O token pode vir do cookie (navegador) ou do cabeçalho Authorization: Bearer (Postman/Insomnia)
export function lerToken(req) {
    const cabecalho = req.get("authorization");
    if (cabecalho && cabecalho.startsWith("Bearer ")) {
        return { token: cabecalho.slice(7).trim(), origem: "cabecalho" };
    }
    const cookie = req.cookies?.[config.jwt.cookie];
    if (cookie) return { token: cookie, origem: "cookie" };
    return null;
}

export function definirCookieSessao(res, token, maxAge) {
    res.cookie(config.jwt.cookie, token, { ...OPCOES_COOKIE, maxAge });
}

export function limparCookieSessao(res) {
    res.clearCookie(config.jwt.cookie, OPCOES_COOKIE);
}

export async function revogarSessao(sid) {
    await pool.query("UPDATE sessoes SET revogada_em = NOW() WHERE id = ? AND revogada_em IS NULL", [sid]);
}

export async function revogarSessoesDoUsuario(usuarioId, { exceto = null, conexao = pool } = {}) {
    const [resultado] = await conexao.query(
        "UPDATE sessoes SET revogada_em = NOW() WHERE usuario_id = ? AND revogada_em IS NULL AND id <> ?",
        [usuarioId, exceto ?? ""]
    );
    return resultado.affectedRows;
}

// Remove sessões vencidas há mais de 7 dias (executado periodicamente pelo server.js)
export async function limparSessoesAntigas() {
    await pool.query(
        "DELETE FROM sessoes WHERE expira_em < (NOW() - INTERVAL 7 DAY) OR revogada_em < (NOW() - INTERVAL 7 DAY)"
    );
}
