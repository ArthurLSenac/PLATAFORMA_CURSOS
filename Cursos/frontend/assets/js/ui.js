// Utilitários de interface: template HTML seguro, toasts, modais, confirmação e formatação.
import { icone } from "./icones.js";

// ---------------------------------------------------------------------------
// Template HTML seguro contra XSS
// Tudo o que entra em html`...${valor}...` é ESCAPADO automaticamente,
// a não ser que seja outro html`` ou raw() (conteúdo confiável do próprio sistema).
// ---------------------------------------------------------------------------
class HtmlSeguro {
    constructor(conteudo) {
        this.conteudo = conteudo;
    }
    toString() {
        return this.conteudo;
    }
}

const ENTIDADES = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;", "`": "&#96;" };

export function esc(valor) {
    return String(valor ?? "").replace(/[&<>"'`]/g, (caractere) => ENTIDADES[caractere]);
}

export function raw(conteudo) {
    return new HtmlSeguro(String(conteudo ?? ""));
}

function converter(valor) {
    if (valor instanceof HtmlSeguro) return valor.conteudo;
    if (Array.isArray(valor)) return valor.map(converter).join("");
    if (valor === null || valor === undefined || valor === false) return "";
    return esc(valor);
}

export function html(partes, ...valores) {
    let resultado = "";
    partes.forEach((parte, indice) => {
        resultado += parte;
        if (indice < valores.length) resultado += converter(valores[indice]);
    });
    return new HtmlSeguro(resultado);
}

export function renderizar(elemento, conteudo) {
    elemento.innerHTML = String(conteudo);
    aplicarEstilosDinamicos(elemento);
}

// A CSP proíbe atributos style="" no HTML; cores e larguras dinâmicas são aplicadas via JavaScript (CSSOM)
const REGEX_COR = /^#[0-9a-fA-F]{6}$/;
export function aplicarEstilosDinamicos(raiz = document) {
    raiz.querySelectorAll("[data-cor]").forEach((el) => {
        if (REGEX_COR.test(el.dataset.cor)) el.style.setProperty("--cor", el.dataset.cor);
    });
    raiz.querySelectorAll("[data-largura]").forEach((el) => {
        const valor = Math.max(0, Math.min(100, Number(el.dataset.largura) || 0));
        el.style.setProperty("--largura", `${valor}%`);
    });
    raiz.querySelectorAll("[data-altura]").forEach((el) => {
        const valor = Math.max(0, Math.min(100, Number(el.dataset.altura) || 0));
        el.style.setProperty("--altura", `${valor}%`);
    });
}

export const $ = (seletor, raiz = document) => raiz.querySelector(seletor);
export const $$ = (seletor, raiz = document) => [...raiz.querySelectorAll(seletor)];

// ---------------------------------------------------------------------------
// Toasts (mensagens rápidas no canto da tela)
// ---------------------------------------------------------------------------
const ICONES_TOAST = { sucesso: "check", erro: "x", info: "info", alerta: "aviso" };

export function toast(mensagem, tipo = "sucesso", duracao = 4200) {
    let container = $(".toasts");
    if (!container) {
        container = document.createElement("div");
        container.className = "toasts";
        container.setAttribute("role", "status");
        container.setAttribute("aria-live", "polite");
        document.body.appendChild(container);
    }
    const item = document.createElement("div");
    item.className = `toast toast--${tipo}`;
    item.innerHTML = String(html`
        <span class="toast__icone">${icone(ICONES_TOAST[tipo] || "info", 16)}</span>
        <span class="toast__texto">${mensagem}</span>
        <button class="btn btn--fantasma btn--icone btn--sm" aria-label="Fechar">${icone("x", 15)}</button>`);
    const remover = () => {
        item.classList.add("saindo");
        setTimeout(() => item.remove(), 200);
    };
    item.querySelector("button").addEventListener("click", remover);
    container.appendChild(item);
    setTimeout(remover, duracao);
}

export function toastErro(erro, padrao = "Algo deu errado. Tente novamente.") {
    toast(erro?.message || padrao, "erro", 6000);
}

