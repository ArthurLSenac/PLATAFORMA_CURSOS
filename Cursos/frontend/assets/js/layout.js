// Monta as partes comuns das páginas públicas e do aluno: aviso global, cabeçalho,
// menu do usuário, alternância de tema e rodapé — tudo a partir das configurações
// que o administrador define no painel.
import { api, urlArquivo } from "./api.js";
import { html, renderizar, $, iniciais, toast } from "./ui.js";
import { icone } from "./icones.js";

const PADRAO = {
    nome_site: "Lumina Academy", slogan: "", logo: "", favicon: "", cor_primaria: "#7c5cff",
    hero_titulo: "", hero_subtitulo: "", rodape_texto: "", rodape_links: [], redes_sociais: {},
    email_contato: "", registros_abertos: true, login_alunos: true, aviso_global: "", aviso_tipo: "info"
};

let configuracoes = null;

export async function carregarConfiguracoes() {
    if (configuracoes) return configuracoes;
    try {
        configuracoes = { ...PADRAO, ...(await api.get("/publico/configuracoes")) };
    } catch {
        configuracoes = { ...PADRAO };
    }
    aplicarIdentidade(configuracoes);
    return configuracoes;
}

export function aplicarIdentidade(cfg) {
    if (/^#[0-9a-fA-F]{6}$/.test(cfg.cor_primaria || "")) {
        document.documentElement.style.setProperty("--primaria", cfg.cor_primaria);
    }
    let link = document.querySelector('link[rel="icon"]');
    if (!link) {
        link = document.createElement("link");
        link.rel = "icon";
        document.head.appendChild(link);
    }
    link.href = cfg.favicon ? urlArquivo(cfg.favicon) : "assets/img/favicon.svg";
}

export function definirTitulo(titulo) {
    const nome = configuracoes?.nome_site || PADRAO.nome_site;
    document.title = titulo ? `${titulo} · ${nome}` : nome;
}

export async function obterSessao() {
    try {
        const { usuario } = await api.get("/auth/sessao");
        return usuario;
    } catch {
        return null;
    }
}

// Para páginas que exigem login: redireciona para o login se não houver sessão
export async function exigirSessao({ papel } = {}) {
    const usuario = await obterSessao();
    if (!usuario) {
        const voltar = location.pathname.split("/").pop() + location.search + location.hash;
        location.replace(`login.html?voltar=${encodeURIComponent(voltar || "painel.html")}`);
        return new Promise(() => {});
    }
    if (papel && usuario.papel !== papel) {
        location.replace(usuario.papel === "admin" ? "admin.html" : "painel.html");
        return new Promise(() => {});
    }
    // Se a sessão cair no meio do uso (bloqueio, logout em outro lugar...), volta ao login
    window.addEventListener("sessao-invalida", (evento) => {
        try {
            sessionStorage.setItem("aviso-login", evento.detail.message);
        } catch { /* sem armazenamento */ }
        location.replace("login.html");
    });
    return usuario;
}

export async function sair() {
    try {
        await api.post("/auth/logout");
    } finally {
        location.href = "login.html?saiu=1";
    }
}

export function alternarTema() {
    const atual = document.documentElement.getAttribute("data-tema") === "claro" ? "escuro" : "claro";
    document.documentElement.setAttribute("data-tema", atual);
    try {
        localStorage.setItem("tema", atual);
    } catch { /* sem armazenamento */ }
    document.querySelectorAll("[data-alternar-tema]").forEach((botao) => {
        botao.innerHTML = String(icone(atual === "claro" ? "lua" : "sol", 18));
    });
}

export function botaoTema() {
    const claro = document.documentElement.getAttribute("data-tema") === "claro";
    return html`<button class="btn btn--fantasma btn--icone" data-alternar-tema aria-label="Alternar tema claro/escuro" title="Alternar tema">${icone(claro ? "lua" : "sol", 18)}</button>`;
}

export function marca(cfg = configuracoes || PADRAO) {
    if (cfg.logo) {
        return html`<img class="marca__logo" src="${urlArquivo(cfg.logo)}" alt="${cfg.nome_site}">`;
    }
    // Identidade vetorial integrada: monograma L + luz, sem depender de upload.
    return html`<span class="marca__simbolo" aria-hidden="true"><svg width="26" height="26" viewBox="0 0 32 32" fill="none" focusable="false"><path d="M5 4h6v20h15v5H5z" fill="currentColor"/><path d="m24 2 2.1 5.9L32 10l-5.9 2.1L24 18l-2.1-5.9L16 10l5.9-2.1z" fill="currentColor"/></svg></span><span>${cfg.nome_site}</span>`;
}

