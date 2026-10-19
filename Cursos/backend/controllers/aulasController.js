// CRUD de aulas + upload de vídeo/áudio/arquivo, upload em massa, reordenação e materiais de apoio.
import fsp from "node:fs/promises";
import { pool, emTransacao } from "../database/conexao.js";
import { registrarAuditoria } from "../services/auditoria.js";
import { coletarArquivos, removerArquivosColetados } from "../services/limpeza.js";
import { interpretarVideoExterno } from "../services/videoExterno.js";
import {
    PASTAS, EXTENSOES, extensaoDe, tipoDeAulaPorExtensao, tituloAPartirDoArquivo, detectarDuracao,
    removerArquivo, compararNatural
} from "../services/arquivos.js";
import {
    ErroHttp, exigirId, exigirTexto, textoOpcional, escolha, inteiro, booleano, listaDeIds
} from "../services/validacao.js";

const TIPOS = ["video", "audio", "externo", "texto", "arquivo"];
const TIPOS_COM_ARQUIVO = ["video", "audio", "arquivo"];
const EXTENSOES_POR_TIPO = { video: EXTENSOES.video, audio: EXTENSOES.audio, arquivo: EXTENSOES.documento };

async function exigirModulo(moduloId) {
    const [modulos] = await pool.query(
        "SELECT m.id, m.titulo, m.curso_id, c.titulo AS curso_titulo FROM modulos m JOIN cursos c ON c.id = m.curso_id WHERE m.id = ?",
        [moduloId]
    );
    if (modulos.length === 0) throw new ErroHttp(404, "Módulo não encontrado.");
    return modulos[0];
}

async function proximaOrdem(moduloId) {
    const [[{ proxima }]] = await pool.query(
        "SELECT COALESCE(MAX(ordem), 0) + 1 AS proxima FROM aulas WHERE modulo_id = ?",
        [moduloId]
    );
    return proxima;
}

// Lê e valida os campos da aula. "existente" é a aula atual (na edição) ou null (no cadastro).
async function lerAula(corpo, arquivo, existente = null) {
    const tipo = escolha(
        corpo.tipo || (arquivo ? tipoDeAulaPorExtensao(arquivo.extensao) : existente?.tipo),
        TIPOS,
        "tipo"
    );

    const aula = {
        titulo: corpo.titulo || !arquivo
            ? exigirTexto(corpo.titulo, "título", { min: 2, max: 160 })
            : tituloAPartirDoArquivo(arquivo.originalname),
        descricao: textoOpcional(corpo.descricao, "descrição", { max: 5000 }),
        tipo,
        url_externa: null,
        conteudo: null,
        duracao_segundos: inteiro(corpo.duracao_segundos, "duração", { min: 0, max: 86400, padrao: existente?.duracao_segundos ?? 0 }),
        publicado: corpo.publicado === undefined ? (existente ? existente.publicado : 1) : (booleano(corpo.publicado) ? 1 : 0)
    };

    if (TIPOS_COM_ARQUIVO.includes(tipo)) {
        if (arquivo && !EXTENSOES_POR_TIPO[tipo].includes(arquivo.extensao)) {
            throw new ErroHttp(400, `Para aulas do tipo "${tipo}" envie: ${EXTENSOES_POR_TIPO[tipo].join(", ")}`);
        }
        const arquivoAtualServe = existente?.arquivo && EXTENSOES_POR_TIPO[tipo].includes(extensaoDe(existente.arquivo));
        if (!arquivo && !arquivoAtualServe) {
            throw new ErroHttp(400, "Envie o arquivo da aula.");
        }
        if (arquivo && !corpo.duracao_segundos) {
            aula.duracao_segundos = await detectarDuracao(arquivo.path, arquivo.extensao);
        }
    } else if (tipo === "externo") {
        aula.url_externa = exigirTexto(corpo.url_externa, "link do vídeo", { max: 500 });
        if (!interpretarVideoExterno(aula.url_externa)) {
            throw new ErroHttp(400, "Informe um link válido do YouTube ou do Vimeo.");
        }
    } else if (tipo === "texto") {
        aula.conteudo = exigirTexto(corpo.conteudo, "conteúdo", { max: 200000 });
    }

    return aula;
}

