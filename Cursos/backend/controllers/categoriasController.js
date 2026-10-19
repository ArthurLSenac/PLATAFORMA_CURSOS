// CRUD de categorias de cursos (painel do administrador).
import { pool } from "../database/conexao.js";
import { registrarAuditoria } from "../services/auditoria.js";
import { exigirId, exigirTexto, textoOpcional, exigirCor } from "../services/validacao.js";

function lerCategoria(corpo) {
    return {
        nome: exigirTexto(corpo.nome, "nome", { min: 2, max: 80 }),
        descricao: textoOpcional(corpo.descricao, "descrição", { max: 255 }),
        cor: corpo.cor ? exigirCor(corpo.cor) : "#7c5cff"
    };
}

// GET /api/admin/categorias
async function listarCategorias(req, res) {
    const [categorias] = await pool.query(
        `SELECT cat.*, (SELECT COUNT(*) FROM cursos c WHERE c.categoria_id = cat.id) AS total_cursos
           FROM categorias cat ORDER BY cat.nome`
    );
    res.status(200).json(categorias);
}

// GET /api/admin/categorias/:id
async function buscarCategoriaPorID(req, res) {
    const id = exigirId(req.params.id);
    const [categorias] = await pool.query("SELECT * FROM categorias WHERE id = ?", [id]);
    if (categorias.length === 0) {
        return res.status(404).json({ mensagem: "Categoria não encontrada." });
    }
    res.status(200).json(categorias[0]);
}

// POST /api/admin/categorias
async function cadastrarCategoria(req, res) {
    const { nome, descricao, cor } = lerCategoria(req.body);

    const [existentes] = await pool.query("SELECT id FROM categorias WHERE nome = ?", [nome]);
    if (existentes.length > 0) {
        return res.status(409).json({ mensagem: "Já existe uma categoria com esse nome." });
    }

    const [resultado] = await pool.query(
        "INSERT INTO categorias (nome, descricao, cor) VALUES (?, ?, ?)",
        [nome, descricao, cor]
    );
    await registrarAuditoria(req, "categoria.criada", `Categoria "${nome}" criada`);
    res.status(201).json({ mensagem: "Categoria cadastrada com sucesso.", id: resultado.insertId });
}

// PUT /api/admin/categorias/:id
async function atualizarCategoria(req, res) {
    const id = exigirId(req.params.id);
    const { nome, descricao, cor } = lerCategoria(req.body);

    const [categorias] = await pool.query("SELECT id FROM categorias WHERE id = ?", [id]);
    if (categorias.length === 0) {
        return res.status(404).json({ mensagem: "Categoria não encontrada." });
    }
    const [duplicadas] = await pool.query("SELECT id FROM categorias WHERE nome = ? AND id <> ?", [nome, id]);
    if (duplicadas.length > 0) {
        return res.status(409).json({ mensagem: "Já existe outra categoria com esse nome." });
    }

    await pool.query("UPDATE categorias SET nome = ?, descricao = ?, cor = ? WHERE id = ?", [nome, descricao, cor, id]);
    await registrarAuditoria(req, "categoria.atualizada", `Categoria #${id} atualizada para "${nome}"`);
    res.status(200).json({ mensagem: "Categoria atualizada com sucesso.", id });
}

// DELETE /api/admin/categorias/:id  (os cursos dela ficam "sem categoria")
async function excluirCategoria(req, res) {
    const id = exigirId(req.params.id);
    const [categorias] = await pool.query("SELECT nome FROM categorias WHERE id = ?", [id]);
    if (categorias.length === 0) {
        return res.status(404).json({ mensagem: "Categoria não encontrada." });
    }
    await pool.query("DELETE FROM categorias WHERE id = ?", [id]);
    await registrarAuditoria(req, "categoria.excluida", `Categoria "${categorias[0].nome}" excluída`);
    res.status(200).json({ mensagem: "Categoria excluída com sucesso." });
}

export { listarCategorias, buscarCategoriaPorID, cadastrarCategoria, atualizarCategoria, excluirCategoria };
