// Funções de validação reutilizadas pelos controllers.
// Quando um dado é inválido lançamos um ErroHttp: o middleware de erros
// (middlewares/erros.js) transforma isso em uma resposta JSON { mensagem }.

export class ErroHttp extends Error {
    constructor(status, mensagem, extra = {}) {
        super(mensagem);
        this.status = status;
        this.extra = extra;
    }
}

const REGEX_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const REGEX_COR = /^#[0-9a-fA-F]{6}$/;

function comoTexto(valor) {
    if (valor === undefined || valor === null) return "";
    // Remove caracteres de controle invisíveis (mantém quebras de linha e tab)
    return String(valor).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").trim();
}

export function exigirTexto(valor, campo, { min = 1, max = 255 } = {}) {
    const texto = comoTexto(valor);
    if (texto.length === 0) {
        throw new ErroHttp(400, `O campo "${campo}" é obrigatório.`);
    }
    if (texto.length < min) {
        throw new ErroHttp(400, `O campo "${campo}" deve ter pelo menos ${min} caracteres.`);
    }
    if (texto.length > max) {
        throw new ErroHttp(400, `O campo "${campo}" deve ter no máximo ${max} caracteres.`);
    }
    return texto;
}

export function textoOpcional(valor, campo, { max = 255 } = {}) {
    const texto = comoTexto(valor);
    if (!texto) return null;
    if (texto.length > max) {
        throw new ErroHttp(400, `O campo "${campo}" deve ter no máximo ${max} caracteres.`);
    }
    return texto;
}

export function exigirNome(valor) {
    const nome = exigirTexto(valor, "nome", { min: 2, max: 120 }).replace(/\s+/g, " ");
    if (!/^[\p{L}\p{M}' .-]+$/u.test(nome)) {
        throw new ErroHttp(400, "O nome deve conter apenas letras, espaços, apóstrofos ou hífens.");
    }
    return nome;
}

export function exigirEmail(valor) {
    const email = comoTexto(valor).toLowerCase();
    if (!email) throw new ErroHttp(400, 'O campo "e-mail" é obrigatório.');
    if (email.length > 190 || !REGEX_EMAIL.test(email)) {
        throw new ErroHttp(400, "Informe um e-mail válido.");
    }
    return email;
}

export function emailOpcional(valor) {
    const email = comoTexto(valor).toLowerCase();
    if (!email) return "";
    if (email.length > 190 || !REGEX_EMAIL.test(email)) {
        throw new ErroHttp(400, "Informe um e-mail válido.");
    }
    return email;
}

export function exigirId(valor, campo = "id") {
    const numero = Number(valor);
    if (!Number.isInteger(numero) || numero <= 0 || numero > 2147483647) {
        throw new ErroHttp(400, `Identificador "${campo}" inválido.`);
    }
    return numero;
}

export function idOpcional(valor, campo = "id") {
    if (valor === undefined || valor === null || valor === "" || valor === "null") return null;
    return exigirId(valor, campo);
}

export function booleano(valor) {
    return valor === true || valor === 1 || valor === "1" || valor === "true" || valor === "on";
}

export function inteiro(valor, campo, { min = 0, max = 2147483647, padrao = 0 } = {}) {
    if (valor === undefined || valor === null || valor === "") return padrao;
    const numero = Number(valor);
    if (!Number.isFinite(numero)) {
        throw new ErroHttp(400, `O campo "${campo}" deve ser um número.`);
    }
    const arredondado = Math.round(numero);
    if (arredondado < min || arredondado > max) {
        throw new ErroHttp(400, `O campo "${campo}" deve estar entre ${min} e ${max}.`);
    }
    return arredondado;
}

export function escolha(valor, opcoes, campo, padrao) {
    if ((valor === undefined || valor === null || valor === "") && padrao !== undefined) return padrao;
    if (!opcoes.includes(valor)) {
        throw new ErroHttp(400, `Valor inválido para "${campo}". Opções: ${opcoes.join(", ")}.`);
    }
    return valor;
}

export function exigirCor(valor, campo = "cor") {
    const cor = comoTexto(valor);
    if (!REGEX_COR.test(cor)) {
        throw new ErroHttp(400, `O campo "${campo}" deve ser uma cor no formato #RRGGBB.`);
    }
    return cor.toLowerCase();
}

// Aceita apenas links http(s) ou caminhos internos começando com "/".
// Bloqueia "javascript:", "data:" e similares (proteção contra XSS).
export function urlSegura(valor, campo, { permitirRelativa = true, obrigatoria = false } = {}) {
    const texto = comoTexto(valor);
    if (!texto) {
        if (obrigatoria) throw new ErroHttp(400, `O campo "${campo}" é obrigatório.`);
        return "";
    }
    if (texto.length > 500) throw new ErroHttp(400, `O campo "${campo}" é muito longo.`);
    if (permitirRelativa && /^\/(?!\/)[^\s]*$/.test(texto)) return texto;
    try {
        const url = new URL(texto);
        if (url.protocol === "https:" || url.protocol === "http:") return url.toString();
    } catch {
        // continua para o erro abaixo
    }
    throw new ErroHttp(400, `O campo "${campo}" deve ser um link válido (http:// ou https://).`);
}

export function listaDeIds(valor, campo = "ids", { maximo = 500 } = {}) {
    if (!Array.isArray(valor) || valor.length === 0) {
        throw new ErroHttp(400, `Envie uma lista de "${campo}".`);
    }
    if (valor.length > maximo) {
        throw new ErroHttp(400, `Máximo de ${maximo} itens por operação.`);
    }
    const ids = valor.map((id) => exigirId(id, campo));
    return [...new Set(ids)];
}

export function paginacao(query, { limitePadrao = 20, limiteMaximo = 100 } = {}) {
    const pagina = Math.max(1, Number.parseInt(query.pagina, 10) || 1);
    const limite = Math.min(limiteMaximo, Math.max(1, Number.parseInt(query.limite, 10) || limitePadrao));
    return { pagina, limite, offset: (pagina - 1) * limite };
}

// Transforma o texto de busca em um padrão seguro para LIKE (escapa % e _)
export function termoBusca(valor) {
    const texto = comoTexto(valor).slice(0, 100);
    if (!texto) return null;
    return `%${texto.replace(/[\\%_]/g, (c) => "\\" + c)}%`;
}
