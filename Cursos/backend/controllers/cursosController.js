// CRUD de cursos (painel do administrador).
// É o CRUD principal para a demonstração: cadastrar, listar, buscar, alterar e excluir.
import crypto from "node:crypto";
import fsp from "node:fs/promises";
import path from "node:path";
import { pool, emTransacao } from "../database/conexao.js";
import { registrarAuditoria } from "../services/auditoria.js";
import { coletarArquivos, removerArquivosColetados } from "../services/limpeza.js";
import {
    PASTAS, caminhoPublico, removerArquivoPublico, copiarArquivoPrivado, extensaoDe, removerVarios
} from "../services/arquivos.js";
import {
    ErroHttp, exigirId, exigirTexto, textoOpcional, idOpcional, escolha, booleano, termoBusca
} from "../services/validacao.js";

const NIVEIS = ["iniciante", "intermediario", "avancado"];

// Lê e valida os campos do formulário de curso
async function lerCurso(corpo) {
    const curso = {
        titulo: exigirTexto(corpo.titulo, "título", { min: 3, max: 160 }),
        resumo: textoOpcional(corpo.resumo, "resumo", { max: 300 }),
        descricao: textoOpcional(corpo.descricao, "descrição", { max: 20000 }),
        categoria_id: idOpcional(corpo.categoria_id, "categoria"),
        nivel: escolha(corpo.nivel, NIVEIS, "nível", "iniciante"),
        instrutor: textoOpcional(corpo.instrutor, "instrutor", { max: 120 }),
        publicado: booleano(corpo.publicado) ? 1 : 0,
        destaque: booleano(corpo.destaque) ? 1 : 0
    };
    if (curso.categoria_id) {
        const [categorias] = await pool.query("SELECT id FROM categorias WHERE id = ?", [curso.categoria_id]);
        if (categorias.length === 0) throw new ErroHttp(400, "Categoria selecionada não existe.");
    }
    return curso;
}

// GET /api/admin/cursos?busca=&status=&categoria=
async function listarCursos(req, res) {
    const filtros = [];
    const valores = [];

    const busca = termoBusca(req.query.busca);
    if (busca) {
        filtros.push("(titulo LIKE ? OR instrutor LIKE ?)");
        valores.push(busca, busca);
    }
    if (req.query.status === "publicados") filtros.push("publicado = 1");
    if (req.query.status === "rascunhos") filtros.push("publicado = 0");
    const categoria = idOpcional(req.query.categoria, "categoria");
    if (categoria) {
        filtros.push("categoria_id = ?");
        valores.push(categoria);
    }

    const [cursos] = await pool.query(
        `SELECT * FROM vw_cursos_resumo ${filtros.length ? `WHERE ${filtros.join(" AND ")}` : ""}
          ORDER BY atualizado_em DESC`,
        valores
    );
    res.status(200).json(cursos.map((curso) => ({
        ...curso,
        publicado: Boolean(curso.publicado),
        destaque: Boolean(curso.destaque)
    })));
}

// GET /api/admin/cursos/:id  → curso completo com módulos, aulas e materiais
async function buscarCursoPorID(req, res) {
    const id = exigirId(req.params.id);
    const [cursos] = await pool.query(
        "SELECT v.*, c.descricao FROM vw_cursos_resumo v JOIN cursos c ON c.id = v.id WHERE v.id = ?",
        [id]
    );
    if (cursos.length === 0) {
        return res.status(404).json({ mensagem: "Curso não encontrado." });
    }

    const [modulos] = await pool.query(
        "SELECT id, titulo, descricao, ordem FROM modulos WHERE curso_id = ? ORDER BY ordem, id",
        [id]
    );
    const [aulas] = await pool.query(
        `SELECT a.id, a.modulo_id, a.titulo, a.tipo, a.arquivo_nome, a.arquivo_tamanho, a.url_externa,
                a.duracao_segundos, a.ordem, a.publicado, a.atualizado_em,
                (SELECT COUNT(*) FROM materiais mt WHERE mt.aula_id = a.id) AS total_materiais
           FROM aulas a JOIN modulos m ON m.id = a.modulo_id
          WHERE m.curso_id = ?
          ORDER BY a.ordem, a.id`,
        [id]
    );

    const curso = cursos[0];
    curso.publicado = Boolean(curso.publicado);
    curso.destaque = Boolean(curso.destaque);
    curso.modulos = modulos.map((modulo) => ({
        ...modulo,
        aulas: aulas
            .filter((aula) => aula.modulo_id === modulo.id)
            .map((aula) => ({ ...aula, publicado: Boolean(aula.publicado) }))
    }));
    curso.total_aulas_todas = aulas.length;

    res.status(200).json(curso);
}

