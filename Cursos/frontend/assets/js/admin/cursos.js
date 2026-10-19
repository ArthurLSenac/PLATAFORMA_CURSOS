// CRUD de cursos (tela principal para a demonstração):
//   CREATE → POST   /api/admin/cursos        (formulário "Novo curso")
//   READ   → GET    /api/admin/cursos        (lista abaixo)
//   UPDATE → PUT    /api/admin/cursos/:id    (botão "Editar informações")
//   DELETE → DELETE /api/admin/cursos/:id    (menu "⋮" → Excluir)
import { api, urlArquivo } from "../api.js";
import {
    html, renderizar, $, toast, toastErro, confirmar, abrirModal, comCarregamento, debounce,
    duracao, numero, NIVEIS
} from "../ui.js";
import { icone } from "../icones.js";
import { capaCurso, estadoVazio } from "../componentes.js";
import { cabecalhoPagina, abrirMenuContexto, interruptor, areaDeSoltar, ligarAreaDeSoltar } from "./comum.js";

const estado = { busca: "", status: "", categoria: "", cursos: [], categorias: [] };
let contexto;

// ---------------------------------------------------------------------------
// Formulário de curso (cadastrar e editar) — reutilizado pelo editor de conteúdo
// ---------------------------------------------------------------------------
export async function formularioCurso(curso = null, aoSalvar = () => {}) {
    const categorias = await api.get("/admin/categorias");
    const novo = !curso;
    let arquivoCapa = null;
    let removerCapa = false;

    const { elemento, fechar } = abrirModal({
        titulo: novo ? "Novo curso" : "Editar informações do curso",
        subtitulo: novo ? "Depois de criar, você adiciona os módulos e as aulas." : curso.titulo,
        tamanho: "lg",
        conteudo: html`
            <form class="pilha" id="form-curso" novalidate>
                <div class="campo">
                    <label for="c-titulo">Título do curso *</label>
                    <input class="entrada" id="c-titulo" maxlength="160" value="${curso?.titulo || ""}" placeholder="Ex.: JavaScript do Zero ao Profissional" required>
                </div>
                <div class="campo">
                    <label for="c-resumo">Resumo</label>
                    <input class="entrada" id="c-resumo" maxlength="300" value="${curso?.resumo || ""}" placeholder="Uma frase que aparece no cartão do catálogo">
                </div>
                <div class="grade-3">
                    <div class="campo">
                        <label for="c-categoria">Categoria</label>
                        <select class="selecao" id="c-categoria">
                            <option value="">Sem categoria</option>
                            ${categorias.map((c) => html`<option value="${c.id}" ${curso?.categoria_id === c.id ? "selected" : ""}>${c.nome}</option>`)}
                        </select>
                    </div>
                    <div class="campo">
                        <label for="c-nivel">Nível</label>
                        <select class="selecao" id="c-nivel">
                            ${Object.entries(NIVEIS).map(([valor, rotulo]) => html`<option value="${valor}" ${curso?.nivel === valor ? "selected" : ""}>${rotulo}</option>`)}
                        </select>
                    </div>
                    <div class="campo">
                        <label for="c-instrutor">Instrutor</label>
                        <input class="entrada" id="c-instrutor" maxlength="120" value="${curso?.instrutor || ""}" placeholder="Nome do professor">
                    </div>
                </div>
                <div class="campo">
                    <label>Imagem de capa</label>
                    <div id="area-capa"></div>
                    <small>PNG, JPG, WEBP ou GIF de até 5 MB. Proporção recomendada 16:9 (ex.: 1280×720).</small>
                </div>
                <div class="campo">
                    <label for="c-descricao">Descrição completa <span class="mudo">(aceita Markdown: **negrito**, listas, títulos...)</span></label>
                    <textarea class="area-texto" id="c-descricao" rows="7" maxlength="20000" placeholder="## O que você vai aprender&#10;&#10;- Tópico 1&#10;- Tópico 2">${curso?.descricao || ""}</textarea>
                </div>
                <div class="grade-2">
                    ${interruptor({ id: "c-publicado", marcado: curso ? curso.publicado : false, rotulo: "Publicado", descricao: "Visível no catálogo para os alunos" })}
                    ${interruptor({ id: "c-destaque", marcado: curso ? curso.destaque : false, rotulo: "Destaque", descricao: "Aparece primeiro na página inicial" })}
                </div>
            </form>`,
        rodape: html`
            <button class="btn btn--fantasma" data-fechar>Cancelar</button>
            <button class="btn btn--primario" id="salvar-curso">${icone("salvar", 16)} ${novo ? "Criar curso" : "Salvar alterações"}</button>`
    });

    const desenharCapa = () => {
        const area = $("#area-capa", elemento);
        const urlLocal = arquivoCapa ? URL.createObjectURL(arquivoCapa) : null;
        const capaAtual = !removerCapa && curso?.capa;
        if (urlLocal || capaAtual) {
            renderizar(area, html`
                <div class="previa-capa">
                    <div class="capa"><img src="${urlLocal || urlArquivo(curso.capa)}" alt="Prévia da capa"></div>
                    <div class="previa-capa__acoes">
                        <label class="btn btn--sm">${icone("imagem", 15)} Trocar<input type="file" id="trocar-capa" accept="image/png,image/jpeg,image/webp,image/gif" hidden></label>
                        <button type="button" class="btn btn--sm btn--perigo" id="remover-capa">${icone("lixeira", 15)} Remover</button>
                    </div>
                </div>`);
            $("#trocar-capa", area).addEventListener("change", (evento) => {
                if (evento.target.files[0]) receber([evento.target.files[0]]);
            });
            $("#remover-capa", area).addEventListener("click", () => {
                arquivoCapa = null;
                removerCapa = true;
                desenharCapa();
            });
        } else {
            renderizar(area, areaDeSoltar({ id: "arquivo-capa", titulo: "Arraste a imagem de capa aqui", subtitulo: "ou clique para escolher", aceitar: "image/png,image/jpeg,image/webp,image/gif", nomeIcone: "imagem" }));
            ligarAreaDeSoltar(area, "arquivo-capa", receber);
        }
    };
    const receber = ([arquivo]) => {
        if (!/^image\/(png|jpe?g|webp|gif)$/.test(arquivo.type)) return toast("Envie uma imagem PNG, JPG, WEBP ou GIF.", "erro");
        if (arquivo.size > 5 * 1024 * 1024) return toast("A imagem deve ter no máximo 5 MB.", "erro");
        arquivoCapa = arquivo;
        removerCapa = false;
        desenharCapa();
    };
    desenharCapa();

    $("#salvar-curso", elemento).addEventListener("click", (evento) => comCarregamento(evento.currentTarget, async () => {
        const titulo = $("#c-titulo", elemento).value.trim();
        if (titulo.length < 3) {
            $("#c-titulo", elemento).setAttribute("aria-invalid", "true");
            $("#c-titulo", elemento).focus();
            return toast("Informe um título com pelo menos 3 caracteres.", "erro");
        }
        // FormData = multipart/form-data, necessário para enviar a imagem junto com os campos
        const formulario = new FormData();
        formulario.append("titulo", titulo);
        formulario.append("resumo", $("#c-resumo", elemento).value.trim());
        formulario.append("descricao", $("#c-descricao", elemento).value);
        formulario.append("categoria_id", $("#c-categoria", elemento).value);
        formulario.append("nivel", $("#c-nivel", elemento).value);
        formulario.append("instrutor", $("#c-instrutor", elemento).value.trim());
        formulario.append("publicado", String($("#c-publicado", elemento).checked));
        formulario.append("destaque", String($("#c-destaque", elemento).checked));
        if (arquivoCapa) formulario.append("capa", arquivoCapa);
        if (removerCapa) formulario.append("remover_capa", "true");

        try {
            const resposta = novo
                ? await api.enviar("/admin/cursos", formulario, "POST")
                : await api.enviar(`/admin/cursos/${curso.id}`, formulario, "PUT");
            toast(resposta.mensagem);
            fechar();
            aoSalvar(resposta.id);
        } catch (erro) {
            toastErro(erro);
        }
    }));
}

