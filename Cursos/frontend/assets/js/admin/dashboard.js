// Dashboard: indicadores, gráfico de cadastros, controles de acesso, pendências e atividade.
import { api } from "../api.js";
import { html, renderizar, $, toast, toastErro, confirmar, numero, duracao, bytes, tempoRelativo, data } from "../ui.js";
import { icone } from "../icones.js";
import { avatar } from "../layout.js";
import { capaCurso } from "../componentes.js";
import { cabecalhoPagina, iconeDaAcao, interruptor } from "./comum.js";

function saudacao() {
    const hora = new Date().getHours();
    return hora < 12 ? "Bom dia" : hora < 18 ? "Boa tarde" : "Boa noite";
}

function kpi({ nomeIcone, cor, rotulo, valor, detalhe, link, alerta = false }) {
    const conteudo = html`
        <div class="kpi__topo"><span>${rotulo}</span><span class="kpi__icone" data-cor="${cor}">${icone(nomeIcone, 18)}</span></div>
        <strong>${valor}</strong>
        ${detalhe ? html`<small>${detalhe}</small>` : ""}`;
    return link
        ? html`<a class="kpi ${alerta ? "kpi--alerta" : ""}" href="${link}">${conteudo}</a>`
        : html`<div class="kpi">${conteudo}</div>`;
}

// Gráfico de barras de uma série (cadastros por dia) com dica ao passar o mouse
function graficoCadastros(dias) {
    const maior = Math.max(...dias.map((dia) => dia.total));
    const teto = Math.max(4, Math.ceil(maior / 2) * 2);
    const rotuloDia = (dia) => dia.split("-").reverse().slice(0, 2).join("/");
    const total = dias.reduce((soma, dia) => soma + dia.total, 0);
    return html`
        <div class="grafico" role="img" aria-label="Gráfico de novos cadastros por dia nos últimos 30 dias: ${total} no total">
            <div class="grafico__area">
                <div class="grafico__grade" aria-hidden="true">
                    <span data-valor="${teto}"></span><span data-valor="${teto / 2}"></span><span data-valor="0"></span>
                </div>
                ${dias.map((dia) => html`
                    <div class="grafico__barra" tabindex="0" data-altura="${(dia.total / teto) * 100}" ${dia.total === 0 ? "data-zero" : ""}
                         aria-label="${rotuloDia(dia.dia)}: ${dia.total} cadastro(s)">
                        <i></i>
                        <span class="grafico__dica"><strong>${dia.total} cadastro${dia.total === 1 ? "" : "s"}</strong>${data(`${dia.dia}T12:00:00`)}</span>
                    </div>`)}
            </div>
            <div class="grafico__eixo" aria-hidden="true">
                <span>${rotuloDia(dias[0].dia)}</span><span>${rotuloDia(dias[14].dia)}</span><span>${rotuloDia(dias.at(-1).dia)}</span>
            </div>
        </div>
        <div class="sr-only"><table>
            <caption>Novos cadastros por dia</caption>
            <thead><tr><th>Dia</th><th>Cadastros</th></tr></thead>
            <tbody>${dias.map((dia) => html`<tr><td>${rotuloDia(dia.dia)}</td><td>${dia.total}</td></tr>`)}</tbody>
        </table></div>`;
}

function blocoArmazenamento(armazenamento) {
    const partes = [
        ["Vídeos e arquivos das aulas", armazenamento.aulas],
        ["Materiais de apoio", armazenamento.materiais],
        ["Imagens (capas, logo, fotos)", armazenamento.imagens]
    ];
    const total = partes.reduce((soma, [, item]) => soma + item.total, 0);
    return html`
        <div class="linha-entre"><strong>${icone("disco", 16)} Armazenamento</strong><span class="mudo pequeno">${bytes(total)} em uso</span></div>
        <div class="armazenamento" aria-hidden="true">
            ${partes.map(([, item]) => html`<i data-largura="${total ? (item.total / total) * 100 : 0}"></i>`)}
        </div>
        <div class="legenda">
            ${partes.map(([rotulo, item]) => html`
                <div class="legenda-item"><span class="legenda-cor"></span>${rotulo} <small class="mudo">(${item.quantidade})</small><strong>${bytes(item.total)}</strong></div>`)}
        </div>`;
}

