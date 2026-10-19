// Editor de conteúdo de um curso: módulos e aulas.
// Permite criar/editar/excluir, reordenar arrastando (inclusive mover aulas entre módulos),
// enviar aulas uma a uma ou em massa e publicar o curso.
import { api } from "../api.js";
import { html, renderizar, $, $$, toast, toastErro, confirmar, abrirModal, comCarregamento, duracao, bytes, plural, numero, NIVEIS } from "../ui.js";
import { icone, ICONE_POR_TIPO, NOME_POR_TIPO } from "../icones.js";
import { capaCurso, estadoVazio } from "../componentes.js";
import { formularioCurso } from "./cursos.js";
import { formularioAula, envioEmMassa, excluirAula } from "./aulaFormulario.js";

const CORES_TIPO = { video: "#7c5cff", audio: "#22d3ee", externo: "#f43f5e", texto: "#22c55e", arquivo: "#f59e0b" };

let curso;
let contexto;
let alvoTela;
let arrasto = null;

async function carregar() {
    curso = await api.get(`/admin/cursos/${contexto.parametros[0]}`);
    if (!contexto.ativa()) return;
    desenhar();
}

function linhaAula(aula) {
    const detalhes = [
        NOME_POR_TIPO[aula.tipo],
        aula.duracao_segundos ? duracao(aula.duracao_segundos) : null,
        aula.arquivo_tamanho ? bytes(aula.arquivo_tamanho) : null,
        aula.total_materiais ? plural(aula.total_materiais, "material", "materiais") : null
    ].filter(Boolean);
    return html`
        <li class="aula-editor" draggable="true" data-aula="${aula.id}">
            <span class="alca" title="Arraste para reordenar ou mover para outro módulo">${icone("arrastar", 16)}</span>
            <span class="aula-editor__tipo" data-cor="${CORES_TIPO[aula.tipo]}">${icone(ICONE_POR_TIPO[aula.tipo], 17)}</span>
            <div class="aula-editor__info">
                <strong>${aula.titulo}</strong>
                <span>${detalhes.map((item) => html`<span>${item}</span>`)}</span>
            </div>
            ${aula.publicado ? "" : html`<span class="selo selo--rascunho">Rascunho</span>`}
            <button class="btn btn--sm btn--fantasma btn--icone" data-editar-aula="${aula.id}" title="Editar aula" aria-label="Editar ${aula.titulo}">${icone("editar", 15)}</button>
            <button class="btn btn--sm btn--fantasma btn--icone" data-excluir-aula="${aula.id}" title="Excluir aula" aria-label="Excluir ${aula.titulo}">${icone("lixeira", 15)}</button>
        </li>`;
}

function cartaoModulo(modulo, indice) {
    const total = modulo.aulas.reduce((soma, aula) => soma + aula.duracao_segundos, 0);
    return html`
        <section class="modulo-editor" data-modulo="${modulo.id}">
            <div class="modulo-editor__cabecalho">
                <span class="alca" data-alca-modulo title="Arraste para reordenar o módulo">${icone("arrastar", 18)}</span>
                <div class="modulo-editor__info">
                    <small>Módulo ${indice + 1}</small>
                    <strong>${modulo.titulo}</strong>
                    <span>${plural(modulo.aulas.length, "aula")} · ${duracao(total)}${modulo.descricao ? ` · ${modulo.descricao}` : ""}</span>
                </div>
                <div class="modulo-editor__acoes">
                    <button class="btn btn--sm" data-nova-aula="${modulo.id}">${icone("mais", 15)} Aula</button>
                    <button class="btn btn--sm" data-lote="${modulo.id}">${icone("enviar", 15)} Upload em massa</button>
                    <button class="btn btn--sm btn--fantasma btn--icone" data-editar-modulo="${modulo.id}" title="Editar módulo" aria-label="Editar módulo">${icone("editar", 15)}</button>
                    <button class="btn btn--sm btn--fantasma btn--icone" data-excluir-modulo="${modulo.id}" title="Excluir módulo" aria-label="Excluir módulo">${icone("lixeira", 15)}</button>
                </div>
            </div>
            <ul class="aulas-editor" data-lista-aulas="${modulo.id}">
                ${modulo.aulas.length
                    ? modulo.aulas.map(linhaAula)
                    : html`<li class="aulas-vazio">Nenhuma aula ainda — adicione uma aula, faça upload em massa ou arraste aulas de outro módulo para cá.</li>`}
            </ul>
        </section>`;
}

