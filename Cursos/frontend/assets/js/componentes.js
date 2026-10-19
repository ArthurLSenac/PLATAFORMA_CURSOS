// Componentes visuais reutilizados em várias páginas (cartões de curso, capas, indicadores).
import { urlArquivo } from "./api.js";
import { html, duracao, plural, NIVEIS } from "./ui.js";
import { icone } from "./icones.js";

const COR_PADRAO = "#7c5cff";

export function capaCurso(curso, { selo = true } = {}) {
    return html`
        <div class="capa" data-cor="${curso.categoria_cor || COR_PADRAO}">
            ${curso.capa
                ? html`<img src="${urlArquivo(curso.capa)}" alt="" loading="lazy">`
                : html`<span class="capa__simbolo">${icone("formatura", 30)}</span>`}
            ${selo && curso.categoria_nome ? html`<span class="capa__selo"><span class="selo">${curso.categoria_nome}</span></span>` : ""}
        </div>`;
}

export function seloNivel(nivel) {
    const cores = { iniciante: "#22c55e", intermediario: "#f59e0b", avancado: "#f43f5e" };
    return html`<span class="selo selo--ponto" data-cor="${cores[nivel] || COR_PADRAO}">${NIVEIS[nivel] || nivel}</span>`;
}

// Cartão do catálogo público
export function cartaoCurso(curso) {
    return html`
        <article class="cartao-curso" data-cor="${curso.categoria_cor || COR_PADRAO}">
            ${capaCurso(curso)}
            <div class="cartao-curso__corpo">
                <div class="cartao-curso__meta">
                    ${seloNivel(curso.nivel)}
                    ${curso.destaque ? html`<span class="selo selo--info">${icone("estrela", 12)} Destaque</span>` : ""}
                </div>
                <h3><a class="link-cobertura" href="curso.html?id=${curso.id}">${curso.titulo}</a></h3>
                <p>${curso.resumo || "Curso completo com aulas práticas e certificado de conclusão."}</p>
                <div class="cartao-curso__rodape">
                    <span>${icone("camadas", 15)} ${plural(curso.total_modulos, "módulo")}</span>
                    <span>${icone("play-circulo", 15)} ${plural(curso.total_aulas, "aula")}</span>
                    <span>${icone("relogio", 15)} ${duracao(curso.duracao_segundos)}</span>
                </div>
            </div>
        </article>`;
}

// Cartão da área do aluno, com progresso
export function cartaoCursoAluno(curso) {
    const percentual = curso.percentual ?? 0;
    const concluido = percentual >= 100;
    const destino = curso.ultima_aula_id
        ? `assistir.html?curso=${curso.id}&aula=${curso.ultima_aula_id}`
        : `assistir.html?curso=${curso.id}`;
    return html`
        <article class="cartao-curso" data-cor="${curso.categoria_cor || COR_PADRAO}">
            ${capaCurso(curso)}
            <div class="cartao-curso__corpo">
                <div class="cartao-curso__meta">
                    ${seloNivel(curso.nivel)}
                    ${concluido ? html`<span class="selo selo--sucesso">${icone("check", 12)} Concluído</span>` : ""}
                </div>
                <h3><a class="link-cobertura" href="${destino}">${curso.titulo}</a></h3>
                <p>${curso.ultima_aula_titulo ? `Última aula: ${curso.ultima_aula_titulo}` : curso.resumo || ""}</p>
                <div class="cartao-curso__progresso">
                    <div class="linha-entre">
                        <span><strong>${percentual}%</strong> concluído</span>
                        <span>${curso.aulas_concluidas}/${curso.total_aulas} aulas</span>
                    </div>
                    <div class="progresso ${concluido ? "progresso--sucesso" : ""}"><div class="progresso__barra" data-largura="${percentual}"></div></div>
                    ${curso.certificado_codigo
                        ? html`<a class="btn btn--sm acima" href="certificado.html?codigo=${curso.certificado_codigo}">${icone("medalha", 15)} Ver certificado</a>`
                        : ""}
                </div>
            </div>
        </article>`;
}

export function esqueletoCartoes(quantidade = 3) {
    return html`${Array.from({ length: quantidade }, () => html`<div class="esqueleto cartao-esqueleto"></div>`)}`;
}

export function estadoVazio({ icone: nomeIcone = "livro", titulo, texto, acao = "" }) {
    return html`
        <div class="vazio">
            <div class="vazio__icone">${icone(nomeIcone, 28)}</div>
            <h3>${titulo}</h3>
            ${texto ? html`<p>${texto}</p>` : ""}
            ${acao}
        </div>`;
}
