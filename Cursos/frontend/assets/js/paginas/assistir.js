// Player de aulas: carrega o conteúdo do curso, exibe a aula (vídeo, áudio, YouTube/Vimeo,
// texto ou arquivo), salva a posição do vídeo, marca conclusão, guarda anotações e
// emite o certificado quando o aluno chega a 100%.
import { api, urlArquivo, requisicao } from "../api.js";
import {
    html, renderizar, $, $$, toast, toastErro, abrirModal, comCarregamento, duracao, relogio, bytes,
    plural, parametro, debounce, tempoRelativo
} from "../ui.js";
import { icone, ICONE_POR_TIPO, NOME_POR_TIPO } from "../icones.js";
import { carregarConfiguracoes, exigirSessao, definirTitulo, botaoTema, avatar, iniciarMenus } from "../layout.js";
import { markdownParaHtml, prepararBlocosDeCodigo } from "../markdown.js";
import { estadoVazio } from "../componentes.js";

const CIRCUNFERENCIA = 2 * Math.PI * 26;

const estado = {
    usuario: null,
    curso: null,
    aulas: [],
    aula: null,
    ultimaPosicaoSalva: 0,
    temporizadorPosicao: null,
    cancelarProxima: null
};

const ehPrevia = () => estado.curso?.modo_previa;

// ---------------------------------------------------------------------------
// Cabeçalho e lateral
// ---------------------------------------------------------------------------
function renderizarTopo() {
    const voltar = estado.usuario.papel === "admin" ? `admin.html#/cursos/${estado.curso.id}` : "painel.html";
    renderizar($("#player-topo"), html`
        <a class="btn btn--fantasma btn--icone" href="${voltar}" aria-label="Voltar" title="Voltar">${icone("voltar", 19)}</a>
        <span class="divisor-vertical"></span>
        <div class="player-topo__titulo">
            <strong>${estado.curso.titulo}</strong>
            <span id="topo-modulo"></span>
        </div>
        <div class="player-topo__progresso">
            <div class="linha-entre"><span>Seu progresso</span><strong id="topo-percentual">0%</strong></div>
            <div class="progresso"><div class="progresso__barra" id="topo-barra"></div></div>
        </div>
        ${botaoTema()}
        <div class="menu-suspenso">
            <button class="usuario-botao" data-abrir-menu aria-haspopup="true">${avatar(estado.usuario, "avatar--sm")}</button>
            <div class="menu-suspenso__lista" hidden>
                <div class="menu-suspenso__cabecalho"><strong>${estado.usuario.nome}</strong><span>${estado.usuario.email}</span></div>
                <div class="menu-suspenso__divisor"></div>
                <a class="menu-suspenso__item" href="${estado.usuario.papel === "admin" ? "admin.html" : "painel.html"}">${icone("painel", 16)} Meu painel</a>
                <a class="menu-suspenso__item" href="curso.html?id=${estado.curso.id}">${icone("livro", 16)} Página do curso</a>
                <div class="menu-suspenso__divisor"></div>
                <button class="menu-suspenso__item menu-suspenso__item--perigo" data-sair>${icone("sair", 16)} Sair</button>
            </div>
        </div>`);
    iniciarMenus($("#player-topo"));

    if (ehPrevia()) {
        renderizar($("#banner"), html`<div class="banner-previa">${icone("olho", 16)} Modo pré-visualização do administrador — aulas em rascunho também aparecem e o progresso não gera certificado.</div>`);
    }
}