function desenhar() {
    const totalSegundos = curso.modulos.flatMap((m) => m.aulas).reduce((soma, aula) => soma + aula.duracao_segundos, 0);
    renderizar(alvoTela, html`
        <a class="btn btn--fantasma btn--sm" href="#/cursos">${icone("voltar", 15)} Todos os cursos</a>
        <div class="editor-topo espaco-topo">
            ${capaCurso(curso)}
            <div class="editor-topo__info">
                <div class="linha">
                    ${curso.publicado ? html`<span class="selo selo--ponto selo--publicado">Publicado</span>` : html`<span class="selo selo--ponto selo--rascunho">Rascunho</span>`}
                    <span class="selo">${NIVEIS[curso.nivel]}</span>
                    ${curso.categoria_nome ? html`<span class="selo selo--ponto" data-cor="${curso.categoria_cor}">${curso.categoria_nome}</span>` : ""}
                </div>
                <h1>${curso.titulo}</h1>
                <div class="editor-topo__numeros">
                    <span>${icone("camadas", 14)} ${plural(curso.modulos.length, "módulo")}</span>
                    <span>${icone("play-circulo", 14)} ${plural(curso.total_aulas_todas, "aula")}</span>
                    <span>${icone("relogio", 14)} ${duracao(totalSegundos)}</span>
                    <span>${icone("usuarios", 14)} ${plural(numero(curso.total_alunos), "aluno")}</span>
                </div>
            </div>
            <div class="editor-topo__acoes">
                <a class="btn" href="assistir.html?curso=${curso.id}" target="_blank" rel="noopener">${icone("olho", 16)} Pré-visualizar</a>
                <button class="btn" id="editar-curso">${icone("editar", 16)} Editar informações</button>
                <button class="btn ${curso.publicado ? "" : "btn--primario"}" id="publicar-curso">${icone(curso.publicado ? "olho-fechado" : "foguete", 16)} ${curso.publicado ? "Despublicar" : "Publicar curso"}</button>
            </div>
        </div>

        ${curso.publicado && curso.total_aulas === 0 ? html`
            <div class="alerta alerta--alerta margem-abaixo">${icone("aviso", 18)}<div><strong>Curso publicado sem aulas</strong><p>Os alunos verão o curso, mas sem conteúdo. Adicione aulas publicadas.</p></div></div>` : ""}

        <div id="lista-modulos">
            ${curso.modulos.length
                ? curso.modulos.map(cartaoModulo)
                : estadoVazio({ icone: "camadas", titulo: "Comece criando o primeiro módulo", texto: "Módulos organizam as aulas em etapas. Você também pode importar um curso completo via ZIP." })}
        </div>

        <form class="novo-modulo" id="form-novo-modulo">
            <input class="entrada" id="titulo-novo-modulo" maxlength="160" placeholder="Nome do novo módulo (ex.: Fundamentos)" aria-label="Nome do novo módulo">
            <button class="btn btn--primario" type="submit">${icone("mais", 16)} Adicionar módulo</button>
            <a class="btn" href="#/importar?curso=${curso.id}">${icone("pacote", 16)} Importar ZIP</a>
        </form>`);
}

// ---------------------------------------------------------------------------
// Módulos
// ---------------------------------------------------------------------------
function formularioModulo(modulo) {
    const { elemento, fechar } = abrirModal({
        titulo: "Editar módulo",
        tamanho: "sm",
        conteudo: html`
            <div class="pilha">
                <div class="campo"><label for="m-titulo">Título</label><input class="entrada" id="m-titulo" maxlength="160" value="${modulo.titulo}"></div>
                <div class="campo"><label for="m-descricao">Descrição (opcional)</label><textarea class="area-texto" id="m-descricao" maxlength="500" rows="3">${modulo.descricao || ""}</textarea></div>
            </div>`,
        rodape: html`<button class="btn btn--fantasma" data-fechar>Cancelar</button><button class="btn btn--primario" id="salvar-modulo">${icone("salvar", 16)} Salvar</button>`
    });
    $("#salvar-modulo", elemento).addEventListener("click", (evento) => comCarregamento(evento.currentTarget, async () => {
        try {
            await api.put(`/admin/modulos/${modulo.id}`, { titulo: $("#m-titulo", elemento).value.trim(), descricao: $("#m-descricao", elemento).value.trim() });
            toast("Módulo atualizado.");
            fechar();
            carregar();
        } catch (erro) {
            toastErro(erro);
        }
    }));
}

