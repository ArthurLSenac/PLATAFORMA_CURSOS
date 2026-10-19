// Registro de auditoria: todas as ações importantes com usuário, data e IP.
import { api } from "../api.js";
import { html, renderizar, $, debounce, dataHora } from "../ui.js";
import { icone } from "../icones.js";
import { estadoVazio } from "../componentes.js";
import { cabecalhoPagina, paginacao, iconeDaAcao } from "./comum.js";

const CATEGORIAS = [
    ["", "Todas as ações"], ["login", "Logins"], ["usuario", "Usuários"], ["curso", "Cursos"], ["modulo", "Módulos"],
    ["aula", "Aulas"], ["material", "Materiais"], ["importacao", "Importações"], ["certificado", "Certificados"],
    ["configuracoes", "Configurações"], ["acesso", "Controle de acesso"], ["perfil", "Perfil"], ["matricula", "Matrículas"]
];
const estado = { categoria: "", busca: "", pagina: 1 };
let contexto;

async function carregar() {
    const consulta = new URLSearchParams({ pagina: estado.pagina, limite: 25 });
    if (estado.categoria) consulta.set("categoria", estado.categoria);
    if (estado.busca) consulta.set("busca", estado.busca);
    const resposta = await api.get(`/admin/auditoria?${consulta}`);
    if (!contexto.ativa()) return;
    const area = $("#area-auditoria");
    if (resposta.dados.length === 0) {
        renderizar(area, estadoVazio({ icone: "atividade", titulo: "Nenhum registro encontrado" }));
        return;
    }
    renderizar(area, html`
        <div class="tabela-container">
            <table class="tabela">
                <thead><tr><th>Data e hora</th><th>Ação</th><th>Descrição</th><th>Usuário</th><th>IP</th></tr></thead>
                <tbody>
                    ${resposta.dados.map((r) => html`
                        <tr>
                            <td class="pequeno">${dataHora(r.criado_em)}</td>
                            <td><span class="selo ${/falha|bloque|excluid|revog|suspenso|rejeitado/.test(r.acao) ? "selo--perigo" : /sucesso|ativo|criad|aprov|emitido|liberado|abertos/.test(r.acao) ? "selo--sucesso" : ""}">${icone(iconeDaAcao(r.acao), 12)} ${r.acao}</span></td>
                            <td>${r.descricao}</td>
                            <td class="pequeno">${r.usuario_nome || html`<span class="mudo">Sistema/visitante</span>`}</td>
                            <td class="pequeno mudo"><code>${r.ip || "—"}</code></td>
                        </tr>`)}
                </tbody>
            </table>
        </div>`);
    area.appendChild(paginacao(resposta, (pagina) => {
        estado.pagina = pagina;
        carregar();
    }, "registro"));
}

export async function montar(alvo, ctx) {
    contexto = ctx;
    estado.pagina = 1;
    renderizar(alvo, html`
        ${cabecalhoPagina({ titulo: "Auditoria", descricao: "Histórico de segurança: logins, aprovações, bloqueios, alterações de conteúdo e configurações." })}
        <div class="barra-ferramentas">
            <label class="entrada-icone">${icone("busca", 17)}<input class="entrada" type="search" id="busca-auditoria" placeholder="Buscar na descrição, usuário ou IP..." aria-label="Buscar registros"></label>
            <select class="selecao" id="categoria-auditoria" aria-label="Tipo de ação">
                ${CATEGORIAS.map(([valor, rotulo]) => html`<option value="${valor}">${rotulo}</option>`)}
            </select>
        </div>
        <div id="area-auditoria"><div class="carregando-pagina"><span class="spinner"></span></div></div>`);
    $("#busca-auditoria").addEventListener("input", debounce((evento) => {
        estado.busca = evento.target.value.trim();
        estado.pagina = 1;
        carregar();
    }, 300));
    $("#categoria-auditoria").addEventListener("change", (evento) => {
        estado.categoria = evento.target.value;
        estado.pagina = 1;
        carregar();
    });
    await carregar();
}
