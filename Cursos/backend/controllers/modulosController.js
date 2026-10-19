// CRUD de módulos de um curso + reordenação (arrastar e soltar no painel).
import { pool, emTransacao } from "../database/conexao.js";
import { registrarAuditoria } from "../services/auditoria.js";
import { coletarArquivos, removerArquivosColetados } from "../services/limpeza.js";
import { ErroHttp, exigirId, exigirTexto, textoOpcional, listaDeIds } from "../services/validacao.js";

async function exigirCurso(cursoId) {
    const [cursos] = await pool.query("SELECT id, titulo FROM cursos WHERE id = ?", [cursoId]);
    if (cursos.length === 0) throw new ErroHttp(404, "Curso não encontrado.");
    return cursos[0];
}

// GET /api/admin/cursos/:cursoId/modulos
async function listarModulos(req, res) {
    const cursoId = exigirId(req.params.cursoId, "curso");
    await exigirCurso(cursoId);
    const [modulos] = await pool.query(
        `SELECT m.*, (SELECT COUNT(*) FROM aulas a WHERE a.modulo_id = m.id) AS total_aulas
           FROM modulos m WHERE m.curso_id = ? ORDER BY m.ordem, m.id`,
        [cursoId]
    );
    res.status(200).json(modulos);
}

// GET /api/admin/modulos/:id
async function buscarModuloPorID(req, res) {
    const id = exigirId(req.params.id);
    const [modulos] = await pool.query("SELECT * FROM modulos WHERE id = ?", [id]);
    if (modulos.length === 0) {
        return res.status(404).json({ mensagem: "Módulo não encontrado." });
    }
    res.status(200).json(modulos[0]);
}

// POST /api/admin/cursos/:cursoId/modulos
async function cadastrarModulo(req, res) {
    const cursoId = exigirId(req.params.cursoId, "curso");
    const curso = await exigirCurso(cursoId);
    const titulo = exigirTexto(req.body.titulo, "título", { min: 2, max: 160 });
    const descricao = textoOpcional(req.body.descricao, "descrição", { max: 500 });

    const [[{ proxima }]] = await pool.query(
        "SELECT COALESCE(MAX(ordem), 0) + 1 AS proxima FROM modulos WHERE curso_id = ?",
        [cursoId]
    );
    const [resultado] = await pool.query(
        "INSERT INTO modulos (curso_id, titulo, descricao, ordem) VALUES (?, ?, ?, ?)",
        [cursoId, titulo, descricao, proxima]
    );
    await registrarAuditoria(req, "modulo.criado", `Módulo "${titulo}" criado no curso "${curso.titulo}"`);
    res.status(201).json({ mensagem: "Módulo cadastrado com sucesso.", id: resultado.insertId });
}

// PUT /api/admin/modulos/:id
async function atualizarModulo(req, res) {
    const id = exigirId(req.params.id);
    const titulo = exigirTexto(req.body.titulo, "título", { min: 2, max: 160 });
    const descricao = textoOpcional(req.body.descricao, "descrição", { max: 500 });

    const [resultado] = await pool.query(
        "UPDATE modulos SET titulo = ?, descricao = ? WHERE id = ?",
        [titulo, descricao, id]
    );
    if (resultado.affectedRows === 0) {
        return res.status(404).json({ mensagem: "Módulo não encontrado." });
    }
    await registrarAuditoria(req, "modulo.atualizado", `Módulo #${id} atualizado para "${titulo}"`);
    res.status(200).json({ mensagem: "Módulo atualizado com sucesso.", id });
}

// DELETE /api/admin/modulos/:id  (apaga também as aulas e arquivos do módulo)
async function excluirModulo(req, res) {
    const id = exigirId(req.params.id);
    const [modulos] = await pool.query("SELECT titulo FROM modulos WHERE id = ?", [id]);
    if (modulos.length === 0) {
        return res.status(404).json({ mensagem: "Módulo não encontrado." });
    }
    const arquivos = await coletarArquivos("modulo", id);
    await pool.query("DELETE FROM modulos WHERE id = ?", [id]);
    await removerArquivosColetados(arquivos);
    await registrarAuditoria(req, "modulo.excluido", `Módulo "${modulos[0].titulo}" (#${id}) excluído`);
    res.status(200).json({ mensagem: "Módulo excluído com sucesso." });
}

// PUT /api/admin/cursos/:cursoId/modulos/ordem  { ids: [3, 1, 2] }
async function reordenarModulos(req, res) {
    const cursoId = exigirId(req.params.cursoId, "curso");
    const ids = listaDeIds(req.body.ids, "ids");

    const [modulos] = await pool.query("SELECT id FROM modulos WHERE curso_id = ? AND id IN (?)", [cursoId, ids]);
    if (modulos.length !== ids.length) {
        throw new ErroHttp(400, "A lista contém módulos que não pertencem a este curso.");
    }

    await emTransacao(async (conexao) => {
        for (const [indice, id] of ids.entries()) {
            await conexao.query("UPDATE modulos SET ordem = ? WHERE id = ?", [indice + 1, id]);
        }
    });
    res.status(200).json({ mensagem: "Ordem dos módulos atualizada." });
}

export { listarModulos, buscarModuloPorID, cadastrarModulo, atualizarModulo, excluirModulo, reordenarModulos };