// ---------------------------------------------------------------------------
// Ações da lista
// ---------------------------------------------------------------------------
async function alternarPublicacao(curso) {
    try {
        const resposta = await api.patch(`/admin/cursos/${curso.id}/publicacao`, { publicado: !curso.publicado });
        toast(resposta.mensagem, resposta.publicado ? "sucesso" : "info");
        carregar();
    } catch (erro) {
        toastErro(erro);
    }
}

async function duplicar(curso) {
    try {
        const resposta = await api.post(`/admin/cursos/${curso.id}/duplicar`);
        toast(resposta.mensagem);
        carregar();
    } catch (erro) {
        toastErro(erro);
    }
}

async function excluir(curso) {
    const ok = await confirmar({
        titulo: `Excluir "${curso.titulo}"?`,
        mensagem: `Serão apagados ${curso.total_modulos} módulo(s), todas as aulas, materiais, arquivos enviados e o progresso de ${curso.total_alunos} aluno(s). Esta ação não pode ser desfeita.`,
        textoConfirmar: "Excluir curso",
        perigo: true
    });
    if (!ok) return;
    try {
        toast((await api.delete(`/admin/cursos/${curso.id}`)).mensagem);
        carregar();
    } catch (erro) {
        toastErro(erro);
    }
}

function cartao(curso) {
    return html`
        <article class="cartao-admin-curso">
            ${capaCurso(curso)}
            <div class="cartao-admin-curso__corpo">
                <div class="linha">
                    ${curso.publicado ? html`<span class="selo selo--ponto selo--publicado">Publicado</span>` : html`<span class="selo selo--ponto selo--rascunho">Rascunho</span>`}
                    ${curso.destaque ? html`<span class="selo selo--info">${icone("estrela", 11)} Destaque</span>` : ""}
                    <span class="selo">${NIVEIS[curso.nivel]}</span>
                </div>
                <h3>${curso.titulo}</h3>
                <p class="pequeno mudo">${curso.instrutor || "Sem instrutor definido"}</p>
                <div class="cartao-admin-curso__numeros">
                    <div><strong>${curso.total_modulos}</strong><span>módulos</span></div>
                    <div><strong>${curso.total_aulas}</strong><span>aulas</span></div>
                    <div><strong>${numero(curso.total_alunos)}</strong><span>alunos</span></div>
                    <div><strong>${duracao(curso.duracao_segundos).replace(" ", "")}</strong><span>duração</span></div>
                </div>
            </div>
            <div class="cartao-admin-curso__acoes">
                <a class="btn btn--sm btn--primario" href="#/cursos/${curso.id}">${icone("camadas", 15)} Gerenciar conteúdo</a>
                <button class="btn btn--sm btn--icone" data-publicar="${curso.id}" title="${curso.publicado ? "Mover para rascunho" : "Publicar"}">${icone(curso.publicado ? "olho-fechado" : "olho", 16)}</button>
                <button class="btn btn--sm btn--icone" data-mais="${curso.id}" aria-label="Mais ações">${icone("mais_opcoes", 16)}</button>
            </div>
        </article>`;
}

