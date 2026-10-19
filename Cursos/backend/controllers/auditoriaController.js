// Consulta do registro de auditoria (somente leitura) e gestão de certificados emitidos.
import { pool } from "../database/conexao.js";
import { registrarAuditoria } from "../services/auditoria.js";
import { exigirId, paginacao, termoBusca } from "../services/validacao.js";

// GET /api/admin/auditoria?categoria=&busca=&pagina=
async function listarAuditoria(req, res) {
    const { pagina, limite, offset } = paginacao(req.query, { limitePadrao: 25 });
    const filtros = [];
    const valores = [];

    const categoria = String(req.query.categoria || "").replace(/[^a-z_]/g, "");
    if (categoria) {
        filtros.push("a.acao LIKE ?");
        valores.push(`${categoria}.%`);
    }
    const busca = termoBusca(req.query.busca);
    if (busca) {
        filtros.push("(a.descricao LIKE ? OR u.nome LIKE ? OR a.ip LIKE ?)");
        valores.push(busca, busca, busca);
    }
    const onde = filtros.length ? `WHERE ${filtros.join(" AND ")}` : "";

    const [registros] = await pool.query(
        `SELECT a.id, a.acao, a.descricao, a.ip, a.criado_em, u.id AS usuario_id, u.nome AS usuario_nome, u.email AS usuario_email
           FROM auditoria a LEFT JOIN usuarios u ON u.id = a.usuario_id
           ${onde}
          ORDER BY a.id DESC LIMIT ? OFFSET ?`,
        [...valores, limite, offset]
    );
    const [[{ total }]] = await pool.query(
        `SELECT COUNT(*) AS total FROM auditoria a LEFT JOIN usuarios u ON u.id = a.usuario_id ${onde}`,
        valores
    );
    res.status(200).json({ dados: registros, total, pagina, limite, paginas: Math.max(1, Math.ceil(total / limite)) });
}

// GET /api/admin/certificados?busca=
async function listarCertificados(req, res) {
    const busca = termoBusca(req.query.busca);
    const [certificados] = await pool.query(
        `SELECT c.id, c.codigo, c.nome_aluno, c.titulo_curso, c.carga_horaria, c.emitido_em, c.usuario_id, c.curso_id, u.email
           FROM certificados c LEFT JOIN usuarios u ON u.id = c.usuario_id
          ${busca ? "WHERE c.codigo LIKE ? OR c.nome_aluno LIKE ? OR c.titulo_curso LIKE ?" : ""}
          ORDER BY c.emitido_em DESC LIMIT 500`,
        busca ? [busca, busca, busca] : []
    );
    res.status(200).json(certificados);
}

// DELETE /api/admin/certificados/:id  → revoga (o código deixa de ser válido)
async function revogarCertificado(req, res) {
    const id = exigirId(req.params.id);
    const [certificados] = await pool.query("SELECT codigo, nome_aluno, titulo_curso FROM certificados WHERE id = ?", [id]);
    if (certificados.length === 0) {
        return res.status(404).json({ mensagem: "Certificado não encontrado." });
    }
    await pool.query("DELETE FROM certificados WHERE id = ?", [id]);
    const { codigo, nome_aluno: nome, titulo_curso: curso } = certificados[0];
    await registrarAuditoria(req, "certificado.revogado", `Certificado ${codigo} de ${nome} (${curso}) revogado`);
    res.status(200).json({ mensagem: "Certificado revogado." });
}

export { listarAuditoria, listarCertificados, revogarCertificado };
