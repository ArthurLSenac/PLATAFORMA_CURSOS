// Formulários de aula: cadastro/edição (com upload e progresso), materiais de apoio
// e o envio EM MASSA (vários arquivos de uma vez, cada um vira uma aula).
import { api, enviarComProgresso } from "../api.js";
import {
    html, renderizar, $, $$, toast, toastErro, abrirModal, confirmar, bytes, relogio, lerRelogio
} from "../ui.js";
import { icone, ICONE_POR_TIPO, NOME_POR_TIPO } from "../icones.js";
import { markdownParaHtml } from "../markdown.js";
import { areaDeSoltar, ligarAreaDeSoltar, lerDuracaoLocal, interruptor } from "./comum.js";

export const EXTENSOES = {
    video: [".mp4", ".webm", ".mov", ".m4v", ".ogv"],
    audio: [".mp3", ".m4a", ".wav", ".ogg", ".oga", ".aac"],
    arquivo: [".pdf", ".zip", ".docx", ".xlsx", ".pptx", ".odt", ".ods", ".odp", ".doc", ".xls", ".ppt", ".txt", ".md", ".csv", ".json", ".epub"]
};
const TODAS = [...EXTENSOES.video, ...EXTENSOES.audio, ...EXTENSOES.arquivo];

export const extensao = (nome) => (/\.[^.]+$/.exec(nome.toLowerCase()) || [""])[0];
export const tipoPorExtensao = (ext) => Object.keys(EXTENSOES).find((tipo) => EXTENSOES[tipo].includes(ext)) || null;

// Mesma regra do servidor: "03 - introducao_ao_curso.mp4" → "Introducao ao curso"
export function tituloDoArquivo(nome) {
    const base = nome.replace(/\.[^.]+$/, "");
    let titulo = base.replace(/^\s*(aula|modulo|módulo|parte)?\s*\d+\s*[-_.)–:]*\s*/i, "").replace(/_+/g, " ").replace(/\s+/g, " ").trim();
    if (!titulo) titulo = base.replace(/_+/g, " ").trim() || "Aula";
    return titulo.charAt(0).toUpperCase() + titulo.slice(1);
}

const compararNatural = (a, b) => a.localeCompare(b, "pt-BR", { numeric: true, sensitivity: "base" });