async function carregar() {
    const consulta = new URLSearchParams();
    if (estado.busca) consulta.set("busca", estado.busca);
    if (estado.status) consulta.set("status", estado.status);
    if (estado.categoria) consulta.set("categoria", estado.categoria);
    estado.cursos = await api.get(`/admin/cursos?${consulta}`);
    if (!contexto.ativa()) return;

    const area = $("#area-cursos");
    if (estado.cursos.length === 0) {
        renderizar(area, estadoVazio({
            icone: "livro",
            titulo: estado.busca || estado.status || estado.categoria ? "Nenhum curso com esses filtros" : "Nenhum curso cadastrado",
            texto: "Crie seu primeiro curso ou importe um curso completo a partir de um arquivo ZIP.",
            acao: html`<button class="btn btn--primario" data-novo>${icone("mais", 16)} Criar curso</button>`
        }));
        return;
    }
    renderizar(area, html`<div class="grade-admin-cursos">${estado.cursos.map(cartao)}</div>`);
}

export async function montar(alvo, ctx) {
    contexto = ctx;
    estado.categorias = await api.get("/admin/categorias");

    renderizar(alvo, html`
        ${cabecalhoPagina({
            titulo: "Cursos",
            descricao: "Crie, edite, publique e organize os cursos da plataforma.",
            acoes: html`
                <a class="btn" href="#/importar">${icone("pacote", 16)} Importar ZIP</a>
                <button class="btn btn--primario" data-novo>${icone("mais", 16)} Novo curso</button>`
        })}
        <div class="barra-ferramentas">
            <label class="entrada-icone">
                ${icone("busca", 17)}
                <input class="entrada" type="search" id="busca-cursos" placeholder="Buscar por título ou instrutor..." aria-label="Buscar cursos">
            </label>
            <select class="selecao" id="status-cursos" aria-label="Situação">
                <option value="">Todos</option><option value="publicados">Publicados</option><option value="rascunhos">Rascunhos</option>
            </select>
            <select class="selecao" id="categoria-cursos" aria-label="Categoria">
                <option value="">Todas as categorias</option>
                ${estado.categorias.map((c) => html`<option value="${c.id}">${c.nome}</option>`)}
            </select>
        </div>
        <div id="area-cursos"><div class="carregando-pagina"><span class="spinner"></span></div></div>`);

    const novoCurso = () => formularioCurso(null, (id) => ctx.app.navegar(`/cursos/${id}`));
    alvo.addEventListener("click", (evento) => {
        if (evento.target.closest("[data-novo]")) return novoCurso();
        const publicar = evento.target.closest("[data-publicar]");
        if (publicar) return alternarPublicacao(estado.cursos.find((c) => c.id === Number(publicar.dataset.publicar)));
        const mais = evento.target.closest("[data-mais]");
        if (mais) {
            const curso = estado.cursos.find((c) => c.id === Number(mais.dataset.mais));
            abrirMenuContexto(mais, [
                { rotulo: "Gerenciar conteúdo", icone: "camadas", acao: () => ctx.app.navegar(`/cursos/${curso.id}`) },
                { rotulo: "Editar informações", icone: "editar", acao: async () => formularioCurso(await api.get(`/admin/cursos/${curso.id}`), carregar) },
                { rotulo: "Pré-visualizar como aluno", icone: "olho", acao: () => window.open(`assistir.html?curso=${curso.id}`, "_blank") },
                curso.publicado && { rotulo: "Ver página pública", icone: "externo", acao: () => window.open(`curso.html?id=${curso.id}`, "_blank") },
                { rotulo: "Duplicar curso", icone: "copiar", acao: () => duplicar(curso) },
                "-",
                { rotulo: "Excluir curso", icone: "lixeira", perigo: true, acao: () => excluir(curso) }
            ]);
        }
    });
    $("#busca-cursos").addEventListener("input", debounce((evento) => {
        estado.busca = evento.target.value.trim();
        carregar();
    }, 300));
    $("#status-cursos").addEventListener("change", (evento) => {
        estado.status = evento.target.value;
        carregar();
    });
    $("#categoria-cursos").addEventListener("change", (evento) => {
        estado.categoria = evento.target.value;
        carregar();
    });

    await carregar();
    if (ctx.consulta.get("novo")) {
        history.replaceState(null, "", "#/cursos");
        novoCurso();
    }
}
