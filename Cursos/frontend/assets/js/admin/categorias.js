// CRUD de categorias: cadastrar, listar, alterar e excluir.
import { api } from "../api.js";
import { html, renderizar, $, toast, toastErro, confirmar, abrirModal, comCarregamento, data } from "../ui.js";
import { icone } from "../icones.js";
import { estadoVazio } from "../componentes.js";
import { cabecalhoPagina } from "./comum.js";

const CORES = ["#7c5cff", "#22d3ee", "#10b981", "#f472b6", "#f59e0b", "#f43f5e", "#3b82f6", "#a3e635"];
let categorias = [];
let contexto;

function formulario(categoria = null) {
    const nova = !categoria;
    const { elemento, fechar } = abrirModal({
        titulo: nova ? "Nova categoria" : "Editar categoria",
        tamanho: "sm",
        conteudo: html`
            <div class="pilha">
                <div class="campo"><label for="cat-nome">Nome *</label><input class="entrada" id="cat-nome" maxlength="80" value="${categoria?.nome || ""}" placeholder="Ex.: Programação"></div>
                <div class="campo"><label for="cat-descricao">Descrição</label><input class="entrada" id="cat-descricao" maxlength="255" value="${categoria?.descricao || ""}"></div>
                <div class="campo">
                    <label for="cat-cor">Cor</label>
                    <div class="cores-predefinidas">
                        <input type="color" class="entrada" id="cat-cor" value="${categoria?.cor || CORES[categorias.length % CORES.length]}">
                        ${CORES.map((cor) => html`<button type="button" class="amostra-cor" data-cor="${cor}" data-amostra="${cor}" aria-label="Cor ${cor}"></button>`)}
                    </div>
                </div>
            </div>`,
        rodape: html`<button class="btn btn--fantasma" data-fechar>Cancelar</button><button class="btn btn--primario" id="salvar-categoria">${icone("salvar", 16)} Salvar</button>`
    });
    elemento.addEventListener("click", (evento) => {
        const amostra = evento.target.closest("[data-amostra]");
        if (amostra) $("#cat-cor", elemento).value = amostra.dataset.amostra;
    });
    $("#salvar-categoria", elemento).addEventListener("click", (evento) => comCarregamento(evento.currentTarget, async () => {
        const corpo = { nome: $("#cat-nome", elemento).value.trim(), descricao: $("#cat-descricao", elemento).value.trim(), cor: $("#cat-cor", elemento).value };
        try {
            const resposta = nova ? await api.post("/admin/categorias", corpo) : await api.put(`/admin/categorias/${categoria.id}`, corpo);
            toast(resposta.mensagem);
            fechar();
            carregar();
        } catch (erro) {
            toastErro(erro);
        }
    }));
}

async function excluir(categoria) {
    const ok = await confirmar({
        titulo: `Excluir a categoria "${categoria.nome}"?`,
        mensagem: categoria.total_cursos ? `${categoria.total_cursos} curso(s) ficarão sem categoria (eles não serão apagados).` : "Nenhum curso usa esta categoria.",
        textoConfirmar: "Excluir", perigo: true
    });
    if (!ok) return;
    try {
        toast((await api.delete(`/admin/categorias/${categoria.id}`)).mensagem);
        carregar();
    } catch (erro) {
        toastErro(erro);
    }
}

async function carregar() {
    categorias = await api.get("/admin/categorias");
    if (!contexto.ativa()) return;
    const area = $("#area-categorias");
    if (categorias.length === 0) {
        renderizar(area, estadoVazio({ icone: "etiqueta", titulo: "Nenhuma categoria", texto: "Categorias ajudam os alunos a filtrar o catálogo." }));
        return;
    }
    renderizar(area, html`
        <div class="tabela-container">
            <table class="tabela">
                <thead><tr><th>Categoria</th><th>Descrição</th><th>Cursos</th><th>Criada em</th><th></th></tr></thead>
                <tbody>
                    ${categorias.map((c) => html`
                        <tr>
                            <td><span class="selo selo--ponto" data-cor="${c.cor}">${c.nome}</span></td>
                            <td class="mudo">${c.descricao || "—"}</td>
                            <td>${c.total_cursos}</td>
                            <td>${data(c.criado_em)}</td>
                            <td><div class="acoes-celula">
                                <button class="btn btn--sm btn--fantasma" data-editar="${c.id}">${icone("editar", 15)} Editar</button>
                                <button class="btn btn--sm btn--fantasma btn--icone" data-excluir="${c.id}" aria-label="Excluir ${c.nome}">${icone("lixeira", 15)}</button>
                            </div></td>
                        </tr>`)}
                </tbody>
            </table>
        </div>`);
}

export async function montar(alvo, ctx) {
    contexto = ctx;
    renderizar(alvo, html`
        ${cabecalhoPagina({
            titulo: "Categorias",
            descricao: "Organize os cursos por área de conhecimento.",
            acoes: html`<button class="btn btn--primario" id="nova-categoria">${icone("mais", 16)} Nova categoria</button>`
        })}
        <div id="area-categorias"><div class="carregando-pagina"><span class="spinner"></span></div></div>`);
    $("#nova-categoria").addEventListener("click", () => formulario());
    alvo.addEventListener("click", (evento) => {
        const editar = evento.target.closest("[data-editar]");
        if (editar) return formulario(categorias.find((c) => c.id === Number(editar.dataset.editar)));
        const remover = evento.target.closest("[data-excluir]");
        if (remover) excluir(categorias.find((c) => c.id === Number(remover.dataset.excluir)));
    });
    await carregar();
}
