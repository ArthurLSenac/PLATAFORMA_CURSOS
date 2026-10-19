// Configuração dos uploads (multer) para cada tipo de arquivo do sistema.
// Cada exportação é uma lista de middlewares pronta para usar na rota:
//   router.post("/", uploadCapa, cadastrarCurso);
import multer from "multer";
import crypto from "node:crypto";
import fsp from "node:fs/promises";
import { config } from "../config/ambiente.js";
import {
    PASTAS, EXTENSOES, EXTENSOES_AULA, extensaoDe, conteudoConfereComExtensao, nomeOriginalSeguro
} from "../services/arquivos.js";
import { ErroHttp } from "../services/validacao.js";

const MB = 1024 * 1024;

function arquivosDaRequisicao(req) {
    if (req.file) return [req.file];
    if (Array.isArray(req.files)) return req.files;
    if (req.files && typeof req.files === "object") return Object.values(req.files).flat();
    return [];
}

async function apagarArquivos(arquivos) {
    await Promise.all(arquivos.map((arquivo) => fsp.unlink(arquivo.path).catch(() => {})));
}

// Se a requisição terminar com erro (status >= 400), apaga o que foi enviado
function descartarSeFalhar(req, res, next) {
    res.on("finish", () => {
        if (res.statusCode >= 400) {
            apagarArquivos(arquivosDaRequisicao(req));
        }
    });
    next();
}

function criarMulter({ pasta, extensoes, maxMB, maxArquivos }) {
    return multer({
        storage: multer.diskStorage({
            destination: pasta,
            // Nome aleatório gerado pelo servidor + extensão da lista branca
            filename: (req, file, callback) => {
                callback(null, `${crypto.randomUUID()}${extensaoDe(file.originalname)}`);
            }
        }),
        defParamCharset: "utf8",
        limits: {
            fileSize: maxMB * MB,
            files: maxArquivos,
            fields: 40,
            fieldSize: 4 * MB,
            parts: maxArquivos + 40
        },
        fileFilter(req, file, callback) {
            const extensao = extensaoDe(file.originalname);
            if (!extensoes.includes(extensao)) {
                return callback(new ErroHttp(
                    415,
                    `Formato "${extensao || "sem extensão"}" não permitido para "${nomeOriginalSeguro(file.originalname)}". Aceitos: ${extensoes.join(", ")}`
                ));
            }
            callback(null, true);
        }
    });
}

// Depois do upload: confere o conteúdo real (magic bytes) e os limites por categoria
function validarConteudo({ limiteDocumentoMB } = {}) {
    return async function (req, res, next) {
        const arquivos = arquivosDaRequisicao(req);
        for (const arquivo of arquivos) {
            arquivo.originalname = nomeOriginalSeguro(arquivo.originalname);
            arquivo.extensao = extensaoDe(arquivo.originalname);

            const confere = await conteudoConfereComExtensao(arquivo.path, arquivo.extensao);
            if (!confere) {
                await apagarArquivos(arquivos);
                throw new ErroHttp(415, `O conteúdo de "${arquivo.originalname}" não corresponde a um arquivo ${arquivo.extensao} válido.`);
            }

            if (limiteDocumentoMB && EXTENSOES.documento.includes(arquivo.extensao) && arquivo.size > limiteDocumentoMB * MB) {
                await apagarArquivos(arquivos);
                throw new ErroHttp(413, `"${arquivo.originalname}" excede o limite de ${limiteDocumentoMB} MB para documentos.`);
            }
        }
        next();
    };
}

function montar({ pasta, extensoes, maxMB, campo, maxArquivos = 1, limiteDocumentoMB }) {
    const enviar = criarMulter({ pasta, extensoes, maxMB, maxArquivos });
    const receber = maxArquivos === 1 ? enviar.single(campo) : enviar.array(campo, maxArquivos);
    return [
        (req, res, next) => {
            req.limiteUploadMB = maxMB;
            next();
        },
        descartarSeFalhar,
        receber,
        validarConteudo({ limiteDocumentoMB })
    ];
}

const { maxImagemMB, maxVideoMB, maxArquivoMB, maxZipMB } = config.uploads;
const maxAulaMB = Math.max(maxVideoMB, maxArquivoMB);

export const uploadCapa = montar({ pasta: PASTAS.capas, extensoes: EXTENSOES.imagem, maxMB: maxImagemMB, campo: "capa" });
export const uploadAvatar = montar({ pasta: PASTAS.avatares, extensoes: EXTENSOES.imagem, maxMB: maxImagemMB, campo: "avatar" });
export const uploadLogo = montar({ pasta: PASTAS.marca, extensoes: EXTENSOES.imagem, maxMB: maxImagemMB, campo: "arquivo" });
export const uploadFavicon = montar({ pasta: PASTAS.marca, extensoes: EXTENSOES.favicon, maxMB: 1, campo: "arquivo" });

export const uploadAula = montar({
    pasta: PASTAS.aulas, extensoes: EXTENSOES_AULA, maxMB: maxAulaMB, campo: "arquivo", limiteDocumentoMB: maxArquivoMB
});

export const uploadAulasEmLote = montar({
    pasta: PASTAS.aulas, extensoes: EXTENSOES_AULA, maxMB: maxAulaMB, campo: "arquivos", maxArquivos: 50, limiteDocumentoMB: maxArquivoMB
});

export const uploadMateriais = montar({
    pasta: PASTAS.materiais,
    extensoes: [...EXTENSOES.documento, ...EXTENSOES.imagem, ...EXTENSOES.audio],
    maxMB: maxArquivoMB,
    campo: "arquivos",
    maxArquivos: 20
});

export const uploadZip = montar({ pasta: PASTAS.temporarios, extensoes: EXTENSOES.zip, maxMB: maxZipMB, campo: "arquivo" });
