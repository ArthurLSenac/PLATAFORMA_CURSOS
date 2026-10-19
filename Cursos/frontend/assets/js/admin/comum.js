// Peças reutilizadas pelas telas do painel administrativo.
import { html, $, renderizar } from "../ui.js";
import { icone } from "../icones.js";

export function cabecalhoPagina({ titulo, descricao, acoes = "" }) {
    return html`
        <div class="pagina-cabecalho">
            <div>
                <h1>${titulo}</h1>
                ${descricao ? html`<p>${descricao}</p>` : ""}
            </div>
            <div class="pagina-cabecalho__acoes">${acoes}</div>
        </div>`;
}

export function seloStatus(status) {
    const rotulos = { ativo: "Ativo", pendente: "Pendente", bloqueado: "Bloqueado", rejeitado: "Rejeitado" };
    return html`<span class="selo selo--ponto selo--${status}">${rotulos[status] || status}</span>`;
}

export function paginacao({ pagina, paginas, total }, aoMudar, rotulo = "registro") {
    const container = document.createElement("div");
    container.className = "paginacao";
    renderizar(container, html`
        <span>${total} ${total === 1 ? rotulo : `${rotulo}s`} · página ${pagina} de ${paginas}</span>
        <div class="paginacao__botoes">
            <button class="btn btn--sm" data-pagina="${pagina - 1}" ${pagina <= 1 ? "disabled" : ""}>${icone("seta-esquerda", 15)} Anterior</button>
            <button class="btn btn--sm" data-pagina="${pagina + 1}" ${pagina >= paginas ? "disabled" : ""}>Próxima ${icone("seta-direita", 15)}</button>
        </div>`);
    container.addEventListener("click", (evento) => {
        const botao = evento.target.closest("[data-pagina]");
        if (botao && !botao.disabled) aoMudar(Number(botao.dataset.pagina));
    });
    return container;
}

// Área de soltar arquivos (drag & drop) com seleção pelo clique
export function areaDeSoltar({ id, titulo, subtitulo, aceitar = "", multiplo = false, nomeIcone = "enviar" }) {
    return html`
        <label class="soltar-arquivos" data-soltar="${id}">
            <span class="soltar-arquivos__icone">${icone(nomeIcone, 24)}</span>
            <strong>${titulo}</strong>
            <span>${subtitulo}</span>
            <input type="file" id="${id}" ${aceitar ? html`accept="${aceitar}"` : ""} ${multiplo ? "multiple" : ""}>
        </label>`;
}

export function ligarAreaDeSoltar(raiz, id, aoReceber) {
    const area = $(`[data-soltar="${id}"]`, raiz);
    const entrada = $(`#${id}`, raiz);
    entrada.addEventListener("change", () => {
        if (entrada.files.length) aoReceber([...entrada.files]);
        entrada.value = "";
    });
    ["dragenter", "dragover"].forEach((tipo) => area.addEventListener(tipo, (evento) => {
        evento.preventDefault();
        area.classList.add("arrastando");
    }));
    ["dragleave", "drop"].forEach((tipo) => area.addEventListener(tipo, () => area.classList.remove("arrastando")));
    area.addEventListener("drop", (evento) => {
        evento.preventDefault();
        if (evento.dataTransfer.files.length) aoReceber([...evento.dataTransfer.files]);
    });
}