// ---------------------------------------------------------------------------
// Modal genérico
// ---------------------------------------------------------------------------
export function abrirModal({ titulo, subtitulo, conteudo, rodape, tamanho = "", aoFechar, fecharNoFundo = true }) {
    const anteriorFoco = document.activeElement;
    const fundo = document.createElement("div");
    fundo.className = "modal-fundo";
    fundo.innerHTML = String(html`
        <div class="modal ${tamanho ? `modal--${tamanho}` : ""}" role="dialog" aria-modal="true" aria-labelledby="modal-titulo">
            <div class="modal__cabecalho">
                <div>
                    <h2 id="modal-titulo">${titulo}</h2>
                    ${subtitulo ? html`<p>${subtitulo}</p>` : ""}
                </div>
                <button class="btn btn--fantasma btn--icone btn--sm" data-fechar aria-label="Fechar">${icone("x", 18)}</button>
            </div>
            <div class="modal__corpo">${conteudo ?? ""}</div>
            ${rodape ? html`<div class="modal__rodape">${rodape}</div>` : ""}
        </div>`);
    document.body.appendChild(fundo);
    document.body.classList.add("sem-rolagem");
    aplicarEstilosDinamicos(fundo);

    const modal = fundo.querySelector(".modal");
    let fechado = false;
    function fechar(resultado) {
        if (fechado) return;
        fechado = true;
        document.removeEventListener("keydown", aoTeclar);
        fundo.remove();
        if (!$(".modal-fundo")) document.body.classList.remove("sem-rolagem");
        anteriorFoco?.focus?.();
        aoFechar?.(resultado);
    }
    function aoTeclar(evento) {
        if (evento.key === "Escape" && fundo === $$(".modal-fundo").at(-1)) fechar();
    }
    document.addEventListener("keydown", aoTeclar);
    // Ao trocar de tela (menu ou botão voltar do navegador) o modal é fechado
    window.addEventListener("hashchange", () => fechar(), { once: true });
    fundo.addEventListener("mousedown", (evento) => {
        if (fecharNoFundo && evento.target === fundo) fechar();
    });
    fundo.querySelectorAll("[data-fechar]").forEach((botao) => botao.addEventListener("click", () => fechar()));

    setTimeout(() => (modal.querySelector("[autofocus], input:not([type=hidden]), textarea, select") || modal).focus?.(), 50);
    return { elemento: modal, fechar };
}

// Caixa de confirmação que devolve uma Promise (true/false, ou o motivo digitado)
export function confirmar({ titulo, mensagem, textoConfirmar = "Confirmar", perigo = false, pedirMotivo = false, rotuloMotivo = "Motivo (opcional)" }) {
    return new Promise((resolver) => {
        let resposta = false;
        const { elemento, fechar } = abrirModal({
            titulo,
            tamanho: "sm",
            conteudo: html`
                <div class="modal__icone ${perigo ? "modal__icone--perigo" : "modal__icone--info"}">${icone(perigo ? "aviso" : "info", 22)}</div>
                <p>${mensagem}</p>
                ${pedirMotivo ? html`
                    <div class="campo espaco-topo">
                        <label for="motivo-confirmacao">${rotuloMotivo}</label>
                        <textarea id="motivo-confirmacao" class="area-texto" maxlength="255" rows="3"></textarea>
                    </div>` : ""}`,
            rodape: html`
                <button class="btn btn--fantasma" data-fechar>Cancelar</button>
                <button class="btn ${perigo ? "btn--perigo" : "btn--primario"}" data-confirmar>${textoConfirmar}</button>`,
            aoFechar: () => resolver(resposta)
        });
        elemento.querySelector("[data-confirmar]").addEventListener("click", () => {
            resposta = pedirMotivo ? { motivo: elemento.querySelector("#motivo-confirmacao").value.trim() } : true;
            fechar();
        });
        elemento.querySelector("[data-confirmar]").focus();
    });
}

// Coloca um botão em estado "carregando" enquanto uma ação assíncrona roda
export async function comCarregamento(botao, acao) {
    if (!botao) return acao();
    const original = botao.innerHTML;
    const largura = botao.offsetWidth;
    botao.disabled = true;
    botao.style.minWidth = `${largura}px`;
    botao.innerHTML = '<span class="spinner" aria-hidden="true"></span>';
    try {
        return await acao();
    } finally {
        botao.disabled = false;
        botao.innerHTML = original;
        botao.style.minWidth = "";
    }
}