function renderizarLateral() {
    const { curso } = estado;
    renderizar($("#lateral"), html`
        <div class="lateral-resumo">
            <div class="lateral-resumo__topo">
                <div class="anel-progresso">
                    <svg width="62" height="62" viewBox="0 0 62 62" aria-hidden="true">
                        <circle class="trilho" cx="31" cy="31" r="26"></circle>
                        <circle class="valor" id="anel" cx="31" cy="31" r="26" stroke-dasharray="${CIRCUNFERENCIA}" stroke-dashoffset="${CIRCUNFERENCIA}"></circle>
                    </svg>
                    <span id="anel-texto">0%</span>
                </div>
                <div>
                    <h2>Conteúdo do curso</h2>
                    <p id="resumo-texto"></p>
                </div>
            </div>
            <div id="area-certificado"></div>
        </div>
        <nav class="lateral-modulos">
            ${curso.modulos.map((modulo, indice) => html`
                <details class="lateral-modulo" data-modulo="${modulo.id}">
                    <summary>
                        <div>
                            <strong>${indice + 1}. ${modulo.titulo}</strong>
                            <span data-contagem-modulo="${modulo.id}"></span>
                        </div>
                        ${icone("seta-baixo", 16)}
                    </summary>
                    <ul class="lateral-aulas">
                        ${modulo.aulas.map((aula) => html`
                            <li>
                                <button class="lateral-aula ${aula.concluida ? "concluida" : ""}" data-aula="${aula.id}">
                                    <span class="lateral-aula__estado">${icone("check", 12)}</span>
                                    <div>
                                        ${aula.titulo}
                                        <small>${icone(ICONE_POR_TIPO[aula.tipo], 13)} ${NOME_POR_TIPO[aula.tipo]} · ${duracao(aula.duracao_segundos)}
                                            ${!aula.publicado ? html`<span class="selo selo--rascunho">Rascunho</span>` : ""}</small>
                                    </div>
                                </button>
                            </li>`)}
                    </ul>
                </details>`)}
        </nav>`);

    $("#lateral").addEventListener("click", (evento) => {
        const botao = evento.target.closest("[data-aula]");
        if (botao) abrirAula(Number(botao.dataset.aula));
    });
    atualizarProgresso(curso.progresso);
}

function atualizarProgresso(progresso) {
    estado.curso.progresso = progresso;
    const percentual = progresso.percentual;
    $("#anel").setAttribute("stroke-dashoffset", String(CIRCUNFERENCIA * (1 - percentual / 100)));
    $("#anel-texto").textContent = `${percentual}%`;
    $("#topo-percentual").textContent = `${percentual}%`;
    $("#topo-barra").style.setProperty("--largura", `${percentual}%`);
    $("#resumo-texto").textContent = `${progresso.concluidas} de ${plural(progresso.total, "aula")} concluídas`;

    for (const modulo of estado.curso.modulos) {
        const feitas = modulo.aulas.filter((aula) => aula.concluida).length;
        const total = modulo.aulas.reduce((soma, aula) => soma + aula.duracao_segundos, 0);
        const alvo = $(`[data-contagem-modulo="${modulo.id}"]`);
        if (alvo) alvo.textContent = `${feitas}/${modulo.aulas.length} aulas · ${duracao(total)}`;
    }

    const area = $("#area-certificado");
    if (ehPrevia()) {
        area.innerHTML = "";
    } else if (estado.curso.certificado_codigo) {
        renderizar(area, html`<a class="btn btn--bloco" href="certificado.html?codigo=${estado.curso.certificado_codigo}">${icone("medalha", 16)} Ver meu certificado</a>`);
    } else if (progresso.total > 0 && progresso.concluidas >= progresso.total) {
        renderizar(area, html`<button class="btn btn--primario btn--bloco" data-emitir>${icone("medalha", 16)} Emitir certificado</button>`);
        $("[data-emitir]", area).addEventListener("click", (evento) => emitirCertificado(evento.currentTarget));
    } else {
        area.innerHTML = "";
    }
}

function marcarAulaNaLateral(aulaId) {
    $$(".lateral-aula").forEach((botao) => botao.removeAttribute("aria-current"));
    const botao = $(`.lateral-aula[data-aula="${aulaId}"]`);
    if (!botao) return;
    botao.setAttribute("aria-current", "true");
    const modulo = botao.closest("details");
    if (modulo) modulo.open = true;
    botao.scrollIntoView({ block: "nearest" });
}