export function avatar(usuario, classe = "") {
    if (usuario?.avatar) {
        return html`<span class="avatar ${classe}"><img src="${urlArquivo(usuario.avatar)}" alt=""></span>`;
    }
    return html`<span class="avatar ${classe}">${iniciais(usuario?.nome)}</span>`;
}

function menuUsuario(usuario) {
    const ehAdmin = usuario.papel === "admin";
    return html`
        <div class="menu-suspenso">
            <button class="usuario-botao" data-abrir-menu aria-haspopup="true" aria-expanded="false">
                ${avatar(usuario, "avatar--sm")}
                <span class="cortar so-desktop">${usuario.nome.split(" ")[0]}</span>
                ${icone("seta-baixo", 15, "so-desktop")}
            </button>
            <div class="menu-suspenso__lista" hidden>
                <div class="menu-suspenso__cabecalho">
                    <strong>${usuario.nome}</strong>
                    <span>${usuario.email}</span>
                </div>
                <div class="menu-suspenso__divisor"></div>
                ${ehAdmin
                    ? html`<a class="menu-suspenso__item" href="admin.html">${icone("painel", 16)} Painel administrativo</a>`
                    : html`
                        <a class="menu-suspenso__item" href="painel.html">${icone("painel", 16)} Meu painel</a>
                        <a class="menu-suspenso__item" href="painel.html#certificados">${icone("medalha", 16)} Certificados</a>
                        <a class="menu-suspenso__item" href="painel.html#perfil">${icone("usuario", 16)} Meu perfil</a>`}
                <div class="menu-suspenso__divisor"></div>
                <button class="menu-suspenso__item menu-suspenso__item--perigo" data-sair>${icone("sair", 16)} Sair</button>
            </div>
        </div>`;
}

const ICONES_REDES = {
    instagram: "instagram", youtube: "youtube", linkedin: "linkedin", github: "github",
    x: "x-rede", facebook: "facebook", tiktok: "tiktok", whatsapp: "whatsapp"
};

export function iniciarMenus(raiz = document) {
    raiz.querySelectorAll("[data-abrir-menu]").forEach((botao) => {
        const lista = botao.nextElementSibling;
        botao.addEventListener("click", (evento) => {
            evento.stopPropagation();
            const abrir = lista.hidden;
            document.querySelectorAll(".menu-suspenso__lista").forEach((outra) => (outra.hidden = true));
            lista.hidden = !abrir;
            botao.setAttribute("aria-expanded", String(abrir));
        });
    });
    document.addEventListener("click", () => {
        document.querySelectorAll(".menu-suspenso__lista").forEach((lista) => (lista.hidden = true));
    });
    raiz.querySelectorAll("[data-sair]").forEach((botao) => botao.addEventListener("click", sair));
    raiz.querySelectorAll("[data-alternar-tema]").forEach((botao) => botao.addEventListener("click", alternarTema));
}