export async function montar(alvo, { app, ativa }) {
    const dados = await api.get("/admin/dashboard");
    if (!ativa()) return;
    const n = dados.numeros;

    renderizar(alvo, html`
        ${cabecalhoPagina({
            titulo: `${saudacao()}, ${app.usuario.nome.split(" ")[0]}!`,
            descricao: `Resumo da plataforma em ${new Date().toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" })}.`,
            acoes: html`
                <a class="btn" href="#/importar">${icone("pacote", 16)} Importar ZIP</a>
                <a class="btn btn--primario" href="#/cursos?novo=1">${icone("mais", 16)} Novo curso</a>`
        })}

        ${n.alunos_pendentes > 0 ? html`
            <div class="faixa-pendentes">
                ${icone("ampulheta", 22)}
                <div>
                    <strong>${n.alunos_pendentes} cadastro${n.alunos_pendentes > 1 ? "s" : ""} aguardando aprovação</strong>
                    <span>Novos alunos só conseguem entrar depois que você aprovar o acesso.</span>
                </div>
                <a class="btn btn--sm" href="#/usuarios?status=pendente">Revisar agora ${icone("avancar", 15)}</a>
            </div>` : ""}

        <div class="kpis">
            ${kpi({ nomeIcone: "usuario-ok", cor: "#22c55e", rotulo: "Alunos ativos", valor: numero(n.alunos_ativos), detalhe: `${numero(n.alunos_total)} cadastrados no total`, link: "#/usuarios?status=ativo" })}
            ${kpi({ nomeIcone: "ampulheta", cor: "#f59e0b", rotulo: "Aguardando aprovação", valor: numero(n.alunos_pendentes), detalhe: `${numero(n.alunos_bloqueados)} bloqueado(s)`, link: "#/usuarios?status=pendente", alerta: n.alunos_pendentes > 0 })}
            ${kpi({ nomeIcone: "livro", cor: "#7c5cff", rotulo: "Cursos publicados", valor: `${numero(n.cursos_publicados)}/${numero(n.cursos_total)}`, detalhe: `${numero(n.modulos_total)} módulos`, link: "#/cursos" })}
            ${kpi({ nomeIcone: "play-circulo", cor: "#22d3ee", rotulo: "Aulas", valor: numero(n.aulas_total), detalhe: `${duracao(n.duracao_total)} de conteúdo` })}
            ${kpi({ nomeIcone: "formatura", cor: "#a78bfa", rotulo: "Matrículas", valor: numero(n.matriculas_total), detalhe: `${numero(n.matriculas_concluidas)} concluída(s)` })}
            ${kpi({ nomeIcone: "medalha", cor: "#fbbf24", rotulo: "Certificados", valor: numero(n.certificados_total), detalhe: `${numero(n.online_agora)} usuário(s) online agora`, link: "#/certificados" })}
        </div>

        <div class="dash-grade">
            <section class="cartao">
                <div class="cartao__cabecalho">
                    <h2 class="cartao__titulo">${icone("grafico", 18)} Novos cadastros · últimos 30 dias</h2>
                    <span class="mudo pequeno">${dados.cadastros_por_dia.reduce((s, d) => s + d.total, 0)} no período</span>
                </div>
                <div class="cartao__corpo">${graficoCadastros(dados.cadastros_por_dia)}</div>
            </section>
            <section class="cartao">
                <div class="cartao__cabecalho"><h2 class="cartao__titulo">${icone("escudo", 18)} Acesso à plataforma</h2></div>
                <div class="cartao__corpo">
                    <div class="controle-acesso">
                        <div><strong>Novos cadastros</strong><p>Quando desligado, a página de cadastro fica fechada.</p></div>
                        ${interruptor({ id: "chave-registros", marcado: dados.sistema.registros_abertos })}
                    </div>
                    <div class="controle-acesso">
                        <div><strong>Login de alunos</strong><p>Desligar corta o acesso de todos os alunos imediatamente.</p></div>
                        ${interruptor({ id: "chave-login", marcado: dados.sistema.login_alunos })}
                    </div>
                    <div class="status-sistema">
                        <div><span>Banco de dados</span><strong><i class="ponto-online"></i> Conectado</strong></div>
                        <div><span>Servidor</span><strong><i class="ponto-online"></i> ${dados.sistema.servidor_status === "online" ? "Online" : "Indisponível"}</strong></div>
                    </div>
                    <div class="espaco-topo">${blocoArmazenamento(dados.armazenamento)}</div>
                </div>
            </section>
        </div>

        <div class="dash-grade dash-grade--3">
            <section class="cartao">
                <div class="cartao__cabecalho"><h2 class="cartao__titulo">${icone("ampulheta", 18)} Cadastros pendentes</h2><a class="link pequeno" href="#/usuarios?status=pendente">Ver todos</a></div>
                <div class="cartao__corpo lista-simples" id="lista-pendentes">
                    ${dados.pendentes.length ? dados.pendentes.map((u) => html`
                        <div class="lista-simples__item" data-usuario="${u.id}">
                            ${avatar(u, "avatar--sm")}
                            <div><strong class="cortar">${u.nome}</strong><span class="cortar">${u.email} · ${tempoRelativo(u.criado_em)}</span></div>
                            <button class="btn btn--sm btn--sucesso btn--icone" data-aprovar="${u.id}" title="Aprovar" aria-label="Aprovar ${u.nome}">${icone("check", 15)}</button>
                            <button class="btn btn--sm btn--perigo btn--icone" data-rejeitar="${u.id}" title="Rejeitar" aria-label="Rejeitar ${u.nome}">${icone("x", 15)}</button>
                        </div>`) : html`<p class="mudo pequeno">Nenhum cadastro aguardando. Tudo em dia! ✨</p>`}
                </div>
            </section>
            <section class="cartao">
                <div class="cartao__cabecalho"><h2 class="cartao__titulo">${icone("subindo", 18)} Cursos mais populares</h2><a class="link pequeno" href="#/cursos">Ver todos</a></div>
                <div class="cartao__corpo lista-simples">
                    ${dados.cursos_populares.length ? dados.cursos_populares.map((c) => html`
                        <a class="lista-simples__item" href="#/cursos/${c.id}">
                            <span class="miniatura">${capaCurso(c, { selo: false })}</span>
                            <div><strong class="cortar">${c.titulo}</strong><span>${c.total_alunos} aluno(s) · ${c.total_aulas} aula(s)</span></div>
                            ${c.publicado ? "" : html`<span class="selo selo--rascunho">Rascunho</span>`}
                        </a>`) : html`<p class="mudo pequeno">Nenhum curso cadastrado ainda.</p>`}
                </div>
            </section>
            <section class="cartao">
                <div class="cartao__cabecalho"><h2 class="cartao__titulo">${icone("atividade", 18)} Atividade recente</h2><a class="link pequeno" href="#/auditoria">Auditoria</a></div>
                <div class="cartao__corpo">
                    ${dados.atividade_recente.map((a) => html`
                        <div class="atividade-item">
                            <span class="atividade-item__ponto">${icone(iconeDaAcao(a.acao), 15)}</span>
                            <div><p>${a.descricao}</p><span>${a.usuario_nome || "Sistema"} · ${tempoRelativo(a.criado_em)}</span></div>
                        </div>`)}
                </div>
            </section>
        </div>`);

    // Controles de acesso
    $("#chave-registros").addEventListener("change", async (evento) => {
        try {
            await api.put("/admin/configuracoes", { registros_abertos: evento.target.checked });
            toast(evento.target.checked ? "Novos cadastros liberados." : "Novos cadastros bloqueados.");
        } catch (erro) {
            evento.target.checked = !evento.target.checked;
            toastErro(erro);
        }
    });
    $("#chave-login").addEventListener("change", async (evento) => {
        const ligar = evento.target.checked;
        if (!ligar) {
            const ok = await confirmar({
                titulo: "Suspender o login de todos os alunos?",
                mensagem: "Todos os alunos conectados perderão o acesso imediatamente e ninguém conseguirá entrar até você reativar. O administrador continua com acesso.",
                textoConfirmar: "Suspender acesso", perigo: true
            });
            if (!ok) {
                evento.target.checked = true;
                return;
            }
        }
        try {
            await api.put("/admin/configuracoes", { login_alunos: ligar });
            toast(ligar ? "Login de alunos liberado." : "Login de alunos suspenso.", ligar ? "sucesso" : "alerta");
        } catch (erro) {
            evento.target.checked = !ligar;
            toastErro(erro);
        }
    });

    // Aprovação rápida
    $("#lista-pendentes").addEventListener("click", async (evento) => {
        const botao = evento.target.closest("[data-aprovar], [data-rejeitar]");
        if (!botao) return;
        const aprovar = Boolean(botao.dataset.aprovar);
        const id = botao.dataset.aprovar || botao.dataset.rejeitar;
        let motivo = null;
        if (!aprovar) {
            const resposta = await confirmar({ titulo: "Rejeitar cadastro?", mensagem: "O usuário não poderá entrar na plataforma.", textoConfirmar: "Rejeitar", perigo: true, pedirMotivo: true });
            if (!resposta) return;
            motivo = resposta.motivo;
        }
        try {
            await api.patch(`/admin/usuarios/${id}/status`, { status: aprovar ? "ativo" : "rejeitado", motivo });
            toast(aprovar ? "Cadastro aprovado! O aluno já pode entrar." : "Cadastro rejeitado.");
            await montar(alvo, { app, ativa });
            app.atualizarPendentes();
        } catch (erro) {
            toastErro(erro);
        }
    });
}