// ---------------------------------------------------------------------------
// Conteúdo da aula
// ---------------------------------------------------------------------------
function midiaDaAula(aula) {
    const url = urlArquivo(aula.url_arquivo);
    switch (aula.tipo) {
        case "video":
            return html`
                <div class="player-midia">
                    <video id="video" controls playsinline preload="metadata" controlslist="nodownload" src="${url}"></video>
                </div>`;
        case "audio":
            return html`
                <div class="cartao-audio" id="cartao-audio">
                    <span class="cartao-audio__disco">${icone("audio", 40)}</span>
                    <strong>${aula.titulo}</strong>
                    <audio id="video" controls preload="metadata" controlslist="nodownload" src="${url}"></audio>
                </div>`;
        case "externo":
            if (!aula.video_externo) return estadoVazio({ icone: "youtube", titulo: "Vídeo indisponível", texto: "O link deste vídeo é inválido." });
            return html`
                <div class="player-midia">
                    <iframe src="${aula.video_externo.embed}" title="${aula.titulo}" loading="lazy"
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                        referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe>
                </div>`;
        case "texto": {
            const palavras = (aula.conteudo || "").split(/\s+/).length;
            return html`
                <article class="leitura">
                    <div class="leitura__meta">${icone("texto", 15)} Leitura · cerca de ${Math.max(1, Math.round(palavras / 200))} min</div>
                    <div class="markdown" id="conteudo-texto"></div>
                </article>`;
        }
        case "arquivo":
            if (aula.extensao === ".pdf") {
                return html`
                    <div class="barra-arquivo">
                        <a class="btn btn--sm" href="${url}" target="_blank" rel="noopener">${icone("externo", 15)} Abrir em nova aba</a>
                        <a class="btn btn--sm" href="${url}?download=1">${icone("baixar", 15)} Baixar PDF</a>
                    </div>
                    <iframe class="player-pdf" src="${url}" title="${aula.arquivo_nome}"></iframe>`;
            }
            return html`
                <div class="cartao-arquivo">
                    <span class="cartao-arquivo__icone">${icone("arquivo", 28)}</span>
                    <div>
                        <strong>${aula.arquivo_nome}</strong>
                        <span>${(aula.extensao || "").replace(".", "").toUpperCase()} · ${bytes(aula.arquivo_tamanho)}</span>
                    </div>
                    <a class="btn btn--primario" href="${url}?download=1">${icone("baixar", 16)} Baixar arquivo</a>
                </div>`;
        default:
            return "";
    }
}

function botaoConclusao(concluida) {
    return concluida
        ? html`${icone("check-circulo", 17)} Concluída`
        : html`${icone("circulo", 17)} Marcar como concluída`;
}

