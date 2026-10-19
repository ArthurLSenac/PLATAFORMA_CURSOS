// Painel administrativo: monta o menu lateral, o topo e troca as telas pelo endereço (#/rota).
// Cada tela fica em um arquivo próprio dentro de assets/js/admin/.
import { api } from "../api.js";
import { html, renderizar, $, $$ } from "../ui.js";
import { icone } from "../icones.js";
import { carregarConfiguracoes, exigirSessao, marca, botaoTema, alternarTema, avatar, sair, aplicarIdentidade } from "../layout.js";
import { estadoVazio } from "../componentes.js";

import * as dashboard from "./dashboard.js";
import * as usuarios from "./usuarios.js";
import * as cursos from "./cursos.js";
import * as editor from "./editor.js";
import * as categorias from "./categorias.js";
import * as certificados from "./certificados.js";
import * as importar from "./importar.js";
import * as auditoria from "./auditoria.js";
import * as configuracoes from "./configuracoes.js";

const MENU = [
    { grupo: "Visão geral", itens: [["dashboard", "Dashboard", "painel"]] },
    { grupo: "Gestão", itens: [["usuarios", "Usuários", "usuarios"], ["cursos", "Cursos", "livro"], ["categorias", "Categorias", "etiqueta"], ["certificados", "Certificados", "medalha"]] },
    { grupo: "Ferramentas", itens: [["importar", "Importar curso (ZIP)", "pacote"], ["auditoria", "Auditoria", "atividade"]] },
    { grupo: "Plataforma", itens: [["configuracoes", "Configurações do site", "engrenagem"]] }
];

const ROTAS = [
    { padrao: /^\/?$/, tela: dashboard, menu: "dashboard", titulo: "Dashboard" },
    { padrao: /^\/dashboard$/, tela: dashboard, menu: "dashboard", titulo: "Dashboard" },
    { padrao: /^\/usuarios$/, tela: usuarios, menu: "usuarios", titulo: "Usuários" },
    { padrao: /^\/cursos$/, tela: cursos, menu: "cursos", titulo: "Cursos" },
    { padrao: /^\/cursos\/(\d+)$/, tela: editor, menu: "cursos", titulo: "Editor de curso" },
    { padrao: /^\/categorias$/, tela: categorias, menu: "categorias", titulo: "Categorias" },
    { padrao: /^\/certificados$/, tela: certificados, menu: "certificados", titulo: "Certificados" },
    { padrao: /^\/importar$/, tela: importar, menu: "importar", titulo: "Importar curso" },
    { padrao: /^\/auditoria$/, tela: auditoria, menu: "auditoria", titulo: "Auditoria" },
    { padrao: /^\/configuracoes$/, tela: configuracoes, menu: "configuracoes", titulo: "Configurações" }
];

export const app = {
    usuario: null,
    cfg: null,
    navegar(rota) {
        location.hash = `#${rota}`;
    },
    // Redesenha a tela atual do zero (novo contêiner, sem eventos duplicados)
    recarregarTela() {
        return rotear();
    },
    // Atualiza o número de cadastros pendentes no menu
    async atualizarPendentes() {
        try {
            const { contagem_status: contagem } = await api.get("/admin/usuarios?limite=1");
            const pendentes = contagem.pendente || 0;
            const alvo = $("#contador-pendentes");
            alvo.textContent = String(pendentes);
            alvo.hidden = pendentes === 0;
        } catch { /* contador é opcional */ }
    },
    async recarregarIdentidade() {
        this.cfg = await api.get("/admin/configuracoes");
        aplicarIdentidade(this.cfg);
        montarLateral();
    }
};