// GET /api/admin/modulos/:moduloId/aulas
async function listarAulas(req, res) {
    const moduloId = exigirId(req.params.moduloId, "módulo");
    await exigirModulo(moduloId);
    const [aulas] = await pool.query(
        `SELECT id, modulo_id, titulo, tipo, arquivo_nome, arquivo_tamanho, url_externa, duracao_segundos, ordem, publicado
           FROM aulas WHERE modulo_id = ? ORDER BY ordem, id`,
        [moduloId]
    );
    res.status(200).json(aulas);
}

// GET /api/admin/aulas/:id
async function buscarAulaPorID(req, res) {
    const id = exigirId(req.params.id);
    const [aulas] = await pool.query(
        `SELECT a.*, m.curso_id FROM aulas a JOIN modulos m ON m.id = a.modulo_id WHERE a.id = ?`,
        [id]
    );
    if (aulas.length === 0) {
        return res.status(404).json({ mensagem: "Aula não encontrada." });
    }
    const [materiais] = await pool.query(
        "SELECT id, nome, tamanho, criado_em FROM materiais WHERE aula_id = ? ORDER BY id",
        [id]
    );
    const { arquivo, ...aula } = aulas[0];
    res.status(200).json({
        ...aula,
        possui_arquivo: Boolean(arquivo),
        extensao: arquivo ? extensaoDe(arquivo) : null,
        publicado: Boolean(aula.publicado),
        materiais
    });
}