// Lê a duração de um vídeo/áudio no navegador antes de enviar (sem baixar nada)
export function lerDuracaoLocal(arquivo) {
    return new Promise((resolver) => {
        if (!/^(video|audio)\//.test(arquivo.type)) return resolver(0);
        const midia = document.createElement(arquivo.type.startsWith("audio") ? "audio" : "video");
        const url = URL.createObjectURL(arquivo);
        const terminar = (valor) => {
            URL.revokeObjectURL(url);
            resolver(valor);
        };
        midia.preload = "metadata";
        midia.onloadedmetadata = () => terminar(Number.isFinite(midia.duration) ? Math.round(midia.duration) : 0);
        midia.onerror = () => terminar(0);
        setTimeout(() => terminar(0), 8000);
        midia.src = url;
    });
}

export function interruptor({ id, marcado = false, rotulo = "", descricao = "" }) {
    return html`
        <label class="interruptor" for="${id}">
            <input type="checkbox" id="${id}" ${marcado ? "checked" : ""}>
            <span class="interruptor__trilho"></span>
            ${rotulo ? html`<span><strong>${rotulo}</strong>${descricao ? html`<br><small class="mudo">${descricao}</small>` : ""}</span>` : ""}
        </label>`;
}

const ICONES_ACAO = {
    login: "entrar", logout: "sair", usuario: "usuario", perfil: "usuario", curso: "livro", modulo: "camadas",
    aula: "play-circulo", material: "clipe", categoria: "etiqueta", configuracoes: "engrenagem", acesso: "cadeado",
    certificado: "medalha", importacao: "pacote", matricula: "formatura"
};

export function iconeDaAcao(acao = "") {
    return ICONES_ACAO[acao.split(".")[0]] || "atividade";
}

// Menu de contexto flutuante (botão "⋮" das tabelas)
let menuAberto = null;
export function fecharMenuContexto() {
    menuAberto?.remove();
    menuAberto = null;
}

export function abrirMenuContexto(botao, itens) {
    const jaAberto = menuAberto && menuAberto.dataset.dono === botao.dataset.idMenu;
    fecharMenuContexto();
    if (jaAberto) return;

    if (!botao.dataset.idMenu) botao.dataset.idMenu = String(Math.random()).slice(2);
    const menu = document.createElement("div");
    menu.className = "menu-suspenso__lista";
    menu.dataset.dono = botao.dataset.idMenu;
    menu.setAttribute("role", "menu");
    renderizar(menu, html`${itens.filter(Boolean).map((item, indice) => item === "-"
        ? html`<div class="menu-suspenso__divisor"></div>`
        : html`<button class="menu-suspenso__item ${item.perigo ? "menu-suspenso__item--perigo" : ""}" role="menuitem" data-indice="${indice}">${icone(item.icone, 16)} ${item.rotulo}</button>`)}`);
    document.body.appendChild(menu);

    const area = botao.getBoundingClientRect();
    menu.style.position = "fixed";
    menu.style.top = `${Math.min(area.bottom + 6, window.innerHeight - menu.offsetHeight - 10)}px`;
    menu.style.left = `${Math.max(10, area.right - menu.offsetWidth)}px`;
    menu.style.right = "auto";

    const lista = itens.filter(Boolean);
    menu.addEventListener("click", (evento) => {
        const opcao = evento.target.closest("[data-indice]");
        if (!opcao) return;
        fecharMenuContexto();
        lista[Number(opcao.dataset.indice)].acao();
    });
    menuAberto = menu;
    menu.querySelector("button")?.focus();
}

document.addEventListener("click", (evento) => {
    if (menuAberto && !menuAberto.contains(evento.target) && !evento.target.closest("[data-id-menu]")) fecharMenuContexto();
});
document.addEventListener("keydown", (evento) => {
    if (evento.key === "Escape") fecharMenuContexto();
});
window.addEventListener("scroll", fecharMenuContexto, { passive: true });
window.addEventListener("hashchange", fecharMenuContexto);

// Gaveta lateral (painel deslizante da direita)
export function abrirGaveta({ titulo, conteudo }) {
    const fundo = document.createElement("div");
    fundo.className = "gaveta-fundo";
    const gaveta = document.createElement("aside");
    gaveta.className = "gaveta";
    gaveta.setAttribute("role", "dialog");
    gaveta.setAttribute("aria-modal", "true");
    renderizar(gaveta, html`
        <div class="gaveta__cabecalho">
            <h2 class="cartao__titulo">${titulo}</h2>
            <button class="btn btn--fantasma btn--icone btn--sm" data-fechar-gaveta aria-label="Fechar">${icone("x", 18)}</button>
        </div>
        <div class="gaveta__corpo">${conteudo}</div>`);
    document.body.append(fundo, gaveta);
    document.body.classList.add("sem-rolagem");

    const aoTeclar = (evento) => {
        if (evento.key === "Escape" && !document.querySelector(".modal-fundo")) fechar();
    };
    function fechar() {
        fundo.remove();
        gaveta.remove();
        document.removeEventListener("keydown", aoTeclar);
        if (!document.querySelector(".modal-fundo")) document.body.classList.remove("sem-rolagem");
    }
    fundo.addEventListener("click", fechar);
    gaveta.querySelector("[data-fechar-gaveta]").addEventListener("click", fechar);
    document.addEventListener("keydown", aoTeclar);
    window.addEventListener("hashchange", fechar, { once: true });
    return { elemento: gaveta, corpo: gaveta.querySelector(".gaveta__corpo"), fechar };
}

export function gerarSenha() {
    const letras = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz";
    const numeros = "23456789";
    const todos = letras + numeros + "!@#$%";
    const aleatorio = new Uint32Array(12);
    crypto.getRandomValues(aleatorio);
    const caracteres = [...aleatorio].map((n) => todos[n % todos.length]);
    caracteres[0] = letras[aleatorio[0] % letras.length];
    caracteres[1] = numeros[aleatorio[1] % numeros.length];
    return caracteres.join("");
}
