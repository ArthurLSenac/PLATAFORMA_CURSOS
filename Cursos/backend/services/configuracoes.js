// Configurações do site (nome, logo, cores, rodapé, cadastros abertos...).
// Ficam na tabela "configuracoes" e são mantidas em memória (cache) para não
// consultar o banco a cada requisição. O cache é recarregado a cada alteração.
import { pool } from "../database/conexao.js";
import {
    ErroHttp, textoOpcional, exigirTexto, exigirCor, emailOpcional, urlSegura, booleano, escolha
} from "./validacao.js";

const REDES = ["instagram", "youtube", "linkedin", "github", "x", "facebook", "tiktok", "whatsapp"];

const DEFINICOES = {
    nome_site:              { tipo: "texto", min: 2, max: 60, padrao: "Lumina Academy", obrigatorio: true },
    slogan:                 { tipo: "texto", max: 120, padrao: "" },
    logo:                   { tipo: "arquivo", padrao: "" },
    favicon:                { tipo: "arquivo", padrao: "" },
    cor_primaria:           { tipo: "cor", padrao: "#7c5cff" },
    hero_titulo:            { tipo: "texto", max: 120, padrao: "Domine as habilidades que o mercado procura" },
    hero_subtitulo:         { tipo: "texto", max: 300, padrao: "" },
    rodape_texto:           { tipo: "texto", max: 400, padrao: "" },
    rodape_links:           { tipo: "links", padrao: [] },
    redes_sociais:          { tipo: "redes", padrao: {} },
    email_contato:          { tipo: "email", padrao: "" },
    registros_abertos:      { tipo: "bool", padrao: true },
    login_alunos:           { tipo: "bool", padrao: true },
    aviso_global:           { tipo: "texto", max: 240, padrao: "" },
    aviso_tipo:             { tipo: "escolha", opcoes: ["info", "sucesso", "alerta", "perigo"], padrao: "info" },
    certificado_assinatura: { tipo: "texto", max: 80, padrao: "Coordenação Pedagógica" }
};

let cache = null;

function lerValor(definicao, bruto) {
    if (bruto === null || bruto === undefined) return structuredClone(definicao.padrao);
    switch (definicao.tipo) {
        case "bool":
            return bruto === "1" || bruto === "true";
        case "links":
        case "redes":
            try {
                return JSON.parse(bruto);
            } catch {
                return structuredClone(definicao.padrao);
            }
        default:
            return bruto;
    }
}

function serializar(definicao, valor) {
    if (definicao.tipo === "bool") return valor ? "1" : "0";
    if (definicao.tipo === "links" || definicao.tipo === "redes") return JSON.stringify(valor);
    return valor ?? "";
}

function validarEntrada(chave, definicao, valor) {
    switch (definicao.tipo) {
        case "texto":
            if (definicao.obrigatorio) return exigirTexto(valor, chave, { min: definicao.min || 1, max: definicao.max });
            return textoOpcional(valor, chave, { max: definicao.max }) ?? "";
        case "cor":
            return exigirCor(valor, chave);
        case "email":
            return emailOpcional(valor);
        case "bool":
            return booleano(valor);
        case "escolha":
            return escolha(valor, definicao.opcoes, chave);
        case "links": {
            if (!Array.isArray(valor)) throw new ErroHttp(400, "rodape_links deve ser uma lista.");
            if (valor.length > 12) throw new ErroHttp(400, "Máximo de 12 links no rodapé.");
            return valor.map((link, i) => ({
                rotulo: exigirTexto(link?.rotulo, `rótulo do link ${i + 1}`, { max: 40 }),
                url: urlSegura(link?.url, `URL do link ${i + 1}`, { obrigatoria: true })
            }));
        }
        case "redes": {
            if (typeof valor !== "object" || valor === null || Array.isArray(valor)) {
                throw new ErroHttp(400, "redes_sociais deve ser um objeto.");
            }
            const redes = {};
            for (const rede of REDES) {
                const url = urlSegura(valor[rede], rede, { permitirRelativa: false });
                if (url) redes[rede] = url;
            }
            return redes;
        }
        default:
            throw new ErroHttp(400, `A configuração "${chave}" não pode ser alterada por aqui.`);
    }
}

export async function carregarConfiguracoes() {
    const [linhas] = await pool.query("SELECT chave, valor FROM configuracoes");
    const brutos = Object.fromEntries(linhas.map((linha) => [linha.chave, linha.valor]));
    const novo = {};
    for (const [chave, definicao] of Object.entries(DEFINICOES)) {
        novo[chave] = lerValor(definicao, brutos[chave]);
    }
    cache = novo;
    return cache;
}

export function obterConfiguracoes() {
    if (!cache) throw new Error("Configurações ainda não foram carregadas.");
    return cache;
}

export async function salvarConfiguracoes(entradas) {
    if (typeof entradas !== "object" || entradas === null) {
        throw new ErroHttp(400, "Envie as configurações em formato JSON.");
    }
    const alteradas = [];
    const valores = [];
    for (const [chave, valor] of Object.entries(entradas)) {
        const definicao = DEFINICOES[chave];
        if (!definicao || definicao.tipo === "arquivo") continue;
        const validado = validarEntrada(chave, definicao, valor);
        valores.push([chave, serializar(definicao, validado)]);
        alteradas.push(chave);
    }
    if (valores.length === 0) {
        throw new ErroHttp(400, "Nenhuma configuração válida foi enviada.");
    }
    await pool.query(
        "INSERT INTO configuracoes (chave, valor) VALUES ? ON DUPLICATE KEY UPDATE valor = VALUES(valor)",
        [valores]
    );
    await carregarConfiguracoes();
    return alteradas;
}

export async function definirConfiguracaoDeArquivo(chave, caminho) {
    await pool.query(
        "INSERT INTO configuracoes (chave, valor) VALUES (?, ?) ON DUPLICATE KEY UPDATE valor = VALUES(valor)",
        [chave, caminho || ""]
    );
    await carregarConfiguracoes();
}