function renderizarAula(aula) {
    const { curso } = estado;
    $("#topo-modulo").textContent = `${aula.modulo.titulo} · Aula ${aula.posicao} de ${aula.total_aulas}`;
    definirTitulo(`${aula.titulo} — ${curso.titulo}`);

    renderizar($("#principal"), html`
        <div id="midia">${midiaDaAula(aula)}</div>
        <div class="aula-cabecalho">
            <div>
                <h1>${aula.titulo}</h1>
                <div class="aula-cabecalho__meta">
                    <span>${icone("camadas", 14)} ${aula.modulo.titulo}</span>
                    <span>${icone(ICONE_POR_TIPO[aula.tipo], 14)} ${NOME_POR_TIPO[aula.tipo]}</span>
                    ${aula.duracao_segundos ? html`<span>${icone("relogio", 14)} ${duracao(aula.duracao_segundos)}</span>` : ""}
                    ${!aula.publicado ? html`<span class="selo selo--rascunho">Rascunho</span>` : ""}
                </div>
            </div>
            <div class="aula-acoes">
                <button class="btn" data-ir="${aula.anterior?.id || ""}" ${aula.anterior ? "" : "disabled"} title="${aula.anterior ? `Anterior: ${aula.anterior.titulo}` : ""}">${icone("seta-esquerda", 17)} Anterior</button>
                <button class="btn ${aula.progresso.concluida ? "btn--concluida" : ""}" id="btn-concluir">${botaoConclusao(aula.progresso.concluida)}</button>
                <button class="btn btn--primario" data-ir="${aula.proxima?.id || ""}" ${aula.proxima ? "" : "disabled"} title="${aula.proxima ? `Próxima: ${aula.proxima.titulo}` : ""}">Próxima ${icone("seta-direita", 17)}</button>
            </div>
        </div>

        <div class="abas aula-abas" role="tablist">
            <button class="aba" role="tab" data-aba-aula="visao" aria-selected="true">${icone("info", 15)} Visão geral</button>
            <button class="aba" role="tab" data-aba-aula="materiais" aria-selected="false">${icone("clipe", 15)} Materiais <span class="aba__contador">${aula.materiais.length}</span></button>
            <button class="aba" role="tab" data-aba-aula="anotacoes" aria-selected="false">${icone("caneta", 15)} Anotações</button>
        </div>

        <div class="aula-painel" data-painel="visao">
            ${aula.descricao ? html`<div class="markdown" id="descricao-aula"></div>` : html`<p class="mudo">Esta aula não possui descrição adicional.</p>`}
        </div>
        <div class="aula-painel" data-painel="materiais" hidden>
            ${aula.materiais.length
                ? aula.materiais.map((material) => html`
                    <div class="material-item">
                        <span class="material-item__icone">${icone("arquivo", 18)}</span>
                        <div><strong>${material.nome}</strong><span>${bytes(material.tamanho)}</span></div>
                        ${/\.pdf$/i.test(material.nome) ? html`<a class="btn btn--sm btn--fantasma" href="${urlArquivo(`/api/aluno/materiais/${material.id}`)}?visualizar=1" target="_blank" rel="noopener">${icone("olho", 15)} Ver</a>` : ""}
                        <a class="btn btn--sm" href="${urlArquivo(`/api/aluno/materiais/${material.id}`)}">${icone("baixar", 15)} Baixar</a>
                    </div>`)
                : html`<p class="mudo">Nenhum material de apoio para esta aula.</p>`}
        </div>
        <div class="aula-painel" data-painel="anotacoes" hidden>
            <label class="sr-only" for="anotacao">Suas anotações</label>
            <textarea class="area-texto anotacoes__area" id="anotacao" maxlength="20000" placeholder="Escreva aqui suas anotações sobre esta aula. Elas são salvas automaticamente e ficam visíveis só para você.">${aula.anotacao?.texto || ""}</textarea>
            <div class="anotacoes__estado" id="estado-anotacao">${aula.anotacao ? `Salvo ${tempoRelativo(aula.anotacao.atualizado_em)}` : "As anotações são salvas automaticamente."}</div>
        </div>

        <div class="atalhos" aria-hidden="true">
            <span><kbd>N</kbd> próxima aula</span>
            <span><kbd>P</kbd> aula anterior</span>
            <span><kbd>M</kbd> marcar como concluída</span>
            ${aula.tipo === "video" ? html`<span><kbd>K</kbd> play/pause</span>` : ""}
        </div>`);

    if (aula.tipo === "texto") {
        $("#conteudo-texto").innerHTML = markdownParaHtml(aula.conteudo);
        prepararBlocosDeCodigo($("#conteudo-texto"));
    }
    if (aula.descricao) $("#descricao-aula").innerHTML = markdownParaHtml(aula.descricao);

    $$("[data-ir]").forEach((botao) => botao.addEventListener("click", () => {
        if (botao.dataset.ir) abrirAula(Number(botao.dataset.ir));
    }));
    $("#btn-concluir").addEventListener("click", () => alternarConclusao());
    $$("[data-aba-aula]").forEach((aba) => aba.addEventListener("click", () => {
        $$("[data-aba-aula]").forEach((outra) => outra.setAttribute("aria-selected", String(outra === aba)));
        $$("[data-painel]").forEach((painel) => (painel.hidden = painel.dataset.painel !== aba.dataset.abaAula));
    }));

    const salvarAnotacao = debounce(async () => {
        const status = $("#estado-anotacao");
        if (!status) return;
        try {
            await api.put(`/aluno/aulas/${aula.id}/anotacao`, { texto: $("#anotacao").value });
            status.textContent = `Salvo às ${new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`;
        } catch (erro) {
            status.textContent = `Não foi possível salvar: ${erro.message}`;
        }
    }, 800);
    $("#anotacao").addEventListener("input", () => {
        $("#estado-anotacao").textContent = "Salvando...";
        salvarAnotacao();
    });

    prepararMidia(aula);
}

