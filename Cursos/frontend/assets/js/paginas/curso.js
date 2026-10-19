// Página de detalhes de um curso: descrição e grade curricular (módulos e aulas).
import { api } from "../api.js";
import { html, renderizar, $, duracao, plural, parametro, toastErro, comCarregamento } from "../ui.js";
import { icone, ICONE_POR_TIPO } from "../icones.js";
import { montarLayout, definirTitulo } from "../layout.js";
import { capaCurso, seloNivel, estadoVazio } from "../componentes.js";
import { markdownParaHtml } from "../markdown.js";

function botoesDeAcao(curso, usuario, matricula) {
    if (!usuario) {
        return html`
            <a class="btn btn--primario btn--lg btn--bloco" href="login.html?voltar=${encodeURIComponent(`curso.html?id=${curso.id}`)}">${icone("entrar", 18)} Entrar para assistir</a>
            <a class="btn btn--lg btn--bloco" href="cadastro.html">Criar conta gratuita</a>`;
    }
    if (usuario.papel === "admin") {
        return html`
            <a class="btn btn--primario btn--lg btn--bloco" href="assistir.html?curso=${curso.id}">${icone("olho", 18)} Pré-visualizar como aluno</a>
            <a class="btn btn--lg btn--bloco" href="admin.html#/cursos/${curso.id}">${icone("editar", 18)} Editar no painel</a>`;
    }
    if (matricula) {
        const destino = matricula.ultima_aula_id ? `assistir.html?curso=${curso.id}&aula=${matricula.ultima_aula_id}` : `assistir.html?curso=${curso.id}`;
        return html`
            <a class="btn btn--primario btn--lg btn--bloco" href="${destino}">${icone("play", 18)} Continuar curso (${matricula.percentual}%)</a>`;
    }
    return html`<button class="btn btn--primario btn--lg btn--bloco" data-matricular>${icone("foguete", 18)} Começar curso agora</button>`;
}

function grade(curso, liberado) {
    if (curso.modulos.length === 0) {
        return estadoVazio({ icone: "camadas", titulo: "Conteúdo em preparação", texto: "Os módulos deste curso serão publicados em breve." });
    }
    return html`
        <div class="modulos-lista">
            ${curso.modulos.map((modulo, indice) => {
                const total = modulo.aulas.reduce((soma, aula) => soma + aula.duracao_segundos, 0);
                return html`
                    <details class="modulo-sanfona" ${indice === 0 ? "open" : ""}>
                        <summary>
                            <span class="modulo-sanfona__numero">${String(indice + 1).padStart(2, "0")}</span>
                            <span class="modulo-sanfona__titulo">
                                <strong>${modulo.titulo}</strong>
                                <span>${plural(modulo.aulas.length, "aula")} · ${duracao(total)}</span>
                            </span>
                            ${icone("seta-baixo", 18)}
                        </summary>
                        <ul class="aulas-lista">
                            ${modulo.aulas.map((aula) => html`
                                <li class="aula-linha">
                                    ${icone(ICONE_POR_TIPO[aula.tipo], 17)}
                                    <span>${aula.titulo}</span>
                                    <small>${duracao(aula.duracao_segundos)}</small>
                                    ${icone(liberado ? "cadeado-aberto" : "cadeado", 15, "mudo")}
                                </li>`)}
                        </ul>
                    </details>`;
            })}
        </div>`;
}

async function iniciar() {
    const { usuario } = await montarLayout({ ativo: "cursos" });
    const id = Number(parametro("id"));
    const conteudo = $("#conteudo");

    let curso;
    try {
        curso = await api.get(`/publico/cursos/${id}`);
    } catch (erro) {
        definirTitulo("Curso não encontrado");
        renderizar(conteudo, html`<div class="container">${estadoVazio({
            icone: "busca", titulo: "Curso não encontrado", texto: erro.message,
            acao: html`<a class="btn btn--primario" href="index.html#cursos">Ver catálogo</a>`
        })}</div>`);
        return;
    }
    definirTitulo(curso.titulo);

    let matricula = null;
    if (usuario?.papel === "aluno") {
        try {
            matricula = (await api.get("/aluno/cursos")).find((item) => item.id === curso.id) || null;
        } catch { /* sem matrícula */ }
    }

    renderizar(conteudo, html`
        <section class="curso-topo" data-cor="${curso.categoria_cor || "#7c5cff"}">
            <div class="container curso-topo__grade">
                <div>
                    <nav class="migalhas" aria-label="Você está em">
                        <a href="index.html">Início</a> ${icone("seta-direita", 14)}
                        <a href="index.html#cursos">Cursos</a> ${icone("seta-direita", 14)}
                        <span>${curso.categoria_nome || "Geral"}</span>
                    </nav>
                    <div class="linha">
                        ${curso.categoria_nome ? html`<span class="selo selo--ponto" data-cor="${curso.categoria_cor}">${curso.categoria_nome}</span>` : ""}
                        ${seloNivel(curso.nivel)}
                    </div>
                    <h1>${curso.titulo}</h1>
                    <p class="curso-topo__resumo">${curso.resumo || ""}</p>
                    <div class="curso-topo__meta">
                        ${curso.instrutor ? html`<span>${icone("usuario", 16)} ${curso.instrutor}</span>` : ""}
                        <span>${icone("camadas", 16)} ${plural(curso.total_modulos, "módulo")}</span>
                        <span>${icone("play-circulo", 16)} ${plural(curso.total_aulas, "aula")}</span>
                        <span>${icone("relogio", 16)} ${duracao(curso.duracao_segundos)} de conteúdo</span>
                        <span>${icone("usuarios", 16)} ${plural(curso.total_alunos, "aluno")}</span>
                    </div>
                </div>
            </div>
        </section>
        <div class="container curso-corpo">
            <div>
                <section>
                    <h2>Sobre o curso</h2>
                    <div class="markdown" id="descricao"></div>
                </section>
                <section>
                    <h2>Conteúdo do curso</h2>
                    ${grade(curso, Boolean(usuario))}
                </section>
            </div>
                <aside class="cartao-inscricao">
                    ${capaCurso(curso, { selo: false })}
                    <div class="cartao-inscricao__corpo">
                        <div class="pilha" id="acoes-curso">${botoesDeAcao(curso, usuario, matricula)}</div>
                        <ul>
                            <li>${icone("play-circulo", 17)} ${plural(curso.total_aulas, "aula")} em ${plural(curso.total_modulos, "módulo")}</li>
                            <li>${icone("relogio", 17)} ${duracao(curso.duracao_segundos)} de conteúdo</li>
                            <li>${icone("subindo", 17)} Acompanhamento de progresso</li>
                            <li>${icone("caneta", 17)} Anotações em cada aula</li>
                            <li>${icone("medalha", 17)} Certificado de conclusão</li>
                        </ul>
                        ${!usuario ? html`<p class="pequeno mudo">O acesso às aulas é liberado após a aprovação do seu cadastro.</p>` : ""}
                    </div>
                </aside>
        </div>`);

    $("#descricao").innerHTML = curso.descricao
        ? markdownParaHtml(curso.descricao)
        : String(html`<p>${curso.resumo || "Sem descrição."}</p>`);

    $("[data-matricular]")?.addEventListener("click", (evento) => comCarregamento(evento.currentTarget, async () => {
        try {
            await api.post(`/aluno/cursos/${curso.id}/matricula`);
            location.href = `assistir.html?curso=${curso.id}`;
        } catch (erro) {
            toastErro(erro);
        }
    }));
}

iniciar();