function montarLateral() {
    renderizar($("#admin-lateral"), html`
        <a class="marca" href="index.html" title="Ver o site">${marca(app.cfg)}</a>
        <span class="selo selo--admin admin-lateral__selo">${icone("escudo", 12)} Painel administrativo</span>
        <nav class="admin-nav">
            ${MENU.map(({ grupo, itens }) => html`
                <div class="admin-nav__grupo">
                    <div class="admin-nav__titulo">${grupo}</div>
                    ${itens.map(([rota, rotulo, nomeIcone]) => html`
                        <a href="#/${rota}" data-menu="${rota}">
                            ${icone(nomeIcone, 18)} ${rotulo}
                            ${rota === "usuarios" ? html`<span class="admin-nav__contador" id="contador-pendentes" hidden title="Cadastros pendentes">0</span>` : ""}
                        </a>`)}
                </div>`)}
        </nav>
        <div class="admin-lateral__rodape">
            <a class="btn btn--fantasma btn--bloco" href="index.html" target="_blank" rel="noopener">${icone("externo", 16)} Ver site</a>
            <div class="cartao-admin espaco-topo">
                ${avatar(app.usuario, "avatar--sm")}
                <div><strong class="cortar" title="${app.usuario.nome}">${app.usuario.nome}</strong><span class="cortar" title="${app.usuario.email}">${app.usuario.email}</span></div>
                <button class="btn btn--fantasma btn--icone btn--sm" id="btn-sair" title="Sair" aria-label="Sair">${icone("sair", 16)}</button>
            </div>
        </div>`);
    $("#btn-sair").addEventListener("click", sair);
    $$(".admin-nav a").forEach((link) => link.addEventListener("click", () => $("#admin-lateral").classList.remove("aberta")));
    app.atualizarPendentes();
}

function montarTopo(titulo) {
    renderizar($("#admin-topo"), html`
        <button class="btn btn--fantasma btn--icone admin-menu-movel" id="abrir-menu" aria-label="Abrir menu">${icone("menu", 20)}</button>
        <div class="admin-topo__migalhas">
            <span>Painel</span> ${icone("seta-direita", 14)} <strong class="cortar">${titulo}</strong>
        </div>
        <div class="admin-topo__acoes">
            <a class="btn btn--sm so-desktop" href="#/cursos?novo=1">${icone("mais", 15)} Novo curso</a>
            ${botaoTema()}
        </div>`);
    $("#abrir-menu").addEventListener("click", (evento) => {
        evento.stopPropagation();
        $("#admin-lateral").classList.toggle("aberta");
    });
    $("[data-alternar-tema]", $("#admin-topo")).addEventListener("click", alternarTema);
}

let navegacaoAtual = 0;

async function rotear() {
    const [caminho, consultaTexto = ""] = location.hash.replace(/^#/, "").split("?");
    const consulta = new URLSearchParams(consultaTexto);
    const rota = ROTAS.find((item) => item.padrao.test(caminho || "/"));
    const conteudo = $("#admin-conteudo");
    const numero = ++navegacaoAtual;

    $$(".admin-nav a").forEach((link) => link.toggleAttribute("aria-current", link.dataset.menu === rota?.menu));
    $$(".admin-nav a[aria-current]").forEach((link) => link.setAttribute("aria-current", "page"));

    if (!rota) {
        montarTopo("Página não encontrada");
        renderizar(conteudo, estadoVazio({ icone: "busca", titulo: "Tela não encontrada", acao: html`<a class="btn btn--primario" href="#/dashboard">Ir para o dashboard</a>` }));
        return;
    }

    montarTopo(rota.titulo);
    document.title = `${rota.titulo} · Painel · ${app.cfg.nome_site}`;
    window.scrollTo(0, 0);

    // Cada tela recebe um elemento novo: assim os eventos da tela anterior não se acumulam
    const alvo = document.createElement("div");
    renderizar(alvo, html`<div class="carregando-pagina"><span class="spinner"></span></div>`);
    conteudo.replaceChildren(alvo);
    try {
        const parametros = rota.padrao.exec(caminho || "/").slice(1);
        await rota.tela.montar(alvo, { parametros, consulta, app, ativa: () => numero === navegacaoAtual });
    } catch (erro) {
        if (numero !== navegacaoAtual) return;
        console.error(erro);
        renderizar(conteudo, estadoVazio({ icone: "aviso", titulo: "Não foi possível carregar esta tela", texto: erro.message }));
    }
}

async function iniciar() {
    app.usuario = await exigirSessao({ papel: "admin" });
    await carregarConfiguracoes();
    app.cfg = await api.get("/admin/configuracoes");
    aplicarIdentidade(app.cfg);

    montarLateral();
    document.addEventListener("click", (evento) => {
        if (!evento.target.closest("#admin-lateral")) $("#admin-lateral").classList.remove("aberta");
    });
    window.addEventListener("hashchange", rotear);
    await rotear();
}

iniciar();