// ---------------------------------------------------------------------------
// Vídeo/áudio: retomar de onde parou, salvar posição e concluir ao terminar
// ---------------------------------------------------------------------------
function prepararMidia(aula) {
    const midia = $("#video");
    if (!midia) return;
    estado.ultimaPosicaoSalva = aula.progresso.posicao_segundos;

    midia.addEventListener("loadedmetadata", () => {
        const posicao = aula.progresso.posicao_segundos;
        if (posicao > 5 && posicao < midia.duration - 5) {
            midia.currentTime = posicao;
            toast(`Retomando de onde você parou (${relogio(posicao)}).`, "info", 3000);
        }
    });
    midia.addEventListener("play", () => $("#cartao-audio")?.classList.add("tocando"));
    midia.addEventListener("pause", () => {
        $("#cartao-audio")?.classList.remove("tocando");
        salvarPosicao();
    });
    midia.addEventListener("ended", aoTerminarMidia);
    midia.addEventListener("error", () => {
        if (midia.error) toast("Não foi possível carregar a mídia desta aula.", "erro");
    });

    clearInterval(estado.temporizadorPosicao);
    estado.temporizadorPosicao = setInterval(() => {
        if (!midia.paused) salvarPosicao();
    }, 10000);
}

function salvarPosicao({ final = false } = {}) {
    const midia = $("#video");
    if (!midia || !estado.aula || !Number.isFinite(midia.currentTime)) return;
    const posicao = Math.floor(midia.currentTime);
    if (Math.abs(posicao - estado.ultimaPosicaoSalva) < 3) return;
    estado.ultimaPosicaoSalva = posicao;
    estado.aula.progresso.posicao_segundos = posicao;
    // keepalive permite terminar o envio mesmo se a página estiver sendo fechada
    requisicao(`/aluno/aulas/${estado.aula.id}/posicao`, { metodo: "PUT", corpo: { posicao_segundos: posicao }, manterViva: final }).catch(() => {});
}

