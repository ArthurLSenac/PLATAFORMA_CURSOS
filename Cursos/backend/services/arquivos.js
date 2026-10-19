// Gerenciamento de arquivos enviados (uploads).
//
// Regras de segurança:
//  • O nome salvo em disco é SEMPRE gerado pelo servidor (UUID) — nunca o nome enviado pelo usuário.
//  • Apenas extensões de uma lista branca são aceitas (SVG/HTML/JS nunca são aceitos).
//  • O conteúdo real é conferido pela "assinatura" (magic bytes) dos primeiros bytes do arquivo,
//    então renomear um .exe para .mp4 não funciona.
//  • Vídeos, áudios e materiais ficam em uploads/privado e só saem por rotas que exigem login.
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = fileURLToPath(new URL("../uploads/", import.meta.url));

export const PASTAS = {
    raizPublica: path.join(RAIZ, "publico"),
    capas: path.join(RAIZ, "publico", "capas"),
    marca: path.join(RAIZ, "publico", "marca"),
    avatares: path.join(RAIZ, "publico", "avatares"),
    aulas: path.join(RAIZ, "privado", "aulas"),
    materiais: path.join(RAIZ, "privado", "materiais"),
    temporarios: path.join(RAIZ, "privado", "temporarios")
};

export const EXTENSOES = {
    imagem: [".png", ".jpg", ".jpeg", ".webp", ".gif"],
    favicon: [".png", ".ico", ".webp", ".jpg", ".jpeg", ".gif"],
    video: [".mp4", ".webm", ".mov", ".m4v", ".ogv"],
    audio: [".mp3", ".m4a", ".wav", ".ogg", ".oga", ".aac"],
    documento: [
        ".pdf", ".zip", ".docx", ".xlsx", ".pptx", ".odt", ".ods", ".odp",
        ".doc", ".xls", ".ppt", ".txt", ".md", ".csv", ".json", ".epub"
    ],
    texto: [".md", ".txt"],
    zip: [".zip"]
};

export const EXTENSOES_AULA = [...EXTENSOES.video, ...EXTENSOES.audio, ...EXTENSOES.documento];

export async function prepararPastasUpload() {
    for (const pasta of Object.values(PASTAS)) {
        await fsp.mkdir(pasta, { recursive: true });
    }
}

export function extensaoDe(nomeArquivo) {
    return path.extname(String(nomeArquivo || "")).toLowerCase();
}

