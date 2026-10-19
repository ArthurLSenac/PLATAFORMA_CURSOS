// Importação em massa: transforma um .zip em módulos e aulas de um curso (novo ou existente).
import fsp from "node:fs/promises";
import path from "node:path";
import { pool, emTransacao } from "../database/conexao.js";
import { registrarAuditoria } from "../services/auditoria.js";
import { extrairZip } from "../services/importadorZip.js";
import {
    PASTAS, tituloAPartirDoArquivo, tituloAPartirDaPasta, compararNatural, detectarDuracao, removerVarios
} from "../services/arquivos.js";
import { ErroHttp, idOpcional, textoOpcional, booleano } from "../services/validacao.js";

const MODULO_PADRAO = "Conteúdo geral";

// Organiza os arquivos extraídos em módulos (1º nível de pasta) e aulas (arquivos)
function montarEstrutura(extraidos) {
    // Se tudo estiver dentro de uma única pasta raiz (ex.: "MeuCurso/01 - Intro/aula.mp4"), ignora essa raiz
    const raizes = new Set(extraidos.map((item) => (item.partes.length > 1 ? item.partes[0] : "")));
    const temRaizUnica = raizes.size === 1 && !raizes.has("") && extraidos.some((item) => item.partes.length > 2);
    const itens = temRaizUnica ? extraidos.map((item) => ({ ...item, partes: item.partes.slice(1) })) : extraidos;

    const modulos = new Map();
    for (const item of itens) {
        const pasta = item.partes.length > 1 ? item.partes[0] : "";
        if (!modulos.has(pasta)) modulos.set(pasta, []);
        modulos.get(pasta).push(item);
    }

    return [...modulos.entries()]
        .sort(([a], [b]) => (a === "" ? -1 : b === "" ? 1 : compararNatural(a, b)))
        .map(([pasta, aulas]) => ({
            titulo: pasta ? tituloAPartirDaPasta(pasta) : MODULO_PADRAO,
            aulas: aulas.sort((a, b) => compararNatural(a.partes.join("/"), b.partes.join("/")))
        }));
}

// POST /api/admin/importacao/zip  (multipart: "arquivo" .zip, "curso_id" opcional, "titulo" opcional)
async function importarZip(req, res) {
    if (!req.file) throw new ErroHttp(400, "Selecione um arquivo .zip.");

    const cursoIdInformado = idOpcional(req.body.curso_id, "curso");
    const publicar = booleano(req.body.publicar);
    let extraidos = [];
    let ignorados = [];

    try {
        let curso = null;
        if (cursoIdInformado) {
            const [cursos] = await pool.query("SELECT id, titulo FROM cursos WHERE id = ?", [cursoIdInformado]);
            if (cursos.length === 0) throw new ErroHttp(404, "Curso de destino não encontrado.");
            curso = cursos[0];
        }

        const resultado = await extrairZip(req.file.path);
        extraidos = resultado.extraidos;
        ignorados = resultado.ignorados;
        if (extraidos.length === 0) {
            throw new ErroHttp(400, "Nenhum arquivo compatível foi encontrado no ZIP (vídeos, áudios, PDFs, documentos ou textos .md/.txt).");
        }

        const estrutura = montarEstrutura(extraidos);
        for (const modulo of estrutura) {
            for (const aula of modulo.aulas) {
                aula.duracao = aula.arquivo ? await detectarDuracao(path.join(PASTAS.aulas, aula.arquivo), aula.extensao) : 0;
                if (aula.tipo === "texto") {
                    aula.duracao = Math.max(60, Math.round(aula.conteudo.split(/\s+/).length / 200) * 60);
                }
            }
        }

        const resumo = await emTransacao(async (conexao) => {
            let cursoId = curso?.id;
            let cursoCriado = false;
            if (!cursoId) {
                const titulo = textoOpcional(req.body.titulo, "título", { max: 160 }) || tituloAPartirDoArquivo(req.file.originalname);
                const [novo] = await conexao.query(
                    "INSERT INTO cursos (titulo, resumo, nivel, publicado) VALUES (?, ?, 'iniciante', ?)",
                    [titulo, "Curso importado a partir de arquivo ZIP.", publicar ? 1 : 0]
                );
                cursoId = novo.insertId;
                cursoCriado = true;
                curso = { id: cursoId, titulo };
            }

            const [[{ ordemModulo }]] = await conexao.query(
                "SELECT COALESCE(MAX(ordem), 0) AS ordemModulo FROM modulos WHERE curso_id = ?",
                [cursoId]
            );
            let proximaOrdemModulo = ordemModulo + 1;
            let modulosCriados = 0;
            let aulasCriadas = 0;

            for (const modulo of estrutura) {
                // Se já existir um módulo com o mesmo título no curso, as aulas são adicionadas a ele
                const [existentes] = await conexao.query(
                    "SELECT id FROM modulos WHERE curso_id = ? AND titulo = ? LIMIT 1",
                    [cursoId, modulo.titulo]
                );
                let moduloId = existentes[0]?.id;
                if (!moduloId) {
                    const [novoModulo] = await conexao.query(
                        "INSERT INTO modulos (curso_id, titulo, ordem) VALUES (?, ?, ?)",
                        [cursoId, modulo.titulo, proximaOrdemModulo++]
                    );
                    moduloId = novoModulo.insertId;
                    modulosCriados += 1;
                }

                const [[{ ordemAula }]] = await conexao.query(
                    "SELECT COALESCE(MAX(ordem), 0) AS ordemAula FROM aulas WHERE modulo_id = ?",
                    [moduloId]
                );
                let proximaOrdemAula = ordemAula + 1;
                for (const aula of modulo.aulas) {
                    await conexao.query(
                        `INSERT INTO aulas (modulo_id, titulo, tipo, arquivo, arquivo_nome, arquivo_tamanho, conteudo, duracao_segundos, ordem, publicado)
                         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
                        [moduloId, tituloAPartirDoArquivo(aula.nomeArquivo), aula.tipo, aula.arquivo,
                            aula.arquivo ? aula.nomeArquivo.slice(0, 200) : null, aula.arquivo ? aula.tamanho : null,
                            aula.conteudo, aula.duracao, proximaOrdemAula++]
                    );
                    aulasCriadas += 1;
                }
            }
            return { cursoId, cursoCriado, modulosCriados, aulasCriadas };
        });

        await registrarAuditoria(
            req,
            "importacao.zip",
            `ZIP "${req.file.originalname}" importado em "${curso.titulo}": ${resumo.modulosCriados} módulo(s), ${resumo.aulasCriadas} aula(s)`
        );

        res.status(201).json({
            mensagem: `Importação concluída: ${resumo.modulosCriados} módulo(s) e ${resumo.aulasCriadas} aula(s) criados.`,
            curso_id: resumo.cursoId,
            curso_criado: resumo.cursoCriado,
            modulos_criados: resumo.modulosCriados,
            aulas_criadas: resumo.aulasCriadas,
            ignorados
        });
    } catch (erro) {
        await removerVarios(PASTAS.aulas, extraidos.map((item) => item.arquivo));
        throw erro;
    } finally {
        await fsp.unlink(req.file.path).catch(() => {});
    }
}

export { importarZip };