// POST /api/admin/cursos  (multipart/form-data, campo de arquivo opcional "capa")
async function cadastrarCurso(req, res) {
    const curso = await lerCurso(req.body);
    const capa = req.file ? caminhoPublico("capas", req.file.filename) : null;

    const [resultado] = await pool.query(
        `INSERT INTO cursos (titulo, resumo, descricao, categoria_id, nivel, instrutor, capa, publicado, destaque)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [curso.titulo, curso.resumo, curso.descricao, curso.categoria_id, curso.nivel, curso.instrutor, capa, curso.publicado, curso.destaque]
    );
    await registrarAuditoria(req, "curso.criado", `Curso "${curso.titulo}" (#${resultado.insertId}) criado`);

    res.status(201).json({ mensagem: "Curso cadastrado com sucesso.", id: resultado.insertId });
}

// PUT /api/admin/cursos/:id  (multipart/form-data)
async function atualizarCurso(req, res) {
    const id = exigirId(req.params.id);
    const [cursos] = await pool.query("SELECT id, capa FROM cursos WHERE id = ?", [id]);
    if (cursos.length === 0) {
        throw new ErroHttp(404, "Curso não encontrado.");
    }
    const curso = await lerCurso(req.body);

    let capa = cursos[0].capa;
    if (req.file) {
        capa = caminhoPublico("capas", req.file.filename);
    } else if (booleano(req.body.remover_capa)) {
        capa = null;
    }

    await pool.query(
        `UPDATE cursos
            SET titulo = ?, resumo = ?, descricao = ?, categoria_id = ?, nivel = ?, instrutor = ?,
                capa = ?, publicado = ?, destaque = ?
          WHERE id = ?`,
        [curso.titulo, curso.resumo, curso.descricao, curso.categoria_id, curso.nivel, curso.instrutor, capa, curso.publicado, curso.destaque, id]
    );
    if (capa !== cursos[0].capa) {
        await removerArquivoPublico(cursos[0].capa);
    }
    await registrarAuditoria(req, "curso.atualizado", `Curso "${curso.titulo}" (#${id}) atualizado`);

    res.status(200).json({ mensagem: "Curso atualizado com sucesso.", id });
}

// PATCH /api/admin/cursos/:id/publicacao  { publicado }
async function alterarPublicacao(req, res) {
    const id = exigirId(req.params.id);
    const publicado = booleano(req.body.publicado) ? 1 : 0;
    const [resultado] = await pool.query("UPDATE cursos SET publicado = ? WHERE id = ?", [publicado, id]);
    if (resultado.affectedRows === 0) {
        return res.status(404).json({ mensagem: "Curso não encontrado." });
    }
    await registrarAuditoria(req, publicado ? "curso.publicado" : "curso.despublicado", `Curso #${id} ${publicado ? "publicado" : "movido para rascunho"}`);
    res.status(200).json({ mensagem: publicado ? "Curso publicado! Já aparece para os alunos." : "Curso movido para rascunho.", publicado: Boolean(publicado) });
}

// DELETE /api/admin/cursos/:id  (apaga módulos, aulas, materiais e arquivos)
async function excluirCurso(req, res) {
    const id = exigirId(req.params.id);
    const [cursos] = await pool.query("SELECT titulo, capa FROM cursos WHERE id = ?", [id]);
    if (cursos.length === 0) {
        return res.status(404).json({ mensagem: "Curso não encontrado." });
    }

    const arquivos = await coletarArquivos("curso", id);
    await pool.query("DELETE FROM cursos WHERE id = ?", [id]);
    await removerArquivosColetados(arquivos);
    await removerArquivoPublico(cursos[0].capa);
    await registrarAuditoria(req, "curso.excluido", `Curso "${cursos[0].titulo}" (#${id}) excluído com ${arquivos.aulas.length + arquivos.materiais.length} arquivo(s)`);

    res.status(200).json({ mensagem: "Curso excluído com sucesso." });
}

// POST /api/admin/cursos/:id/duplicar  → cópia completa (como rascunho), incluindo arquivos
async function duplicarCurso(req, res) {
    const id = exigirId(req.params.id);
    const [cursos] = await pool.query("SELECT * FROM cursos WHERE id = ?", [id]);
    if (cursos.length === 0) {
        return res.status(404).json({ mensagem: "Curso não encontrado." });
    }
    const original = cursos[0];
    const copiados = { aulas: [], materiais: [], capa: null };

    try {
        let capa = null;
        if (original.capa) {
            const nome = `${crypto.randomUUID()}${extensaoDe(original.capa)}`;
            await fsp.copyFile(path.join(PASTAS.capas, path.basename(original.capa)), path.join(PASTAS.capas, nome)).then(() => {
                capa = caminhoPublico("capas", nome);
                copiados.capa = capa;
            }).catch(() => {});
        }

        const novoId = await emTransacao(async (conexao) => {
            const [novo] = await conexao.query(
                `INSERT INTO cursos (titulo, resumo, descricao, categoria_id, nivel, instrutor, capa, publicado, destaque)
                 VALUES (?, ?, ?, ?, ?, ?, ?, 0, 0)`,
                [`${original.titulo} (cópia)`.slice(0, 160), original.resumo, original.descricao, original.categoria_id, original.nivel, original.instrutor, capa]
            );
            const [modulos] = await conexao.query("SELECT * FROM modulos WHERE curso_id = ? ORDER BY ordem, id", [id]);
            for (const modulo of modulos) {
                const [novoModulo] = await conexao.query(
                    "INSERT INTO modulos (curso_id, titulo, descricao, ordem) VALUES (?, ?, ?, ?)",
                    [novo.insertId, modulo.titulo, modulo.descricao, modulo.ordem]
                );
                const [aulas] = await conexao.query("SELECT * FROM aulas WHERE modulo_id = ? ORDER BY ordem, id", [modulo.id]);
                for (const aula of aulas) {
                    let arquivo = null;
                    if (aula.arquivo) {
                        arquivo = `${crypto.randomUUID()}${extensaoDe(aula.arquivo)}`;
                        await copiarArquivoPrivado(PASTAS.aulas, aula.arquivo, arquivo);
                        copiados.aulas.push(arquivo);
                    }
                    const [novaAula] = await conexao.query(
                        `INSERT INTO aulas (modulo_id, titulo, descricao, tipo, arquivo, arquivo_nome, arquivo_tamanho,
                                            url_externa, conteudo, duracao_segundos, ordem, publicado)
                         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                        [novoModulo.insertId, aula.titulo, aula.descricao, aula.tipo, arquivo, aula.arquivo_nome, aula.arquivo_tamanho,
                            aula.url_externa, aula.conteudo, aula.duracao_segundos, aula.ordem, aula.publicado]
                    );
                    const [materiais] = await conexao.query("SELECT * FROM materiais WHERE aula_id = ?", [aula.id]);
                    for (const material of materiais) {
                        const nomeMaterial = `${crypto.randomUUID()}${extensaoDe(material.arquivo)}`;
                        await copiarArquivoPrivado(PASTAS.materiais, material.arquivo, nomeMaterial);
                        copiados.materiais.push(nomeMaterial);
                        await conexao.query(
                            "INSERT INTO materiais (aula_id, nome, arquivo, tamanho) VALUES (?, ?, ?, ?)",
                            [novaAula.insertId, material.nome, nomeMaterial, material.tamanho]
                        );
                    }
                }
            }
            return novo.insertId;
        });

        await registrarAuditoria(req, "curso.duplicado", `Curso "${original.titulo}" duplicado (novo #${novoId})`);
        res.status(201).json({ mensagem: "Curso duplicado como rascunho.", id: novoId });
    } catch (erro) {
        await removerVarios(PASTAS.aulas, copiados.aulas);
        await removerVarios(PASTAS.materiais, copiados.materiais);
        await removerArquivoPublico(copiados.capa);
        throw erro.code === "ENOENT" ? new ErroHttp(500, "Um dos arquivos do curso original não foi encontrado no disco.") : erro;
    }
}

export { listarCursos, buscarCursoPorID, cadastrarCurso, atualizarCurso, alterarPublicacao, excluirCurso, duplicarCurso };