// POST /api/admin/modulos/:moduloId/aulas  (multipart: campo de arquivo opcional "arquivo")
async function cadastrarAula(req, res) {
    const moduloId = exigirId(req.params.moduloId, "módulo");
    const modulo = await exigirModulo(moduloId);
    const aula = await lerAula(req.body, req.file);

    // Arquivo enviado para um tipo que não usa arquivo (ex.: texto) é descartado
    const usaArquivo = TIPOS_COM_ARQUIVO.includes(aula.tipo) && req.file;
    if (req.file && !usaArquivo) await fsp.unlink(req.file.path).catch(() => {});

    const [resultado] = await pool.query(
        `INSERT INTO aulas (modulo_id, titulo, descricao, tipo, arquivo, arquivo_nome, arquivo_tamanho,
                            url_externa, conteudo, duracao_segundos, ordem, publicado)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
            moduloId, aula.titulo, aula.descricao, aula.tipo,
            usaArquivo ? req.file.filename : null,
            usaArquivo ? req.file.originalname : null,
            usaArquivo ? req.file.size : null,
            aula.url_externa, aula.conteudo, aula.duracao_segundos, await proximaOrdem(moduloId), aula.publicado
        ]
    );
    await registrarAuditoria(req, "aula.criada", `Aula "${aula.titulo}" criada em "${modulo.curso_titulo}" › "${modulo.titulo}"`);

    res.status(201).json({ mensagem: "Aula cadastrada com sucesso.", id: resultado.insertId });
}

// PUT /api/admin/aulas/:id  (multipart: novo arquivo opcional substitui o anterior)
async function atualizarAula(req, res) {
    const id = exigirId(req.params.id);
    const [aulas] = await pool.query("SELECT * FROM aulas WHERE id = ?", [id]);
    if (aulas.length === 0) {
        throw new ErroHttp(404, "Aula não encontrada.");
    }
    const existente = aulas[0];
    const aula = await lerAula(req.body, req.file, existente);

    let arquivo = existente.arquivo;
    let arquivoNome = existente.arquivo_nome;
    let arquivoTamanho = existente.arquivo_tamanho;
    const usaArquivo = TIPOS_COM_ARQUIVO.includes(aula.tipo);

    if (usaArquivo && req.file) {
        arquivo = req.file.filename;
        arquivoNome = req.file.originalname;
        arquivoTamanho = req.file.size;
    } else if (!usaArquivo) {
        if (req.file) await fsp.unlink(req.file.path).catch(() => {});
        arquivo = null;
        arquivoNome = null;
        arquivoTamanho = null;
    }

    await pool.query(
        `UPDATE aulas
            SET titulo = ?, descricao = ?, tipo = ?, arquivo = ?, arquivo_nome = ?, arquivo_tamanho = ?,
                url_externa = ?, conteudo = ?, duracao_segundos = ?, publicado = ?
          WHERE id = ?`,
        [aula.titulo, aula.descricao, aula.tipo, arquivo, arquivoNome, arquivoTamanho,
            aula.url_externa, aula.conteudo, aula.duracao_segundos, aula.publicado, id]
    );
    if (existente.arquivo && existente.arquivo !== arquivo) {
        await removerArquivo(PASTAS.aulas, existente.arquivo);
    }
    await registrarAuditoria(req, "aula.atualizada", `Aula "${aula.titulo}" (#${id}) atualizada`);

    res.status(200).json({ mensagem: "Aula atualizada com sucesso.", id });
}

// DELETE /api/admin/aulas/:id
async function excluirAula(req, res) {
    const id = exigirId(req.params.id);
    const [aulas] = await pool.query("SELECT titulo FROM aulas WHERE id = ?", [id]);
    if (aulas.length === 0) {
        return res.status(404).json({ mensagem: "Aula não encontrada." });
    }
    const arquivos = await coletarArquivos("aula", id);
    await pool.query("DELETE FROM aulas WHERE id = ?", [id]);
    await removerArquivosColetados(arquivos);
    await registrarAuditoria(req, "aula.excluida", `Aula "${aulas[0].titulo}" (#${id}) excluída`);
    res.status(200).json({ mensagem: "Aula excluída com sucesso." });
}

// PUT /api/admin/modulos/:moduloId/aulas/ordem  { ids: [...] }
// Também permite MOVER aulas de outro módulo (do mesmo curso) para este.
async function reordenarAulas(req, res) {
    const moduloId = exigirId(req.params.moduloId, "módulo");
    const modulo = await exigirModulo(moduloId);
    const ids = listaDeIds(req.body.ids, "ids");

    const [aulas] = await pool.query(
        `SELECT a.id FROM aulas a JOIN modulos m ON m.id = a.modulo_id WHERE m.curso_id = ? AND a.id IN (?)`,
        [modulo.curso_id, ids]
    );
    if (aulas.length !== ids.length) {
        throw new ErroHttp(400, "A lista contém aulas que não pertencem a este curso.");
    }

    await emTransacao(async (conexao) => {
        for (const [indice, id] of ids.entries()) {
            await conexao.query("UPDATE aulas SET modulo_id = ?, ordem = ? WHERE id = ?", [moduloId, indice + 1, id]);
        }
    });
    res.status(200).json({ mensagem: "Ordem das aulas atualizada." });
}

// POST /api/admin/modulos/:moduloId/aulas/lote  (multipart: vários arquivos no campo "arquivos")
// Cada arquivo vira uma aula: título a partir do nome, tipo pela extensão e duração detectada.
async function enviarAulasEmLote(req, res) {
    const moduloId = exigirId(req.params.moduloId, "módulo");
    const modulo = await exigirModulo(moduloId);
    const arquivos = Array.isArray(req.files) ? req.files : [];
    if (arquivos.length === 0) {
        throw new ErroHttp(400, "Selecione pelo menos um arquivo.");
    }

    // Durações calculadas no navegador (opcional): { "nome-do-arquivo.mp4": 754, ... }
    let duracoes = {};
    try {
        duracoes = req.body.duracoes ? JSON.parse(req.body.duracoes) : {};
    } catch {
        duracoes = {};
    }
    const publicado = req.body.publicado === undefined ? 1 : (booleano(req.body.publicado) ? 1 : 0);

    const ordenados = [...arquivos].sort((a, b) => compararNatural(a.originalname, b.originalname));
    const preparados = [];
    for (const arquivo of ordenados) {
        const informada = Number(duracoes[arquivo.originalname]);
        const duracao = Number.isFinite(informada) && informada > 0 && informada <= 86400
            ? Math.round(informada)
            : await detectarDuracao(arquivo.path, arquivo.extensao);
        preparados.push({
            titulo: tituloAPartirDoArquivo(arquivo.originalname),
            tipo: tipoDeAulaPorExtensao(arquivo.extensao),
            arquivo: arquivo.filename,
            arquivo_nome: arquivo.originalname,
            arquivo_tamanho: arquivo.size,
            duracao
        });
    }

    let ordem = await proximaOrdem(moduloId);
    const criadas = await emTransacao(async (conexao) => {
        const ids = [];
        for (const aula of preparados) {
            const [resultado] = await conexao.query(
                `INSERT INTO aulas (modulo_id, titulo, tipo, arquivo, arquivo_nome, arquivo_tamanho, duracao_segundos, ordem, publicado)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [moduloId, aula.titulo, aula.tipo, aula.arquivo, aula.arquivo_nome, aula.arquivo_tamanho, aula.duracao, ordem++, publicado]
            );
            ids.push({ id: resultado.insertId, titulo: aula.titulo, tipo: aula.tipo });
        }
        return ids;
    });

    await registrarAuditoria(req, "aula.upload_lote", `${criadas.length} aula(s) enviadas em lote para "${modulo.curso_titulo}" › "${modulo.titulo}"`);
    res.status(201).json({ mensagem: `${criadas.length} aula(s) criada(s) com sucesso.`, aulas: criadas });
}

// ---------------------------------------------------------------------------
// Materiais de apoio (PDFs, planilhas, códigos...) anexados a uma aula
// ---------------------------------------------------------------------------

// POST /api/admin/aulas/:id/materiais  (multipart: "arquivos")
async function enviarMateriais(req, res) {
    const aulaId = exigirId(req.params.id);
    const [aulas] = await pool.query("SELECT titulo FROM aulas WHERE id = ?", [aulaId]);
    if (aulas.length === 0) {
        throw new ErroHttp(404, "Aula não encontrada.");
    }
    const arquivos = Array.isArray(req.files) ? req.files : [];
    if (arquivos.length === 0) {
        throw new ErroHttp(400, "Selecione pelo menos um arquivo.");
    }

    await pool.query(
        "INSERT INTO materiais (aula_id, nome, arquivo, tamanho) VALUES ?",
        [arquivos.map((arquivo) => [aulaId, arquivo.originalname, arquivo.filename, arquivo.size])]
    );
    await registrarAuditoria(req, "material.enviado", `${arquivos.length} material(is) anexado(s) à aula "${aulas[0].titulo}"`);
    res.status(201).json({ mensagem: `${arquivos.length} material(is) anexado(s).` });
}

// DELETE /api/admin/materiais/:id
async function excluirMaterial(req, res) {
    const id = exigirId(req.params.id);
    const [materiais] = await pool.query("SELECT nome, arquivo FROM materiais WHERE id = ?", [id]);
    if (materiais.length === 0) {
        return res.status(404).json({ mensagem: "Material não encontrado." });
    }
    await pool.query("DELETE FROM materiais WHERE id = ?", [id]);
    await removerArquivo(PASTAS.materiais, materiais[0].arquivo);
    await registrarAuditoria(req, "material.excluido", `Material "${materiais[0].nome}" excluído`);
    res.status(200).json({ mensagem: "Material excluído." });
}

export {
    listarAulas, buscarAulaPorID, cadastrarAula, atualizarAula, excluirAula, reordenarAulas, enviarAulasEmLote,
    enviarMateriais, excluirMaterial
};