async function excluirModulo(modulo) {
    const ok = await confirmar({
        titulo: `Excluir o módulo "${modulo.titulo}"?`,
        mensagem: `As ${modulo.aulas.length} aula(s) deste módulo, seus arquivos e materiais serão apagados permanentemente.`,
        textoConfirmar: "Excluir módulo", perigo: true
    });
    if (!ok) return;
    try {
        toast((await api.delete(`/admin/modulos/${modulo.id}`)).mensagem);
        carregar();
    } catch (erro) {
        toastErro(erro);
    }
}

// ---------------------------------------------------------------------------
// Arrastar e soltar (HTML5 Drag and Drop)
// ---------------------------------------------------------------------------
function limparMarcas() {
    $$(".alvo-acima, .alvo-abaixo, .alvo-soltar", alvoTela).forEach((el) => el.classList.remove("alvo-acima", "alvo-abaixo", "alvo-soltar"));
}

function ligarArrastar() {
    // Os eventos ficam no contêiner da tela (estável), pois a lista é redesenhada a cada alteração
    const lista = alvoTela;

    // A alça do módulo habilita o arraste do módulo inteiro
    lista.addEventListener("mousedown", (evento) => {
        const alca = evento.target.closest("[data-alca-modulo]");
        if (alca) alca.closest(".modulo-editor").draggable = true;
    });

    lista.addEventListener("dragstart", (evento) => {
        const aula = evento.target.closest?.(".aula-editor");
        const modulo = evento.target.closest?.(".modulo-editor");
        if (aula) {
            arrasto = { tipo: "aula", elemento: aula };
        } else if (modulo?.draggable) {
            arrasto = { tipo: "modulo", elemento: modulo };
        } else {
            return;
        }
        evento.dataTransfer.effectAllowed = "move";
        evento.dataTransfer.setData("text/plain", arrasto.tipo);
        requestAnimationFrame(() => arrasto?.elemento.classList.add("arrastando"));
    });

    lista.addEventListener("dragover", (evento) => {
        if (!arrasto) return;
        evento.preventDefault();
        limparMarcas();
        if (arrasto.tipo === "aula") {
            const alvo = evento.target.closest(".aula-editor");
            if (alvo && alvo !== arrasto.elemento) {
                const meio = alvo.getBoundingClientRect().top + alvo.offsetHeight / 2;
                alvo.classList.add(evento.clientY < meio ? "alvo-acima" : "alvo-abaixo");
            } else if (!alvo) {
                evento.target.closest(".modulo-editor")?.classList.add("alvo-soltar");
            }
        } else {
            const alvo = evento.target.closest(".modulo-editor");
            if (alvo && alvo !== arrasto.elemento) alvo.classList.add("alvo-soltar");
        }
    });

    lista.addEventListener("dragleave", (evento) => {
        if (!lista.contains(evento.relatedTarget)) limparMarcas();
    });

    lista.addEventListener("drop", async (evento) => {
        if (!arrasto) return;
        evento.preventDefault();
        const { tipo, elemento } = arrasto;
        limparMarcas();

        if (tipo === "aula") {
            const alvoAula = evento.target.closest(".aula-editor");
            const modulo = evento.target.closest(".modulo-editor");
            if (!modulo) return;
            const ul = $(".aulas-editor", modulo);
            $(".aulas-vazio", ul)?.remove();
            if (alvoAula && alvoAula !== elemento) {
                const meio = alvoAula.getBoundingClientRect().top + alvoAula.offsetHeight / 2;
                alvoAula[evento.clientY < meio ? "before" : "after"](elemento);
            } else if (!alvoAula) {
                ul.appendChild(elemento);
            }
            const ids = $$(".aula-editor", ul).map((item) => Number(item.dataset.aula));
            try {
                await api.put(`/admin/modulos/${modulo.dataset.modulo}/aulas/ordem`, { ids });
                toast("Ordem das aulas salva.", "sucesso", 2000);
            } catch (erro) {
                toastErro(erro);
            }
        } else {
            const alvoModulo = evento.target.closest(".modulo-editor");
            if (alvoModulo && alvoModulo !== elemento) {
                const meio = alvoModulo.getBoundingClientRect().top + alvoModulo.offsetHeight / 2;
                alvoModulo[evento.clientY < meio ? "before" : "after"](elemento);
                const ids = $$(".modulo-editor", $("#lista-modulos", alvoTela)).map((item) => Number(item.dataset.modulo));
                try {
                    await api.put(`/admin/cursos/${curso.id}/modulos/ordem`, { ids });
                    toast("Ordem dos módulos salva.", "sucesso", 2000);
                } catch (erro) {
                    toastErro(erro);
                }
            }
        }
        carregar();
    });

    lista.addEventListener("dragend", () => {
        arrasto?.elemento.classList.remove("arrastando");
        $$(".modulo-editor", lista).forEach((modulo) => (modulo.draggable = false));
        arrasto = null;
        limparMarcas();
    });
}