async function aoTerminarMidia() {
    const aula = estado.aula;
    if (!aula.progresso.concluida) await alternarConclusao(true);
    if (!aula.proxima || estado.aula !== aula) return;

    const midia = $("#midia .player-midia, #midia .cartao-audio");
    const sobreposicao = document.createElement("div");
    sobreposicao.className = "player-midia__sobreposicao";
    sobreposicao.innerHTML = String(html`
        <div>
            <div class="contagem">
                <svg width="64" height="64" viewBox="0 0 64 64"><circle class="trilho" cx="32" cy="32" r="28"></circle><circle class="anel" cx="32" cy="32" r="28"></circle></svg>
                <span id="contagem-numero">5</span>
            </div>
            <h3>Próxima aula</h3>
            <p>${aula.proxima.titulo}</p>
            <div class="linha" style-livre>
                <button class="btn" data-cancelar>Cancelar</button>
                <button class="btn btn--primario" data-agora>${icone("play", 15)} Assistir agora</button>
            </div>
        </div>`);
    midia.appendChild(sobreposicao);
    sobreposicao.querySelector("[style-livre]").style.justifyContent = "center";

    let restante = 5;
    const intervalo = setInterval(() => {
        restante -= 1;
        const numero = sobreposicao.querySelector("#contagem-numero");
        if (numero) numero.textContent = String(restante);
        if (restante <= 0) {
            clearInterval(intervalo);
            abrirAula(aula.proxima.id);
        }
    }, 1000);
    estado.cancelarProxima = () => {
        clearInterval(intervalo);
        sobreposicao.remove();
    };
    sobreposicao.querySelector("[data-cancelar]").addEventListener("click", () => estado.cancelarProxima());
    sobreposicao.querySelector("[data-agora]").addEventListener("click", () => {
        clearInterval(intervalo);
        abrirAula(aula.proxima.id);
    });
}

// ---------------------------------------------------------------------------
// Conclusão, certificado e navegação
// ---------------------------------------------------------------------------
async function alternarConclusao(forcar) {
    const aula = estado.aula;
    const concluida = forcar ?? !aula.progresso.concluida;
    const botao = $("#btn-concluir");
    try {
        const resposta = await api.put(`/aluno/aulas/${aula.id}/conclusao`, { concluida });
        aula.progresso.concluida = concluida;
        estado.aulas.find((item) => item.id === aula.id).concluida = concluida;
        $(`.lateral-aula[data-aula="${aula.id}"]`)?.classList.toggle("concluida", concluida);
        if (botao && estado.aula === aula) {
            botao.classList.toggle("btn--concluida", concluida);
            renderizar(botao, botaoConclusao(concluida));
        }
        const jaEstavaCompleto = estado.curso.progresso.percentual >= 100;
        atualizarProgresso(resposta.progresso);
        if (resposta.curso_concluido && !jaEstavaCompleto && !ehPrevia()) celebrar();
        else if (forcar === undefined) toast(resposta.mensagem, concluida ? "sucesso" : "info", 2500);
    } catch (erro) {
        toastErro(erro);
    }
}

async function emitirCertificado(botao) {
    await comCarregamento(botao, async () => {
        try {
            const resposta = await api.post(`/aluno/cursos/${estado.curso.id}/certificado`);
            estado.curso.certificado_codigo = resposta.codigo;
            location.href = `certificado.html?codigo=${resposta.codigo}`;
        } catch (erro) {
            toastErro(erro);
        }
    });
}

function soltarConfete() {
    const camada = document.createElement("div");
    camada.className = "confete";
    const cores = ["#7c5cff", "#22d3ee", "#22c55e", "#f59e0b", "#f43f5e", "#ffffff"];
    for (let i = 0; i < 120; i++) {
        const peca = document.createElement("i");
        peca.style.setProperty("--x", `${Math.random() * 100}%`);
        peca.style.setProperty("--cor", cores[i % cores.length]);
        peca.style.setProperty("--tempo", `${2.2 + Math.random() * 2.4}s`);
        peca.style.setProperty("--giro", `${Math.random() * 360}deg`);
        peca.style.animationDelay = `${Math.random() * 0.8}s`;
        camada.appendChild(peca);
    }
    document.body.appendChild(camada);
    setTimeout(() => camada.remove(), 6000);
}

