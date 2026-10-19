// Registra ações importantes na tabela "auditoria" (quem fez, o quê, quando e de qual IP).
import { pool } from "../database/conexao.js";

export async function registrarAuditoria(req, acao, descricao = "", usuarioId) {
    try {
        const id = usuarioId !== undefined ? usuarioId : req?.usuario?.id ?? null;
        await pool.query(
            "INSERT INTO auditoria (usuario_id, acao, descricao, ip) VALUES (?, ?, ?, ?)",
            [id, acao, String(descricao).slice(0, 500), req?.ip ?? null]
        );
    } catch (erro) {
        // A auditoria nunca deve derrubar a operação principal
        console.error("Falha ao registrar auditoria:", erro.message);
    }
}