// ---------------------------------------------------------------------------
// Montagem da tela
// ---------------------------------------------------------------------------
export async function montar(alvo, ctx) {
    contexto = ctx;
    alvoTela = alvo;
    await carregar();
    if (!ctx.ativa()) return;

    const moduloPorId = (id) => curso.modulos.find((m) => m.id === Number(id));
    const aulaPorId = (id) => curso.modulos.flatMap((m) => m.aulas.map((a) => ({ ...a, modulo: m }))).find((a) => a.id === Number(id));

    alvo.addEventListener("click", async (evento) => {
        const botao = evento.target.closest("button");
        if (!botao) return;

        if (botao.id === "editar-curso") {
            return formularioCurso(await api.get(`/admin/cursos/${curso.id}`), carregar);
        }
        if (botao.id === "publicar-curso") {
            return comCarregamento(botao, async () => {
                try {
                    const resposta = await api.patch(`/admin/cursos/${curso.id}/publicacao`, { publicado: !curso.publicado });
                    toast(resposta.mensagem);
                    carregar();
                } catch (erro) {
                    toastErro(erro);
                }
            });
        }
        if (botao.dataset.novaAula) {
            return formularioAula({ modulo: moduloPorId(botao.dataset.novaAula), aoSalvar: carregar });
        }
        if (botao.dataset.lote) {
            return envioEmMassa({ modulo: moduloPorId(botao.dataset.lote), aoConcluir: carregar });
        }
        if (botao.dataset.editarModulo) return formularioModulo(moduloPorId(botao.dataset.editarModulo));
        if (botao.dataset.excluirModulo) return excluirModulo(moduloPorId(botao.dataset.excluirModulo));
        if (botao.dataset.editarAula) {
            const resumo = aulaPorId(botao.dataset.editarAula);
            const completa = await api.get(`/admin/aulas/${resumo.id}`);
            return formularioAula({ modulo: resumo.modulo, aula: completa, aoSalvar: carregar });
        }
        if (botao.dataset.excluirAula) return excluirAula(aulaPorId(botao.dataset.excluirAula), carregar);
    });

    alvo.addEventListener("submit", async (evento) => {
        if (evento.target.id !== "form-novo-modulo") return;
        evento.preventDefault();
        const campo = $("#titulo-novo-modulo", alvo);
        const titulo = campo.value.trim();
        if (titulo.length < 2) {
            campo.focus();
            return toast("Digite o nome do módulo.", "erro");
        }
        try {
            await api.post(`/admin/cursos/${curso.id}/modulos`, { titulo });
            toast("Módulo criado.");
            await carregar();
            $("#titulo-novo-modulo", alvo)?.focus();
        } catch (erro) {
            toastErro(erro);
        }
    });

    ligarArrastar();
}