// Deixa o nome original seguro para exibir/baixar (sem pastas, sem caracteres de controle)
export function nomeOriginalSeguro(nome) {
    const base = path.basename(String(nome || "arquivo").replace(/\\/g, "/"));
    const limpo = base.replace(/[\u0000-\u001F\u007F"<>|:*?]/g, "").trim();
    return (limpo || "arquivo").slice(0, 200);
}

// "03 - introducao_ao_curso"  →  "Introducao ao curso"
function limparTitulo(texto, padrao) {
    let titulo = texto
        .replace(/^\s*(aula|modulo|módulo|parte)?\s*\d+\s*[-_.)–:]*\s*/i, "")
        .replace(/[_]+/g, " ")
        .replace(/\s+/g, " ")
        .trim();
    if (!titulo) titulo = texto.replace(/[_]+/g, " ").trim() || padrao;
    return (titulo.charAt(0).toUpperCase() + titulo.slice(1)).slice(0, 160);
}

// "03 - introducao_ao_curso.mp4"  →  "Introducao ao curso"
export function tituloAPartirDoArquivo(nome) {
    return limparTitulo(nomeOriginalSeguro(nome).replace(/\.[^.]+$/, ""), "Aula");
}

// "02 - Fundamentos"  →  "Fundamentos"
export function tituloAPartirDaPasta(nome) {
    return limparTitulo(String(nome || "").replace(/[\u0000-\u001F\u007F]/g, ""), "Módulo");
}

export function compararNatural(a, b) {
    return a.localeCompare(b, "pt-BR", { numeric: true, sensitivity: "base" });
}

// Descobre qual tipo de aula um arquivo representa a partir da extensão
export function tipoDeAulaPorExtensao(extensao) {
    if (EXTENSOES.video.includes(extensao)) return "video";
    if (EXTENSOES.audio.includes(extensao)) return "audio";
    if (EXTENSOES.documento.includes(extensao)) return "arquivo";
    return null;
}

// ---------------------------------------------------------------------------
// Assinaturas (magic bytes)
// ---------------------------------------------------------------------------
function comeca(buffer, bytes, deslocamento = 0) {
    return bytes.every((byte, i) => buffer[deslocamento + i] === byte);
}
const ascii = (texto) => [...Buffer.from(texto, "latin1")];

const ehFtyp = (b) => b.length >= 12 && b.toString("latin1", 4, 8) === "ftyp";
const ehZip = (b) => comeca(b, [0x50, 0x4b, 0x03, 0x04]) || comeca(b, [0x50, 0x4b, 0x05, 0x06]);
const ehOle = (b) => comeca(b, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
const ehEbml = (b) => comeca(b, [0x1a, 0x45, 0xdf, 0xa3]);
const ehOgg = (b) => comeca(b, ascii("OggS"));
const ehTexto = (b) => !b.includes(0x00);

const VERIFICADORES = {
    ".png": (b) => comeca(b, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    ".jpg": (b) => comeca(b, [0xff, 0xd8, 0xff]),
    ".jpeg": (b) => comeca(b, [0xff, 0xd8, 0xff]),
    ".gif": (b) => comeca(b, ascii("GIF8")),
    ".webp": (b) => comeca(b, ascii("RIFF")) && comeca(b, ascii("WEBP"), 8),
    ".ico": (b) => comeca(b, [0x00, 0x00, 0x01, 0x00]),
    ".mp4": ehFtyp,
    ".m4v": ehFtyp,
    ".m4a": ehFtyp,
    ".mov": (b) => ehFtyp(b) || ["moov", "mdat", "wide", "free", "skip", "pnot"].includes(b.toString("latin1", 4, 8)),
    ".webm": ehEbml,
    ".ogv": ehOgg,
    ".ogg": ehOgg,
    ".oga": ehOgg,
    ".mp3": (b) => comeca(b, ascii("ID3")) || (b[0] === 0xff && (b[1] & 0xe0) === 0xe0),
    ".aac": (b) => comeca(b, ascii("ID3")) || (b[0] === 0xff && (b[1] & 0xf6) === 0xf0),
    ".wav": (b) => comeca(b, ascii("RIFF")) && comeca(b, ascii("WAVE"), 8),
    ".pdf": (b) => b.subarray(0, 1024).includes(Buffer.from("%PDF-")),
    ".zip": ehZip,
    ".docx": ehZip,
    ".xlsx": ehZip,
    ".pptx": ehZip,
    ".odt": ehZip,
    ".ods": ehZip,
    ".odp": ehZip,
    ".epub": ehZip,
    ".doc": ehOle,
    ".xls": ehOle,
    ".ppt": ehOle,
    ".txt": ehTexto,
    ".md": ehTexto,
    ".csv": ehTexto,
    ".json": ehTexto
};

export async function conteudoConfereComExtensao(caminho, extensao) {
    const verificador = VERIFICADORES[extensao];
    if (!verificador) return false;
    const arquivo = await fsp.open(caminho, "r");
    try {
        const buffer = Buffer.alloc(8192);
        const { bytesRead } = await arquivo.read(buffer, 0, buffer.length, 0);
        if (bytesRead === 0) return false;
        return verificador(buffer.subarray(0, bytesRead));
    } finally {
        await arquivo.close();
    }
}

// ---------------------------------------------------------------------------
// Caminhos públicos (/uploads/...) ↔ pastas em disco
// ---------------------------------------------------------------------------
const REGEX_PUBLICO = /^\/uploads\/(capas|marca|avatares)\/([a-f0-9-]{36}\.[a-z0-9]{2,5})$/;

export function caminhoPublico(subpasta, nomeArquivo) {
    return `/uploads/${subpasta}/${nomeArquivo}`;
}

export async function removerArquivoPublico(urlPublica) {
    const partes = REGEX_PUBLICO.exec(String(urlPublica || ""));
    if (!partes) return;
    await removerArquivo(PASTAS[partes[1]], partes[2]);
}

export async function removerArquivo(pasta, nomeArquivo) {
    if (!nomeArquivo) return;
    try {
        await fsp.unlink(path.join(pasta, path.basename(nomeArquivo)));
    } catch (erro) {
        if (erro.code !== "ENOENT") console.error("Não foi possível remover arquivo:", erro.message);
    }
}

export async function removerVarios(pasta, nomes) {
    await Promise.all(nomes.filter(Boolean).map((nome) => removerArquivo(pasta, nome)));
}

export function caminhoPrivado(pasta, nomeArquivo) {
    return path.join(pasta, path.basename(nomeArquivo));
}

export async function copiarArquivoPrivado(pasta, nomeArquivo, novoNome) {
    await fsp.copyFile(caminhoPrivado(pasta, nomeArquivo), path.join(pasta, novoNome));
}

export async function tamanhoDaPasta(pasta) {
    let total = 0;
    let quantidade = 0;
    let itens = [];
    try {
        itens = await fsp.readdir(pasta, { withFileTypes: true });
    } catch {
        return { total, quantidade };
    }
    for (const item of itens) {
        const caminho = path.join(pasta, item.name);
        if (item.isDirectory()) {
            const sub = await tamanhoDaPasta(caminho);
            total += sub.total;
            quantidade += sub.quantidade;
        } else if (item.isFile() && !item.name.startsWith(".")) {
            const info = await fsp.stat(caminho);
            total += info.size;
            quantidade += 1;
        }
    }
    return { total, quantidade };
}

// ---------------------------------------------------------------------------
// Duração de vídeos MP4/MOV/M4A lendo o átomo "mvhd" (sem depender de ffmpeg)
// ---------------------------------------------------------------------------
async function lerCaixa(arquivo, posicao, tamanhoArquivo) {
    const buffer = Buffer.alloc(16);
    const { bytesRead } = await arquivo.read(buffer, 0, 16, posicao);
    if (bytesRead < 8) return null;
    let tamanho = buffer.readUInt32BE(0);
    const tipo = buffer.toString("latin1", 4, 8);
    let cabecalho = 8;
    if (tamanho === 1 && bytesRead >= 16) {
        tamanho = Number(buffer.readBigUInt64BE(8));
        cabecalho = 16;
    } else if (tamanho === 0) {
        tamanho = tamanhoArquivo - posicao;
    }
    if (tamanho < cabecalho) return null;
    return { tipo, tamanho, cabecalho };
}

export async function lerDuracaoMp4(caminho) {
    let arquivo;
    try {
        arquivo = await fsp.open(caminho, "r");
        const { size } = await arquivo.stat();
        let posicao = 0;
        while (posicao + 8 <= size) {
            const caixa = await lerCaixa(arquivo, posicao, size);
            if (!caixa) return 0;
            if (caixa.tipo === "moov") {
                let interna = posicao + caixa.cabecalho;
                const fim = posicao + caixa.tamanho;
                while (interna + 8 <= fim) {
                    const filha = await lerCaixa(arquivo, interna, size);
                    if (!filha) return 0;
                    if (filha.tipo === "mvhd") {
                        const buffer = Buffer.alloc(40);
                        await arquivo.read(buffer, 0, 40, interna);
                        const versao = buffer.readUInt8(8);
                        const escala = versao === 1 ? buffer.readUInt32BE(28) : buffer.readUInt32BE(20);
                        const duracao = versao === 1 ? Number(buffer.readBigUInt64BE(32)) : buffer.readUInt32BE(24);
                        return escala ? Math.round(duracao / escala) : 0;
                    }
                    interna += filha.tamanho;
                }
                return 0;
            }
            posicao += caixa.tamanho;
        }
        return 0;
    } catch {
        return 0;
    } finally {
        await arquivo?.close();
    }
}

export async function detectarDuracao(caminho, extensao) {
    if ([".mp4", ".m4v", ".mov", ".m4a"].includes(extensao)) {
        return lerDuracaoMp4(caminho);
    }
    return 0;
}

export function existeArquivo(caminho) {
    return fs.existsSync(caminho);
}