function celebrar() {
    soltarConfete();
    const { elemento, fechar } = abrirModal({
        titulo: "Curso concluído!",
        tamanho: "sm",
        conteudo: html`
            <div class="celebracao">
                <div class="celebracao__icone">${icone("medalha", 44)}</div>
                <h3>Parabéns, ${estado.usuario.nome.split(" ")[0]}! 🎉</h3>
                <p>Você concluiu todas as aulas de <strong>${estado.curso.titulo}</strong>. Seu certificado já pode ser emitido.</p>
            </div>`,
        rodape: html`
            <button class="btn btn--fantasma" data-fechar>Depois</button>
            <button class="btn btn--primario" data-emitir-modal>${icone("medalha", 16)} Emitir certificado</button>`
    });
    elemento.querySelector("[data-emitir-modal]").addEventListener("click", async (evento) => {
        await emitirCertificado(evento.currentTarget);
        fechar();
    });
}

async function abrirAula(aulaId, { historico = true } = {}) {
    if (estado.aula?.id === aulaId) return;
    salvarPosicao({ final: true });
    estado.cancelarProxima?.();
    clearInterval(estado.temporizadorPosicao);

    marcarAulaNaLateral(aulaId);
    if (historico) history.pushState({ aula: aulaId }, "", `assistir.html?curso=${estado.curso.id}&aula=${aulaId}`);
    try {
        const aula = await api.get(`/aluno/aulas/${aulaId}`);
        estado.aula = aula;
        renderizarAula(aula);
        window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (erro) {
        renderizar($("#principal"), estadoVazio({ icone: "aviso", titulo: "Não foi possível abrir a aula", texto: erro.message }));
    }
}

function escolherAulaInicial() {
    const pedida = Number(parametro("aula"));
    if (estado.aulas.some((aula) => aula.id === pedida)) return pedida;
    if (estado.aulas.some((aula) => aula.id === estado.curso.ultima_aula_id)) return estado.curso.ultima_aula_id;
    return (estado.aulas.find((aula) => !aula.concluida) || estado.aulas[0])?.id;
}

function atalhosDeTeclado() {
    document.addEventListener("keydown", (evento) => {
        if (evento.ctrlKey || evento.metaKey || evento.altKey) return;
        if (evento.target.closest("input, textarea, select, [contenteditable]")) return;
        if (document.querySelector(".modal-fundo")) return;
        const tecla = evento.key.toLowerCase();
        if (tecla === "n" && estado.aula?.proxima) abrirAula(estado.aula.proxima.id);
        if (tecla === "p" && estado.aula?.anterior) abrirAula(estado.aula.anterior.id);
        if (tecla === "m" && estado.aula) alternarConclusao();
        if (tecla === "k") {
            const midia = $("#video");
            if (midia) {
                evento.preventDefault();
                midia.paused ? midia.play() : midia.pause();
            }
        }
    });
}

async function iniciar() {
    estado.usuario = await exigirSessao();
    await carregarConfiguracoes();
    const cursoId = Number(parametro("curso"));

    try {
        estado.curso = await api.get(`/aluno/cursos/${cursoId}/conteudo`);
    } catch (erro) {
        renderizar($("#principal"), estadoVazio({
            icone: "aviso", titulo: "Curso indisponível", texto: erro.message,
            acao: html`<a class="btn btn--primario" href="painel.html">Voltar ao painel</a>`
        }));
        $("#lateral").hidden = true;
        return;
    }
    estado.aulas = estado.curso.modulos.flatMap((modulo) => modulo.aulas);

    renderizarTopo();
    renderizarLateral();
    atalhosDeTeclado();

    const inicial = escolherAulaInicial();
    if (!inicial) {
        renderizar($("#principal"), estadoVazio({ icone: "camadas", titulo: "Este curso ainda não tem aulas", texto: "Volte em breve — o conteúdo está sendo preparado." }));
        return;
    }
    history.replaceState({ aula: inicial }, "", `assistir.html?curso=${cursoId}&aula=${inicial}`);
    await abrirAula(inicial, { historico: false });

    window.addEventListener("popstate", (evento) => {
        if (evento.state?.aula) abrirAula(evento.state.aula, { historico: false });
    });
    window.addEventListener("pagehide", () => salvarPosicao({ final: true }));
}

iniciar();
