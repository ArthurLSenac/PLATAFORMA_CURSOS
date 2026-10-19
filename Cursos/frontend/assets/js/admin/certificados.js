// Certificados emitidos: consulta e revogação.
import { api } from "../api.js";
import { html, renderizar, $, toast, toastErro, confirmar, debounce, dataHora } from "../ui.js";
import { icone } from "../icones.js";
import { estadoVazio } from "../componentes.js";
import { cabecalhoPagina } from "./comum.js";

let contexto;
let busca = "";
let lista = [];

async function carregar() {
    lista = await api.get(`/admin/certificados${busca ? `?busca=${encodeURIComponent(busca)}` : ""}`);
    if (!contexto.ativa()) return;
    const area = $("#area-certificados");
    if (lista.length === 0) {
        renderizar(area, estadoVazio({ icone: "medalha", titulo: busca ? "Nada encontrado" : "Nenhum certificado emitido", texto: "Os certificados aparecem aqui quando um aluno conclui 100% de um curso e emite o documento." }));
        return;
    }
    renderizar(area, html`
        <div class="tabela-container">
            <table class="tabela">
                <thead><tr><th>Código</th><th>Aluno</th><th>Curso</th><th>Carga</th><th>Emitido em</th><th></th></tr></thead>
                <tbody>
                    ${lista.map((c) => html`
                        <tr>
                            <td><code>${c.codigo}</code></td>
                            <td><strong>${c.nome_aluno}</strong><br><span class="mudo pequeno">${c.email || "usuário removido"}</span></td>
                            <td>${c.titulo_curso}</td>
                            <td>${c.carga_horaria}h</td>
                            <td>${dataHora(c.emitido_em)}</td>
                            <td><div class="acoes-celula">
                                <a class="btn btn--sm btn--fantasma" href="certificado.html?codigo=${c.codigo}" target="_blank" rel="noopener">${icone("olho", 15)} Ver</a>
                                <button class="btn btn--sm btn--perigo" data-revogar="${c.id}">${icone("x", 15)} Revogar</button>
                            </div></td>
                        </tr>`)}
                </tbody>
            </table>
        </div>`);
}

export async function montar(alvo, ctx) {
    contexto = ctx;
    busca = "";
    renderizar(alvo, html`
        ${cabecalhoPagina({ titulo: "Certificados", descricao: "Certificados emitidos pelos alunos. Revogar invalida o código na verificação pública." })}
        <div class="barra-ferramentas">
            <label class="entrada-icone">${icone("busca", 17)}<input class="entrada" type="search" id="busca-certificados" placeholder="Buscar por código, aluno ou curso..." aria-label="Buscar certificados"></label>
            <a class="btn" href="verificar.html" target="_blank" rel="noopener">${icone("escudo", 16)} Página de verificação</a>
        </div>
        <div id="area-certificados"><div class="carregando-pagina"><span class="spinner"></span></div></div>`);
    $("#busca-certificados").addEventListener("input", debounce((evento) => {
        busca = evento.target.value.trim();
        carregar();
    }, 300));
    alvo.addEventListener("click", async (evento) => {
        const botao = evento.target.closest("[data-revogar]");
        if (!botao) return;
        const certificado = lista.find((c) => c.id === Number(botao.dataset.revogar));
        const ok = await confirmar({ titulo: "Revogar certificado?", mensagem: `O código ${certificado.codigo} de ${certificado.nome_aluno} deixará de ser válido. O aluno poderá emitir um novo certificado.`, textoConfirmar: "Revogar", perigo: true });
        if (!ok) return;
        try {
            toast((await api.delete(`/admin/certificados/${certificado.id}`)).mensagem);
            carregar();
        } catch (erro) {
            toastErro(erro);
        }
    });
    await carregar();
}
