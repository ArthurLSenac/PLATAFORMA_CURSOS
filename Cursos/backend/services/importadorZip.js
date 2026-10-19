// Importação de um curso inteiro a partir de um arquivo .zip.
//
// Estrutura esperada (cada pasta vira um MÓDULO e cada arquivo vira uma AULA):
//
//   meu-curso.zip
//   ├── 01 - Introdução/
//   │   ├── 01 - Boas-vindas.mp4        → aula de vídeo
//   │   ├── 02 - Apostila.pdf           → aula de arquivo
//   │   └── 03 - Leitura.md             → aula de texto
//   └── 02 - Fundamentos/
//       └── ...
//
// Proteções: limite de entradas, de tamanho total e por arquivo, nomes nunca usados
// como caminho em disco (evita "zip slip"), conteúdo conferido por magic bytes.
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { pipeline } from "node:stream/promises";
import yauzl from "yauzl";
import { config } from "../config/ambiente.js";
import { ErroHttp } from "./validacao.js";
import {
    PASTAS, EXTENSOES, extensaoDe, tipoDeAulaPorExtensao, conteudoConfereComExtensao, removerVarios
} from "./arquivos.js";

const MB = 1024 * 1024;
const MAX_ENTRADAS = 2000;
const MAX_TEXTO = 1 * MB;
const decodificadorUtf8 = new TextDecoder("utf-8", { fatal: true });

function abrirZip(caminho) {
    return new Promise((resolver, rejeitar) => {
        yauzl.open(
            caminho,
            { lazyEntries: true, autoClose: true, decodeStrings: false, validateEntrySizes: true },
            (erro, zip) => (erro ? rejeitar(new ErroHttp(400, "Arquivo ZIP inválido ou corrompido.")) : resolver(zip))
        );
    });
}

function abrirLeitura(zip, entrada) {
    return new Promise((resolver, rejeitar) => {
        zip.openReadStream(entrada, (erro, fluxo) => (erro ? rejeitar(erro) : resolver(fluxo)));
    });
}

// Decodifica o nome respeitando o padrão ZIP e aceitando UTF-8 sem a flag (comum no Windows)
function decodificarNome(entrada) {
    const bruto = entrada.fileName;
    const temFlagUtf8 = (entrada.generalPurposeBitFlag & 0x800) !== 0;
    if (!temFlagUtf8) {
        try {
            return decodificadorUtf8.decode(bruto);
        } catch {
            // não é UTF-8 válido: usa a decodificação padrão (CP437)
        }
    }
    return yauzl.getFileNameLowLevel(entrada.generalPurposeBitFlag, bruto, entrada.extraFields, false);
}

async function lerTexto(fluxo) {
    const partes = [];
    let total = 0;
    for await (const parte of fluxo) {
        total += parte.length;
        if (total > MAX_TEXTO) throw new ErroHttp(413, "Arquivo de texto muito grande dentro do ZIP.");
        partes.push(parte);
    }
    const buffer = Buffer.concat(partes);
    if (buffer.includes(0x00)) return null;
    return buffer.toString("utf8").replace(/^﻿/, "");
}

function limiteDoTipo(tipo) {
    if (tipo === "video" || tipo === "audio") return config.uploads.maxVideoMB * MB;
    if (tipo === "texto") return MAX_TEXTO;
    return config.uploads.maxArquivoMB * MB;
}

// Percorre o ZIP extraindo os arquivos suportados para a pasta privada de aulas.
export async function extrairZip(caminhoZip) {
    const zip = await abrirZip(caminhoZip);
    const extraidos = [];
    const ignorados = [];
    const limiteTotal = config.uploads.maxZipMB * MB;
    let totalBytes = 0;
    let entradas = 0;

    return new Promise((resolver, rejeitar) => {
        let finalizado = false;

        const falhar = async (erro) => {
            if (finalizado) return;
            finalizado = true;
            zip.close();
            await removerVarios(PASTAS.aulas, extraidos.map((item) => item.arquivo));
            rejeitar(erro instanceof ErroHttp ? erro : new ErroHttp(400, `Não foi possível ler o ZIP: ${erro.message}`));
        };

        zip.on("error", falhar);
        zip.on("end", () => {
            if (finalizado) return;
            finalizado = true;
            resolver({ extraidos, ignorados });
        });

        zip.on("entry", async (entrada) => {
            try {
                entradas += 1;
                if (entradas > MAX_ENTRADAS) {
                    throw new ErroHttp(400, `O ZIP possui itens demais (máximo de ${MAX_ENTRADAS}).`);
                }

                const nomeCompleto = decodificarNome(entrada).replace(/\\/g, "/");
                if (nomeCompleto.endsWith("/")) return zip.readEntry(); // pasta

                const partes = nomeCompleto.split("/").map((parte) => parte.trim()).filter((parte) => parte && parte !== "." && parte !== "..");
                const nomeArquivo = partes.at(-1);
                if (!nomeArquivo || partes.some((parte) => parte.startsWith(".") || parte === "__MACOSX")
                    || ["thumbs.db", "desktop.ini"].includes(nomeArquivo.toLowerCase())) {
                    return zip.readEntry();
                }

                const extensao = extensaoDe(nomeArquivo);
                const tipo = EXTENSOES.texto.includes(extensao) ? "texto" : tipoDeAulaPorExtensao(extensao);
                if (!tipo) {
                    ignorados.push(`${nomeCompleto} (formato não suportado)`);
                    return zip.readEntry();
                }
                if (entrada.isEncrypted()) {
                    ignorados.push(`${nomeCompleto} (protegido por senha)`);
                    return zip.readEntry();
                }
                if (entrada.uncompressedSize > limiteDoTipo(tipo)) {
                    ignorados.push(`${nomeCompleto} (acima do tamanho permitido)`);
                    return zip.readEntry();
                }
                totalBytes += entrada.uncompressedSize;
                if (totalBytes > limiteTotal) {
                    throw new ErroHttp(413, `O conteúdo descompactado ultrapassa ${config.uploads.maxZipMB} MB.`);
                }

                const fluxo = await abrirLeitura(zip, entrada);
                if (tipo === "texto") {
                    const conteudo = await lerTexto(fluxo);
                    if (conteudo === null || !conteudo.trim()) {
                        ignorados.push(`${nomeCompleto} (texto vazio ou inválido)`);
                    } else {
                        extraidos.push({ partes, nomeArquivo, extensao, tipo, conteudo, arquivo: null, tamanho: 0 });
                    }
                } else {
                    // O nome em disco é gerado aqui — o caminho do ZIP NUNCA é usado (protege contra zip slip)
                    const gerado = `${crypto.randomUUID()}${extensao}`;
                    const destino = path.join(PASTAS.aulas, gerado);
                    await pipeline(fluxo, fs.createWriteStream(destino, { flags: "wx" }));
                    if (await conteudoConfereComExtensao(destino, extensao)) {
                        extraidos.push({ partes, nomeArquivo, extensao, tipo, conteudo: null, arquivo: gerado, tamanho: entrada.uncompressedSize });
                    } else {
                        await fsp.unlink(destino).catch(() => {});
                        ignorados.push(`${nomeCompleto} (conteúdo não corresponde à extensão)`);
                    }
                }
                zip.readEntry();
            } catch (erro) {
                await falhar(erro);
            }
        });

        zip.readEntry();
    });
}
