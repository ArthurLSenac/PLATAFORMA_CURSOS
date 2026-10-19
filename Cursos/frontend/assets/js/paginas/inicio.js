// Página inicial: hero configurável, números da plataforma e catálogo de cursos (READ).
import { api } from "../api.js";
import { html, renderizar, $, debounce, numero, toastErro } from "../ui.js";
import { icone } from "../icones.js";
import { montarLayout, definirTitulo } from "../layout.js";
import { cartaoCurso, esqueletoCartoes, estadoVazio } from "../componentes.js";

const filtros = { busca: "", categoria: "", nivel: "", ordem: "destaque" };
let requisicaoAtual = null;

function heroTitulo(texto) {
    // Destaca as duas últimas palavras do título com gradiente
    const palavras = texto.trim().split(/\s+/);
    if (palavras.length < 4) return html`<span class="texto-gradiente">${texto}</span>`;
    const destaque = palavras.splice(-2).join(" ");
    return html`${palavras.join(" ")} <span class="texto-gradiente">${destaque}</span>`;
}

function montarHero(cfg, usuario) {
    if (cfg.hero_titulo) renderizar($("#hero-titulo"), heroTitulo(cfg.hero_titulo));
    $("#hero-subtitulo").textContent = cfg.hero_subtitulo || cfg.slogan || "";

    const acoes = usuario
        ? html`
            <a class="btn btn--primario btn--lg" href="${usuario.papel === "admin" ? "admin.html" : "painel.html"}">${icone("painel", 18)} Ir para o ${usuario.papel === "admin" ? "painel admin" : "meu painel"}</a>
            <a class="btn btn--lg" href="#cursos">Explorar cursos</a>`
        : html`
            ${cfg.registros_abertos ? html`<a class="btn btn--primario btn--lg" href="cadastro.html">${icone("foguete", 18)} Começar agora</a>` : ""}
            <a class="btn btn--lg" href="#cursos">${icone("busca", 18)} Explorar cursos</a>`;
    renderizar($("#hero-acoes"), acoes);
    renderizar($("#chamada-acoes"), usuario
        ? html`<a class="btn btn--primario btn--lg" href="#cursos">Ver catálogo ${icone("avancar", 18)}</a>`
        : html`
            ${cfg.registros_abertos ? html`<a class="btn btn--primario btn--lg" href="cadastro.html">Criar minha conta ${icone("avancar", 18)}</a>` : ""}
            <a class="btn btn--lg" href="login.html">Já tenho conta</a>`);

    renderizar($("#estrelas"), html`${Array.from({ length: 5 }, () => icone("estrela", 14))}`);
    renderizar($("#icone-play"), icone("play", 24));
    renderizar($("#icone-progresso"), icone("subindo", 20));
    renderizar($("#icone-certificado"), icone("medalha", 20));
    $("#icone-busca").outerHTML = String(icone("busca", 18));
}

async function carregarNumeros() {
    try {
        const n = await api.get("/publico/estatisticas");
        const horas = Math.max(1, Math.round(n.duracao_segundos / 3600));
        renderizar($("#numeros"), html`
            <div class="numeros__item"><strong>${numero(n.cursos)}</strong><span>Cursos publicados</span></div>
            <div class="numeros__item"><strong>${numero(n.aulas)}</strong><span>Aulas disponíveis</span></div>
            <div class="numeros__item"><strong>${numero(horas)}h+</strong><span>Horas de conteúdo</span></div>
            <div class="numeros__item"><strong>${numero(n.alunos)}</strong><span>Alunos ativos</span></div>`);
        $("#prova-texto").textContent = n.alunos > 0
            ? `${numero(n.alunos)} aluno${n.alunos > 1 ? "s" : ""} aprendendo agora`
            : "Seja um dos primeiros alunos";
    } catch {
        // números são opcionais: a página continua funcionando
    }
}

async function carregarCategorias() {
    try {
        const categorias = (await api.get("/publico/categorias")).filter((c) => c.total_cursos > 0);
        const container = $("#categorias");
        renderizar(container, html`
            <button class="ficha ficha--todas" aria-pressed="true" data-categoria="">Todas</button>
            ${categorias.map((c) => html`
                <button class="ficha" aria-pressed="false" data-categoria="${c.id}" data-cor="${c.cor}">${c.nome} <small>${c.total_cursos}</small></button>`)}`);
        container.addEventListener("click", (evento) => {
            const ficha = evento.target.closest("[data-categoria]");
            if (!ficha) return;
            container.querySelectorAll(".ficha").forEach((f) => f.setAttribute("aria-pressed", String(f === ficha)));
            filtros.categoria = ficha.dataset.categoria;
            carregarCursos();
        });
    } catch {
        // sem categorias, o catálogo continua funcionando
    }
}