// Monta cabeçalho + rodapé. "ativo" destaca o item do menu da página atual.
export async function montarLayout({ ativo = "", usuario } = {}) {
    const cfg = await carregarConfiguracoes();
    if (usuario === undefined) usuario = await obterSessao();

    if (cfg.aviso_global) {
        const aviso = document.createElement("div");
        aviso.className = `aviso-global aviso-global--${cfg.aviso_tipo}`;
        aviso.innerHTML = String(html`${icone(cfg.aviso_tipo === "perigo" || cfg.aviso_tipo === "alerta" ? "aviso" : "info", 16)}${cfg.aviso_global}`);
        document.body.prepend(aviso);
    }

    const topo = $("#topo");
    if (topo) {
        const linkAtual = (nome) => (ativo === nome ? 'aria-current="page"' : "");
        const acoesVisitante = html`
            <a class="btn btn--fantasma so-desktop" href="login.html">Entrar</a>
            ${cfg.registros_abertos ? html`<a class="btn btn--primario so-desktop" href="cadastro.html">Criar conta</a>` : ""}`;
        const acoesUsuario = html`
            <a class="btn so-desktop" href="${usuario?.papel === "admin" ? "admin.html" : "painel.html"}">
                ${icone("painel", 16)} ${usuario?.papel === "admin" ? "Painel admin" : "Meu painel"}
            </a>
            ${usuario ? menuUsuario(usuario) : ""}`;

        topo.className = "topo";
        renderizar(topo, html`
            <div class="container topo__conteudo">
                <a class="marca" href="index.html" aria-label="${cfg.nome_site} — início">${marca(cfg)}</a>
                <nav class="topo__nav" aria-label="Principal">
                    <a href="index.html" ${linkAtual("inicio")}>Início</a>
                    <a href="index.html#cursos" ${linkAtual("cursos")}>Cursos</a>
                    <a href="index.html#como-funciona">Como funciona</a>
                    <a href="verificar.html" ${linkAtual("verificar")}>Verificar certificado</a>
                </nav>
                <div class="topo__acoes">
                    ${botaoTema()}
                    ${usuario ? acoesUsuario : acoesVisitante}
                    <button class="btn btn--fantasma btn--icone topo__menu-movel" data-menu-movel aria-label="Abrir menu">${icone("menu", 20)}</button>
                </div>
            </div>
            <nav class="gaveta-movel" aria-label="Menu móvel">
                <a href="index.html">Início</a>
                <a href="index.html#cursos">Cursos</a>
                <a href="verificar.html">Verificar certificado</a>
                ${usuario
                    ? html`<a href="${usuario.papel === "admin" ? "admin.html" : "painel.html"}">${usuario.papel === "admin" ? "Painel admin" : "Meu painel"}</a>`
                    : html`<a href="login.html">Entrar</a>${cfg.registros_abertos ? html`<a href="cadastro.html">Criar conta</a>` : ""}`}
            </nav>`);

        iniciarMenus(topo);
        topo.querySelector("[data-menu-movel]").addEventListener("click", () => {
            topo.querySelector(".gaveta-movel").classList.toggle("aberta");
        });
        const aoRolar = () => topo.classList.toggle("rolado", window.scrollY > 8);
        window.addEventListener("scroll", aoRolar, { passive: true });
        aoRolar();
    }

    const rodape = $("#rodape");
    if (rodape) {
        const redes = Object.entries(cfg.redes_sociais || {}).filter(([, url]) => /^https?:\/\//.test(url));
        renderizar(rodape, html`
            <div class="container">
                <div class="rodape__grade">
                    <div class="rodape__marca">
                        <a class="marca" href="index.html">${marca(cfg)}</a>
                        <p>${cfg.rodape_texto || cfg.slogan}</p>
                        ${redes.length ? html`
                            <div class="redes">
                                ${redes.map(([rede, url]) => html`
                                    <a href="${url}" target="_blank" rel="noopener noreferrer" aria-label="${rede}" title="${rede}">${icone(ICONES_REDES[rede] || "link", 17)}</a>`)}
                            </div>` : ""}
                    </div>
                    <div>
                        <h4>Navegação</h4>
                        <ul class="rodape__links">
                            ${(cfg.rodape_links || []).map((link) => html`<li><a href="${link.url}" ${/^https?:/.test(link.url) ? html`target="_blank" rel="noopener noreferrer"` : ""}>${link.rotulo}</a></li>`)}
                        </ul>
                    </div>
                    <div>
                        <h4>Contato</h4>
                        <ul class="rodape__links">
                            ${cfg.email_contato ? html`<li><a href="mailto:${cfg.email_contato}">${cfg.email_contato}</a></li>` : ""}
                            <li><a href="verificar.html">Validar um certificado</a></li>
                            <li><a href="login.html">Área do aluno</a></li>
                        </ul>
                    </div>
                </div>
                <div class="rodape__base">
                    <span>© ${new Date().getFullYear()} ${cfg.nome_site}. Todos os direitos reservados.</span>
                    <span>${cfg.slogan}</span>
                </div>
            </div>`);
        rodape.className = "rodape";
    }

    return { cfg, usuario };
}

// Mostra uma mensagem guardada antes de um redirecionamento (ex.: "sessão encerrada")
export function mostrarAvisoPendente() {
    try {
        const aviso = sessionStorage.getItem("aviso-login");
        if (aviso) {
            sessionStorage.removeItem("aviso-login");
            toast(aviso, "alerta", 7000);
            return aviso;
        }
    } catch { /* sem armazenamento */ }
    return null;
}