function idDoYoutube(url) {
    try {
        const u = new URL(url);
        const host = u.hostname.replace(/^(www\.|m\.)/, "");
        if (host === "youtu.be") return u.pathname.split("/")[1];
        if (host === "youtube.com") return u.searchParams.get("v") || (/^\/(?:embed|shorts|live)\/([^/?#]+)/.exec(u.pathname) || [])[1];
    } catch { /* link inválido */ }
    return null;
}

// ---------------------------------------------------------------------------
// Editor de Markdown com barra de ferramentas e pré-visualização
// ---------------------------------------------------------------------------
function editorMarkdown(id, valor = "") {
    return html`
        <div class="editor-markdown">
            <div class="editor-markdown__barra">
                <button type="button" class="btn btn--fantasma btn--icone btn--sm" data-md="titulo" title="Título">${icone("titulo", 15)}</button>
                <button type="button" class="btn btn--fantasma btn--icone btn--sm" data-md="negrito" title="Negrito">${icone("negrito", 15)}</button>
                <button type="button" class="btn btn--fantasma btn--icone btn--sm" data-md="italico" title="Itálico">${icone("italico", 15)}</button>
                <span class="separador"></span>
                <button type="button" class="btn btn--fantasma btn--icone btn--sm" data-md="lista" title="Lista">${icone("lista", 15)}</button>
                <button type="button" class="btn btn--fantasma btn--icone btn--sm" data-md="citacao" title="Citação">${icone("citacao", 15)}</button>
                <button type="button" class="btn btn--fantasma btn--icone btn--sm" data-md="codigo" title="Bloco de código">${icone("codigo", 15)}</button>
                <button type="button" class="btn btn--fantasma btn--icone btn--sm" data-md="link" title="Link">${icone("link", 15)}</button>
                <div class="abas">
                    <button type="button" class="aba" data-modo="escrever" aria-selected="true">Escrever</button>
                    <button type="button" class="aba" data-modo="previa" aria-selected="false">Pré-visualizar</button>
                </div>
            </div>
            <textarea class="area-texto" id="${id}" maxlength="200000" placeholder="# Título da aula&#10;&#10;Escreva o conteúdo usando Markdown...">${valor}</textarea>
            <div class="markdown" data-previa hidden></div>
        </div>`;
}

const FORMATOS = {
    titulo: ["## ", ""], negrito: ["**", "**"], italico: ["*", "*"], lista: ["- ", ""], citacao: ["> ", ""],
    codigo: ["```js\n", "\n```"], link: ["[", "](https://)"]
};

function ligarEditorMarkdown(raiz, id) {
    const area = $(`#${id}`, raiz);
    const previa = $("[data-previa]", raiz);
    $$("[data-md]", raiz).forEach((botao) => botao.addEventListener("click", () => {
        const [antes, depois] = FORMATOS[botao.dataset.md];
        const { selectionStart: inicio, selectionEnd: fim, value } = area;
        const selecionado = value.slice(inicio, fim) || (botao.dataset.md === "link" ? "texto do link" : "texto");
        area.setRangeText(`${antes}${selecionado}${depois}`, inicio, fim, "end");
        area.focus();
    }));
    $$("[data-modo]", raiz).forEach((aba) => aba.addEventListener("click", () => {
        const previsualizar = aba.dataset.modo === "previa";
        $$("[data-modo]", raiz).forEach((outra) => outra.setAttribute("aria-selected", String(outra === aba)));
        area.hidden = previsualizar;
        previa.hidden = !previsualizar;
        if (previsualizar) previa.innerHTML = markdownParaHtml(area.value) || "<p>Nada para mostrar ainda.</p>";
    }));
}

// ---------------------------------------------------------------------------
// Cadastro / edição de aula
// ---------------------------------------------------------------------------
export function formularioAula({ modulo, aula = null, aoSalvar }) {
    const nova = !aula;
    let tipo = aula?.tipo || "video";
    let arquivo = null;
    let duracaoDetectada = null;

    const { elemento, fechar } = abrirModal({
        titulo: nova ? "Nova aula" : "Editar aula",
        subtitulo: `Módulo: ${modulo.titulo}`,
        tamanho: "lg",
        fecharNoFundo: false,
        conteudo: html`
            <form class="pilha" id="form-aula" novalidate>
                <div class="campo">
                    <span class="rotulo">Tipo de aula</span>
                    <div class="seletor-tipo" role="radiogroup">
                        ${["video", "audio", "externo", "texto", "arquivo"].map((opcao) => html`
                            <label class="opcao-tipo">
                                <input type="radio" name="tipo-aula" value="${opcao}" ${opcao === tipo ? "checked" : ""}>
                                <span>${icone(ICONE_POR_TIPO[opcao], 20)} ${NOME_POR_TIPO[opcao]}</span>
                            </label>`)}
                    </div>
                </div>
                <div class="campo">
                    <label for="a-titulo">Título da aula *</label>
                    <input class="entrada" id="a-titulo" maxlength="160" value="${aula?.titulo || ""}" placeholder="Ex.: Introdução ao módulo">
                </div>
                <div id="campos-tipo"></div>
                <div class="campo">
                    <label for="a-descricao">Descrição <span class="mudo">(opcional, aparece abaixo do player)</span></label>
                    <textarea class="area-texto" id="a-descricao" rows="3" maxlength="5000">${aula?.descricao || ""}</textarea>
                </div>
                <div class="grade-2">
                    <div class="campo">
                        <label for="a-duracao">Duração (mm:ss ou hh:mm:ss)</label>
                        <input class="entrada" id="a-duracao" value="${aula?.duracao_segundos ? relogio(aula.duracao_segundos) : ""}" placeholder="Detectada automaticamente">
                    </div>
                    <div class="campo">
                        <span class="rotulo">Visibilidade</span>
                        ${interruptor({ id: "a-publicado", marcado: aula ? aula.publicado : true, rotulo: "Publicada", descricao: "Desligue para manter como rascunho" })}
                    </div>
                </div>
                <div class="barra-envio" id="progresso-envio" hidden>
                    <div class="barra-envio__texto"><span>Enviando arquivo...</span><strong id="percentual-envio">0%</strong></div>
                    <div class="progresso"><div class="progresso__barra" id="barra-envio"></div></div>
                </div>
                ${nova ? "" : html`
                    <div class="campo espaco-topo">
                        <span class="rotulo">${icone("clipe", 14)} Materiais de apoio</span>
                        <div id="lista-materiais"></div>
                        <div id="area-materiais"></div>
                    </div>`}
            </form>`,
        rodape: html`
            <button class="btn btn--fantasma" data-fechar>Cancelar</button>
            <button class="btn btn--primario" id="salvar-aula">${icone("salvar", 16)} ${nova ? "Criar aula" : "Salvar aula"}</button>`
    });

    const campos = $("#campos-tipo", elemento);

    function desenharArquivo() {
        const area = $("#arquivo-aula-area", campos);
        if (!area) return;
        if (arquivo) {
            renderizar(area, html`
                <div class="arquivo-atual">
                    ${icone(ICONE_POR_TIPO[tipo], 20)}
                    <div><strong>${arquivo.name}</strong><span>${bytes(arquivo.size)}${duracaoDetectada ? ` · ${relogio(duracaoDetectada)}` : ""} · será enviado ao salvar</span></div>
                    <button type="button" class="btn btn--sm btn--fantasma" id="trocar-arquivo">Trocar</button>
                </div>`);
            $("#trocar-arquivo", area).addEventListener("click", () => {
                arquivo = null;
                desenharArquivo();
            });
            return;
        }
        const atual = aula?.possui_arquivo && aula.tipo === tipo;
        renderizar(area, html`
            ${atual ? html`
                <div class="arquivo-atual">
                    ${icone("check-circulo", 20)}
                    <div><strong>${aula.arquivo_nome}</strong><span>${bytes(aula.arquivo_tamanho)} · arquivo atual (envie outro para substituir)</span></div>
                </div>` : ""}
            ${areaDeSoltar({
                id: "arquivo-aula",
                titulo: atual ? "Substituir arquivo" : `Arraste o arquivo de ${NOME_POR_TIPO[tipo].toLowerCase()} aqui`,
                subtitulo: `ou clique para escolher · ${EXTENSOES[tipo].join(", ")}`,
                aceitar: EXTENSOES[tipo].join(","),
                nomeIcone: ICONE_POR_TIPO[tipo]
            })}`);
        ligarAreaDeSoltar(area, "arquivo-aula", async ([escolhido]) => {
            if (!EXTENSOES[tipo].includes(extensao(escolhido.name))) {
                return toast(`Formato inválido para ${NOME_POR_TIPO[tipo]}. Use: ${EXTENSOES[tipo].join(", ")}`, "erro");
            }
            arquivo = escolhido;
            if (!$("#a-titulo", elemento).value.trim()) $("#a-titulo", elemento).value = tituloDoArquivo(escolhido.name);
            duracaoDetectada = await lerDuracaoLocal(escolhido);
            if (duracaoDetectada) $("#a-duracao", elemento).value = relogio(duracaoDetectada);
            desenharArquivo();
        });
    }

    function desenharCamposDoTipo() {
        if (tipo === "externo") {
            renderizar(campos, html`
                <div class="campo">
                    <label for="a-url">Link do vídeo (YouTube ou Vimeo) *</label>
                    <input class="entrada" id="a-url" type="url" maxlength="500" value="${aula?.url_externa || ""}" placeholder="https://www.youtube.com/watch?v=...">
                    <div id="previa-externo"></div>
                </div>`);
            const atualizar = () => {
                const url = $("#a-url", campos).value.trim();
                const id = idDoYoutube(url);
                const alvo = $("#previa-externo", campos);
                if (id && /^[\w-]{11}$/.test(id)) {
                    renderizar(alvo, html`<div class="previa-externo"><img src="https://i.ytimg.com/vi/${id}/mqdefault.jpg" alt=""><span>${icone("check-circulo", 16)} Vídeo do YouTube reconhecido</span></div>`);
                } else if (/vimeo\.com\/(video\/)?\d{6,}/.test(url)) {
                    renderizar(alvo, html`<div class="previa-externo">${icone("check-circulo", 16)} Vídeo do Vimeo reconhecido</div>`);
                } else {
                    alvo.innerHTML = url ? String(html`<small class="ajuda">Cole um link do YouTube (youtube.com/watch, youtu.be, shorts) ou do Vimeo.</small>`) : "";
                }
            };
            $("#a-url", campos).addEventListener("input", atualizar);
            atualizar();
        } else if (tipo === "texto") {
            renderizar(campos, html`<div class="campo"><span class="rotulo">Conteúdo da aula *</span>${editorMarkdown("a-conteudo", aula?.conteudo || "")}</div>`);
            ligarEditorMarkdown(campos, "a-conteudo");
        } else {
            renderizar(campos, html`<div class="campo"><span class="rotulo">Arquivo *</span><div id="arquivo-aula-area"></div></div>`);
            desenharArquivo();
        }
    }

    $$("[name=tipo-aula]", elemento).forEach((radio) => radio.addEventListener("change", () => {
        tipo = radio.value;
        if (arquivo && !EXTENSOES[tipo]?.includes(extensao(arquivo.name))) arquivo = null;
        desenharCamposDoTipo();
    }));
    desenharCamposDoTipo();

    // Materiais (somente na edição)
    async function desenharMateriais() {
        const lista = $("#lista-materiais", elemento);
        if (!lista) return;
        const atual = await api.get(`/admin/aulas/${aula.id}`);
        renderizar(lista, html`${atual.materiais.length
            ? atual.materiais.map((m) => html`
                <div class="material-admin">${icone("arquivo", 16)}<span>${m.nome}</span><small>${bytes(m.tamanho)}</small>
                    <button type="button" class="btn btn--sm btn--fantasma btn--icone" data-excluir-material="${m.id}" aria-label="Excluir material">${icone("lixeira", 15)}</button>
                </div>`)
            : html`<p class="ajuda">Nenhum material anexado.</p>`}`);
        $$("[data-excluir-material]", lista).forEach((botao) => botao.addEventListener("click", async () => {
            try {
                await api.delete(`/admin/materiais/${botao.dataset.excluirMaterial}`);
                toast("Material excluído.");
                desenharMateriais();
            } catch (erro) {
                toastErro(erro);
            }
        }));
    }
    if (!nova) {
        renderizar($("#area-materiais", elemento), areaDeSoltar({ id: "arquivos-materiais", titulo: "Anexar materiais", subtitulo: "PDF, planilhas, apresentações, imagens, ZIP... (vários de uma vez)", multiplo: true, nomeIcone: "clipe" }));
        ligarAreaDeSoltar(elemento, "arquivos-materiais", async (arquivos) => {
            const formulario = new FormData();
            arquivos.forEach((item) => formulario.append("arquivos", item));
            try {
                toast(`Enviando ${arquivos.length} material(is)...`, "info", 2000);
                const resposta = await enviarComProgresso(`/admin/aulas/${aula.id}/materiais`, formulario);
                toast(resposta.mensagem);
                desenharMateriais();
            } catch (erro) {
                toastErro(erro);
            }
        });
        desenharMateriais();
    }

    const controlador = new AbortController();
    $("#salvar-aula", elemento).addEventListener("click", async (evento) => {
        const botao = evento.currentTarget;
        const titulo = $("#a-titulo", elemento).value.trim();
        const formulario = new FormData();
        formulario.append("tipo", tipo);
        if (titulo) formulario.append("titulo", titulo);
        formulario.append("descricao", $("#a-descricao", elemento).value.trim());
        formulario.append("publicado", String($("#a-publicado", elemento).checked));

        const textoDuracao = $("#a-duracao", elemento).value.trim();
        if (textoDuracao) {
            const segundos = lerRelogio(textoDuracao);
            if (segundos === null) return toast("Duração inválida. Use mm:ss (ex.: 12:30).", "erro");
            formulario.append("duracao_segundos", String(segundos));
        }

        if (tipo === "externo") formulario.append("url_externa", $("#a-url", elemento).value.trim());
        if (tipo === "texto") formulario.append("conteudo", $("#a-conteudo", elemento).value);
        if (["video", "audio", "arquivo"].includes(tipo)) {
            if (arquivo) formulario.append("arquivo", arquivo);
            else if (!(aula?.possui_arquivo && aula.tipo === tipo)) return toast("Selecione o arquivo da aula.", "erro");
        }
        if (!titulo && !arquivo) return toast("Informe o título da aula.", "erro");

        botao.disabled = true;
        const progresso = $("#progresso-envio", elemento);
        progresso.hidden = !arquivo;
        try {
            const resposta = await enviarComProgresso(
                nova ? `/admin/modulos/${modulo.id}/aulas` : `/admin/aulas/${aula.id}`,
                formulario,
                {
                    metodo: nova ? "POST" : "PUT",
                    sinal: controlador.signal,
                    aoProgredir: (percentual) => {
                        $("#percentual-envio", elemento).textContent = `${percentual}%`;
                        $("#barra-envio", elemento).style.setProperty("--largura", `${percentual}%`);
                        if (percentual === 100) $(".barra-envio__texto span", elemento).textContent = "Processando no servidor...";
                    }
                }
            );
            toast(resposta.mensagem);
            fechar();
            aoSalvar?.();
        } catch (erro) {
            if (erro.codigo !== "CANCELADO") toastErro(erro);
            botao.disabled = false;
            progresso.hidden = true;
        }
    });
    elemento.querySelectorAll("[data-fechar]").forEach((botao) => botao.addEventListener("click", () => controlador.abort()));
}

// ---------------------------------------------------------------------------
// Upload em massa: cada arquivo vira uma aula do módulo
// ---------------------------------------------------------------------------
export function envioEmMassa({ modulo, aoConcluir }) {
    const fila = [];
    let enviando = false;
    let houveEnvio = false;
    let controladorAtual = null;

    const { elemento, fechar } = abrirModal({
        titulo: "Upload de aulas em massa",
        subtitulo: `Módulo: ${modulo.titulo} · cada arquivo vira uma aula, em ordem alfabética/numérica`,
        tamanho: "lg",
        fecharNoFundo: false,
        aoFechar: () => {
            controladorAtual?.abort();
            if (houveEnvio) aoConcluir?.();
        },
        conteudo: html`
            ${areaDeSoltar({
                id: "arquivos-lote",
                titulo: "Arraste vídeos, áudios, PDFs e documentos aqui",
                subtitulo: "Até 50 arquivos por vez · dica: numere os arquivos (01 - Introdução.mp4) para definir a ordem",
                aceitar: TODAS.join(","),
                multiplo: true,
                nomeIcone: "enviar"
            })}
            <div class="linha-entre espaco-topo">
                ${interruptor({ id: "lote-publicar", marcado: true, rotulo: "Publicar as aulas imediatamente" })}
                <div class="resumo-fila" id="resumo-fila"></div>
            </div>
            <div class="fila-envio" id="fila-envio"></div>`,
        rodape: html`
            <button class="btn btn--fantasma" data-fechar id="fechar-lote">Fechar</button>
            <button class="btn btn--primario" id="iniciar-lote" disabled>${icone("enviar", 16)} Enviar arquivos</button>`
    });

    const textoEstado = (item) => ({
        aguardando: "Aguardando",
        enviando: `${item.progresso}%`,
        processando: "Processando...",
        concluido: "✓ Aula criada",
        erro: "Erro"
    }[item.estado]);

    function desenharFila() {
        const lista = $("#fila-envio", elemento);
        renderizar(lista, html`${fila.map((item, indice) => html`
            <div class="item-fila" data-estado="${item.estado}">
                <span class="item-fila__icone">${icone(ICONE_POR_TIPO[item.tipo], 18)}</span>
                <div class="item-fila__info">
                    <strong>${item.titulo}</strong>
                    <span>${item.arquivo.name} · ${bytes(item.arquivo.size)}${item.duracao ? ` · ${relogio(item.duracao)}` : ""}${item.erro ? ` · ${item.erro}` : ""}</span>
                    ${item.estado === "enviando" || item.estado === "processando" ? html`<div class="progresso"><div class="progresso__barra" data-largura="${item.progresso}"></div></div>` : ""}
                </div>
                <div class="linha">
                    <span class="item-fila__estado">${textoEstado(item)}</span>
                    ${item.estado === "aguardando" && !enviando ? html`<button class="btn btn--sm btn--fantasma btn--icone" data-remover="${indice}" aria-label="Remover da fila">${icone("x", 14)}</button>` : ""}
                    ${item.estado === "erro" && !enviando ? html`<button class="btn btn--sm" data-tentar="${indice}">Tentar de novo</button>` : ""}
                </div>
            </div>`)}`);
        const pendentes = fila.filter((item) => item.estado === "aguardando").length;
        const concluidos = fila.filter((item) => item.estado === "concluido").length;
        const tamanho = fila.reduce((soma, item) => soma + item.arquivo.size, 0);
        $("#resumo-fila", elemento).textContent = fila.length ? `${fila.length} arquivo(s) · ${bytes(tamanho)} · ${concluidos} concluído(s)` : "";
        const botao = $("#iniciar-lote", elemento);
        botao.disabled = enviando || pendentes === 0;
        renderizar(botao, enviando ? html`<span class="spinner"></span> Enviando...` : html`${icone("enviar", 16)} Enviar ${pendentes} arquivo(s)`);
    }

    function atualizarItem(item) {
        // Atualização leve durante o envio (sem redesenhar a lista inteira)
        const indice = fila.indexOf(item);
        const linha = $("#fila-envio", elemento)?.children[indice];
        if (!linha) return;
        const barra = $(".progresso__barra", linha);
        if (barra) barra.style.setProperty("--largura", `${item.progresso}%`);
        $(".item-fila__estado", linha).textContent = textoEstado(item);
    }

    ligarAreaDeSoltar(elemento, "arquivos-lote", async (arquivos) => {
        const recusados = [];
        for (const arquivo of arquivos) {
            const tipo = tipoPorExtensao(extensao(arquivo.name));
            if (!tipo) {
                recusados.push(arquivo.name);
                continue;
            }
            if (fila.some((item) => item.arquivo.name === arquivo.name && item.arquivo.size === arquivo.size)) continue;
            fila.push({ arquivo, tipo, titulo: tituloDoArquivo(arquivo.name), duracao: 0, estado: "aguardando", progresso: 0 });
        }
        if (fila.length > 50) {
            fila.splice(50);
            toast("Máximo de 50 arquivos por vez.", "alerta");
        }
        if (recusados.length) toast(`Formato não suportado: ${recusados.slice(0, 3).join(", ")}${recusados.length > 3 ? "..." : ""}`, "alerta", 6000);
        fila.sort((a, b) => compararNatural(a.arquivo.name, b.arquivo.name));
        desenharFila();
        // Lê a duração dos vídeos/áudios localmente (o servidor recebe junto com o arquivo)
        for (const item of fila.filter((i) => !i.duracao && i.tipo !== "arquivo")) {
            item.duracao = await lerDuracaoLocal(item.arquivo);
        }
        if (!enviando) desenharFila();
    });

    $("#fila-envio", elemento).addEventListener("click", (evento) => {
        const remover = evento.target.closest("[data-remover]");
        if (remover) {
            fila.splice(Number(remover.dataset.remover), 1);
            desenharFila();
        }
        const tentar = evento.target.closest("[data-tentar]");
        if (tentar) {
            const item = fila[Number(tentar.dataset.tentar)];
            item.estado = "aguardando";
            item.erro = "";
            desenharFila();
        }
    });

    $("#iniciar-lote", elemento).addEventListener("click", async () => {
        enviando = true;
        desenharFila();
        const publicar = $("#lote-publicar", elemento).checked;
        // Envio sequencial: mantém a ordem das aulas e mostra o progresso de cada arquivo
        for (const item of fila.filter((i) => i.estado === "aguardando")) {
            item.estado = "enviando";
            item.progresso = 0;
            desenharFila();
            const formulario = new FormData();
            formulario.append("publicado", String(publicar));
            formulario.append("duracoes", JSON.stringify(item.duracao ? { [item.arquivo.name]: item.duracao } : {}));
            formulario.append("arquivos", item.arquivo);
            controladorAtual = new AbortController();
            try {
                await enviarComProgresso(`/admin/modulos/${modulo.id}/aulas/lote`, formulario, {
                    sinal: controladorAtual.signal,
                    aoProgredir: (percentual) => {
                        item.progresso = percentual;
                        if (percentual === 100) item.estado = "processando";
                        atualizarItem(item);
                    }
                });
                item.estado = "concluido";
                houveEnvio = true;
            } catch (erro) {
                if (erro.codigo === "CANCELADO") return;
                item.estado = "erro";
                item.erro = erro.message;
            }
            desenharFila();
        }
        enviando = false;
        desenharFila();
        const erros = fila.filter((item) => item.estado === "erro").length;
        const ok = fila.filter((item) => item.estado === "concluido").length;
        toast(erros ? `${ok} aula(s) criada(s), ${erros} com erro.` : `${ok} aula(s) criada(s) com sucesso!`, erros ? "alerta" : "sucesso");
        if (!erros) {
            setTimeout(() => fechar(), 900);
        }
    });

    desenharFila();
    return { fechar };
}

// Exclusão com confirmação (reutilizado pelo editor)
export async function excluirAula(aula, aoExcluir) {
    const ok = await confirmar({
        titulo: `Excluir a aula "${aula.titulo}"?`,
        mensagem: "O arquivo enviado, os materiais e o progresso dos alunos nesta aula também serão apagados.",
        textoConfirmar: "Excluir aula", perigo: true
    });
    if (!ok) return;
    try {
        toast((await api.delete(`/admin/aulas/${aula.id}`)).mensagem);
        aoExcluir?.();
    } catch (erro) {
        toastErro(erro);
    }
}