async function carregarCursos() {
    const lista = $("#lista-cursos");
    renderizar(lista, esqueletoCartoes(3));

    requisicaoAtual?.abort();
    requisicaoAtual = new AbortController();
    const consulta = new URLSearchParams(Object.entries(filtros).filter(([, valor]) => valor));

    try {
        // fetch → GET /api/publico/cursos → controller → SELECT na view vw_cursos_resumo
        const cursos = await api.get(`/publico/cursos?${consulta}`, { sinal: requisicaoAtual.signal });
        if (cursos.length === 0) {
            renderizar(lista, estadoVazio({
                icone: "busca",
                titulo: "Nenhum curso encontrado",
                texto: "Tente outro termo de busca ou remova os filtros aplicados."
            }));
            lista.firstElementChild.style.gridColumn = "1 / -1";
            return;
        }
        renderizar(lista, html`${cursos.map(cartaoCurso)}`);
    } catch (erro) {
        if (erro.name === "AbortError") return;
        renderizar(lista, estadoVazio({ icone: "aviso", titulo: "Não foi possível carregar os cursos", texto: erro.message }));
        lista.firstElementChild.style.gridColumn = "1 / -1";
        toastErro(erro);
    }
}

function montarSecoesEstaticas() {
    renderizar($("#passos"), html`
        <div class="passo">
            <div class="passo__icone">${icone("usuario-mais", 22)}</div>
            <h3>Crie sua conta</h3>
            <p>Cadastre-se em poucos segundos com nome, e-mail e uma senha segura.</p>
        </div>
        <div class="passo">
            <div class="passo__icone">${icone("escudo", 22)}</div>
            <h3>Aguarde a aprovação</h3>
            <p>Nossa equipe analisa cada cadastro. Assim que aprovado, seu acesso é liberado automaticamente.</p>
        </div>
        <div class="passo">
            <div class="passo__icone">${icone("medalha", 22)}</div>
            <h3>Estude e certifique-se</h3>
            <p>Assista às aulas no seu ritmo, acompanhe o progresso e emita o certificado ao concluir.</p>
        </div>`);

    const recursos = [
        ["video", "Aulas em vídeo e áudio", "Player com retomada automática do ponto onde você parou."],
        ["camadas", "Módulos organizados", "Conteúdo dividido em módulos e aulas em uma sequência lógica."],
        ["clipe", "Materiais de apoio", "PDFs, planilhas e arquivos complementares para baixar em cada aula."],
        ["caneta", "Anotações pessoais", "Faça anotações em cada aula e encontre tudo depois no seu painel."],
        ["subindo", "Progresso em tempo real", "Veja quanto falta para concluir cada curso, aula por aula."],
        ["certificado", "Certificado verificável", "Certificado com código único que qualquer pessoa pode validar."]
    ];
    renderizar($("#recursos"), html`${recursos.map(([nome, titulo, texto]) => html`
        <div class="recurso">
            <div class="recurso__icone">${icone(nome, 22)}</div>
            <h3>${titulo}</h3>
            <p>${texto}</p>
        </div>`)}`);
}

async function iniciar() {
    const { cfg, usuario } = await montarLayout({ ativo: "inicio" });
    definirTitulo(cfg.slogan ? `${cfg.slogan}` : "Cursos online");
    montarHero(cfg, usuario);
    montarSecoesEstaticas();

    $("#busca").addEventListener("input", debounce((evento) => {
        filtros.busca = evento.target.value.trim();
        carregarCursos();
    }, 300));
    $("#filtro-nivel").addEventListener("change", (evento) => {
        filtros.nivel = evento.target.value;
        carregarCursos();
    });
    $("#filtro-ordem").addEventListener("change", (evento) => {
        filtros.ordem = evento.target.value;
        carregarCursos();
    });

    await Promise.all([carregarNumeros(), carregarCategorias(), carregarCursos()]);
}

iniciar();
