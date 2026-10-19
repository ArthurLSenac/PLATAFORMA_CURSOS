// =====================================================================
// Comunicação com a API (back-end) — TODO fetch do sistema passa por aqui.
//
// Fluxo: interface → requisicao() → fetch → API (Express) → MySQL
//        → resposta JSON → requisicao() devolve os dados para a tela.
//
// O JWT fica em um cookie httpOnly: o navegador envia sozinho
// (credentials: "include") e o JavaScript nunca tem acesso a ele.
// =====================================================================

// Se a página foi aberta pelo Live Server (porta 5500), a API está na porta 3000.
const PORTAS_DESENVOLVIMENTO = ["5500", "5501", "5173", "8080"];
const abertoPorArquivo = location.protocol === "file:";
export const ORIGEM_API = abertoPorArquivo
    ? "http://localhost:3000"
    : PORTAS_DESENVOLVIMENTO.includes(location.port)
        ? `${location.protocol}//${location.hostname}:3000`
        : "";
export const API = `${ORIGEM_API}/api`;

export class ErroApi extends Error {
    constructor(mensagem, status, dados = {}) {
        super(mensagem);
        this.status = status;
        this.codigo = dados?.codigo;
        this.dados = dados;
    }
}

function cabecalhosPadrao() {
    // X-Requested-With faz parte da proteção CSRF exigida pela API
    return { "X-Requested-With": "XMLHttpRequest", Accept: "application/json" };
}

async function lerResposta(resposta) {
    const tipo = resposta.headers.get("content-type") || "";
    if (tipo.includes("application/json")) return resposta.json();
    return resposta.text();
}

export async function requisicao(caminho, { metodo = "GET", corpo, formulario, sinal, manterViva = false } = {}) {
    const opcoes = {
        method: metodo,
        credentials: "include",
        headers: cabecalhosPadrao(),
        signal: sinal,
        keepalive: manterViva
    };
    if (corpo !== undefined) {
        opcoes.headers["Content-Type"] = "application/json";
        opcoes.body = JSON.stringify(corpo);
    }
    if (formulario) opcoes.body = formulario;

    let resposta;
    try {
        resposta = await fetch(API + caminho, opcoes);
    } catch (erro) {
        if (erro.name === "AbortError") throw erro;
        throw new ErroApi("Não foi possível conectar ao servidor. Verifique se a API está rodando (npm start).", 0);
    }

    const dados = await lerResposta(resposta);
    if (!resposta.ok) {
        const mensagem = (dados && dados.mensagem) || `Erro ${resposta.status} ao acessar ${caminho}`;
        const erro = new ErroApi(mensagem, resposta.status, dados);
        if (resposta.status === 401 || erro.codigo === "LOGIN_SUSPENSO" || erro.codigo?.startsWith("CONTA_")) {
            window.dispatchEvent(new CustomEvent("sessao-invalida", { detail: erro }));
        }
        throw erro;
    }
    return dados;
}

// Envio de arquivos com barra de progresso (o fetch não informa progresso de upload)
export function enviarComProgresso(caminho, formulario, { metodo = "POST", aoProgredir, sinal } = {}) {
    return new Promise((resolver, rejeitar) => {
        const xhr = new XMLHttpRequest();
        xhr.open(metodo, API + caminho);
        xhr.withCredentials = true;
        xhr.setRequestHeader("X-Requested-With", "XMLHttpRequest");
        xhr.setRequestHeader("Accept", "application/json");
        xhr.responseType = "json";

        xhr.upload.addEventListener("progress", (evento) => {
            if (evento.lengthComputable && aoProgredir) aoProgredir(Math.round((evento.loaded / evento.total) * 100));
        });
        xhr.addEventListener("load", () => {
            const dados = xhr.response || {};
            if (xhr.status >= 200 && xhr.status < 300) resolver(dados);
            else rejeitar(new ErroApi(dados.mensagem || `Erro ${xhr.status} no envio`, xhr.status, dados));
        });
        xhr.addEventListener("error", () => rejeitar(new ErroApi("Falha de conexão durante o envio.", 0)));
        xhr.addEventListener("abort", () => rejeitar(new ErroApi("Envio cancelado.", 0, { codigo: "CANCELADO" })));
        if (sinal) sinal.addEventListener("abort", () => xhr.abort());

        xhr.send(formulario);
    });
}

export const api = {
    get: (caminho, opcoes) => requisicao(caminho, opcoes),
    post: (caminho, corpo) => requisicao(caminho, { metodo: "POST", corpo }),
    put: (caminho, corpo, opcoes = {}) => requisicao(caminho, { metodo: "PUT", corpo, ...opcoes }),
    patch: (caminho, corpo) => requisicao(caminho, { metodo: "PATCH", corpo }),
    delete: (caminho) => requisicao(caminho, { metodo: "DELETE" }),
    enviar: (caminho, formulario, metodo = "POST") => requisicao(caminho, { metodo, formulario })
};

// Monta a URL completa de um arquivo servido pela API (capas, logo, vídeos)
export function urlArquivo(caminho) {
    if (!caminho) return "";
    if (/^https?:\/\//.test(caminho)) return caminho;
    return ORIGEM_API + caminho;
}