// ---------------------------------------------------------------------------
// Formatação
// ---------------------------------------------------------------------------
const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

export function data(valor) {
    if (!valor) return "—";
    return new Date(valor).toLocaleDateString("pt-BR");
}

export function dataHora(valor) {
    if (!valor) return "—";
    return new Date(valor).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

export function dataExtenso(valor) {
    const d = new Date(valor);
    return `${d.getDate()} de ${MESES[d.getMonth()]} de ${d.getFullYear()}`;
}

export function tempoRelativo(valor) {
    if (!valor) return "nunca";
    const segundos = Math.round((Date.now() - new Date(valor).getTime()) / 1000);
    if (segundos < 60) return "agora mesmo";
    const minutos = Math.round(segundos / 60);
    if (minutos < 60) return `há ${minutos} min`;
    const horas = Math.round(minutos / 60);
    if (horas < 24) return `há ${horas} h`;
    const dias = Math.round(horas / 24);
    if (dias < 30) return `há ${dias} dia${dias > 1 ? "s" : ""}`;
    return data(valor);
}

export function duracao(segundos) {
    const total = Math.max(0, Math.round(Number(segundos) || 0));
    const horas = Math.floor(total / 3600);
    const minutos = Math.round((total % 3600) / 60);
    if (horas > 0) return minutos ? `${horas}h ${minutos}min` : `${horas}h`;
    if (minutos > 0) return `${minutos} min`;
    return total > 0 ? `${total}s` : "—";
}

export function relogio(segundos) {
    const total = Math.max(0, Math.round(Number(segundos) || 0));
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    const dois = (n) => String(n).padStart(2, "0");
    return h ? `${h}:${dois(m)}:${dois(s)}` : `${dois(m)}:${dois(s)}`;
}

export function lerRelogio(texto) {
    const partes = String(texto || "").trim().split(":").map((p) => Number(p));
    if (partes.some((p) => !Number.isFinite(p) || p < 0)) return null;
    return partes.reduce((total, parte) => total * 60 + parte, 0);
}

export function bytes(valor) {
    const n = Number(valor) || 0;
    if (n < 1024) return `${n} B`;
    const unidades = ["KB", "MB", "GB", "TB"];
    let tamanho = n / 1024;
    let i = 0;
    while (tamanho >= 1024 && i < unidades.length - 1) {
        tamanho /= 1024;
        i += 1;
    }
    return `${tamanho.toLocaleString("pt-BR", { maximumFractionDigits: tamanho < 10 ? 1 : 0 })} ${unidades[i]}`;
}

export function numero(valor) {
    return Number(valor || 0).toLocaleString("pt-BR");
}

export function plural(quantidade, singular, pluralTexto) {
    return `${numero(quantidade)} ${Number(quantidade) === 1 ? singular : pluralTexto || `${singular}s`}`;
}

export function iniciais(nome) {
    const partes = String(nome || "?").trim().split(/\s+/);
    return ((partes[0]?.[0] || "") + (partes.length > 1 ? partes.at(-1)[0] : "")).toUpperCase();
}

export const NIVEIS = { iniciante: "Iniciante", intermediario: "Intermediário", avancado: "Avançado" };

export function debounce(funcao, espera = 300) {
    let temporizador;
    return (...argumentos) => {
        clearTimeout(temporizador);
        temporizador = setTimeout(() => funcao(...argumentos), espera);
    };
}

export function parametro(nome) {
    return new URLSearchParams(location.search).get(nome);
}

// Só permite redirecionar para páginas do próprio site
export function destinoSeguro(destino, padrao = "painel.html") {
    if (!destino || !/^[a-z0-9-]+\.html([?#][^\s]*)?$/i.test(destino)) return padrao;
    return destino;
}

// Fallback para quando o recurso de copiar não está disponível
export async function copiarTexto(texto) {
    try {
        await navigator.clipboard.writeText(texto);
        toast("Copiado para a área de transferência.", "info", 2500);
    } catch {
        toast("Não foi possível copiar automaticamente.", "alerta");
    }
}
