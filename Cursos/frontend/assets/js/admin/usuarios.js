// Gestão de usuários: aprovar/rejeitar cadastros, bloquear/desbloquear ("cortar" o login),
// editar, redefinir senha, encerrar sessões, excluir, ações em lote e exportação CSV.
import { api, API } from "../api.js";
import {
    html, renderizar, $, $$, toast, toastErro, confirmar, abrirModal, comCarregamento, debounce,
    data, dataHora, tempoRelativo, copiarTexto
} from "../ui.js";
import { icone } from "../icones.js";
import { avatar } from "../layout.js";
import { estadoVazio } from "../componentes.js";
import { cabecalhoPagina, seloStatus, paginacao, abrirMenuContexto, abrirGaveta, gerarSenha } from "./comum.js";

const STATUS = [["todos", "Todos"], ["pendente", "Pendentes"], ["ativo", "Ativos"], ["bloqueado", "Bloqueados"], ["rejeitado", "Rejeitados"]];

const estado = { status: "todos", busca: "", ordem: "", pagina: 1, selecionados: new Set(), dados: [] };
let contexto;

// ---------------------------------------------------------------------------
// Ações sobre um usuário
// ---------------------------------------------------------------------------
async function alterarStatus(usuario, status) {
    const textos = {
        ativo: usuario.status === "pendente"
            ? null
            : { titulo: `Reativar ${usuario.nome}?`, mensagem: "O usuário voltará a ter acesso à plataforma.", botao: "Reativar", perigo: false },
        bloqueado: { titulo: `Bloquear ${usuario.nome}?`, mensagem: "O login será cortado na hora: todas as sessões abertas são encerradas e ele não conseguirá entrar até ser desbloqueado.", botao: "Bloquear acesso", perigo: true, motivo: true },
        rejeitado: { titulo: `Rejeitar o cadastro de ${usuario.nome}?`, mensagem: "O usuário não poderá entrar na plataforma.", botao: "Rejeitar", perigo: true, motivo: true },
        pendente: { titulo: "Voltar para pendente?", mensagem: "O acesso fica suspenso até nova aprovação.", botao: "Confirmar", perigo: true }
    };
    let motivo = null;
    const texto = textos[status];
    if (texto) {
        const resposta = await confirmar({
            titulo: texto.titulo, mensagem: texto.mensagem, textoConfirmar: texto.botao, perigo: texto.perigo,
            pedirMotivo: Boolean(texto.motivo), rotuloMotivo: "Motivo (o aluno verá esta mensagem ao tentar entrar)"
        });
        if (!resposta) return;
        motivo = resposta.motivo || null;
    }
    try {
        const resposta = await api.patch(`/admin/usuarios/${usuario.id}/status`, { status, motivo });
        toast(resposta.mensagem);
        await carregar();
        contexto.app.atualizarPendentes();
    } catch (erro) {
        toastErro(erro);
    }
}

function formularioUsuario(usuario = null) {
    const novo = !usuario;
    const { elemento, fechar } = abrirModal({
        titulo: novo ? "Cadastrar aluno" : "Editar usuário",
        subtitulo: novo ? "O aluno cadastrado pelo administrador já pode entrar imediatamente." : usuario.email,
        conteudo: html`
            <form class="pilha" id="form-usuario" novalidate>
                <div class="campo"><label for="u-nome">Nome completo</label><input class="entrada" id="u-nome" maxlength="120" value="${usuario?.nome || ""}" required></div>
                <div class="campo"><label for="u-email">E-mail</label><input class="entrada" type="email" id="u-email" maxlength="190" value="${usuario?.email || ""}" required></div>
                ${novo ? html`
                    <div class="campo">
                        <label for="u-senha">Senha inicial</label>
                        <div class="linha">
                            <input class="entrada" id="u-senha" maxlength="72" value="${gerarSenha()}" required>
                            <button type="button" class="btn btn--icone" id="u-gerar" title="Gerar outra">${icone("atualizar", 16)}</button>
                            <button type="button" class="btn btn--icone" id="u-copiar" title="Copiar">${icone("copiar", 16)}</button>
                        </div>
                        <small>Envie esta senha ao aluno. Ele pode alterá-la no perfil.</small>
                    </div>
                    <div class="campo">
                        <label for="u-status">Situação</label>
                        <select class="selecao" id="u-status"><option value="ativo">Ativo (pode entrar)</option><option value="pendente">Pendente</option></select>
                    </div>` : ""}
                <div class="campo"><label for="u-bio">Bio (opcional)</label><textarea class="area-texto" id="u-bio" maxlength="500" rows="3">${usuario?.bio || ""}</textarea></div>
            </form>`,
        rodape: html`
            <button class="btn btn--fantasma" data-fechar>Cancelar</button>
            <button class="btn btn--primario" id="u-salvar">${icone("salvar", 16)} ${novo ? "Cadastrar" : "Salvar alterações"}</button>`
    });
    $("#u-gerar", elemento)?.addEventListener("click", () => ($("#u-senha", elemento).value = gerarSenha()));
    $("#u-copiar", elemento)?.addEventListener("click", () => copiarTexto($("#u-senha", elemento).value));
    $("#u-salvar", elemento).addEventListener("click", (evento) => comCarregamento(evento.currentTarget, async () => {
        const corpo = {
            nome: $("#u-nome", elemento).value.trim(),
            email: $("#u-email", elemento).value.trim(),
            bio: $("#u-bio", elemento).value.trim()
        };
        try {
            if (novo) {
                await api.post("/admin/usuarios", { ...corpo, senha: $("#u-senha", elemento).value, status: $("#u-status", elemento).value });
                toast("Aluno cadastrado com sucesso.");
            } else {
                await api.put(`/admin/usuarios/${usuario.id}`, corpo);
                toast("Usuário atualizado.");
            }
            fechar();
            carregar();
        } catch (erro) {
            toastErro(erro);
        }
    }));
}

function redefinirSenha(usuario) {
    const { elemento, fechar } = abrirModal({
        titulo: "Redefinir senha",
        subtitulo: `${usuario.nome} · ${usuario.email}`,
        tamanho: "sm",
        conteudo: html`
            <div class="campo">
                <label for="nova-senha">Nova senha</label>
                <div class="linha">
                    <input class="entrada" id="nova-senha" value="${gerarSenha()}" maxlength="72">
                    <button type="button" class="btn btn--icone" id="copiar-senha" title="Copiar">${icone("copiar", 16)}</button>
                </div>
                <small>As sessões abertas do usuário serão encerradas.</small>
            </div>`,
        rodape: html`<button class="btn btn--fantasma" data-fechar>Cancelar</button><button class="btn btn--primario" id="confirmar-senha">${icone("chave", 16)} Redefinir</button>`
    });
    $("#copiar-senha", elemento).addEventListener("click", () => copiarTexto($("#nova-senha", elemento).value));
    $("#confirmar-senha", elemento).addEventListener("click", (evento) => comCarregamento(evento.currentTarget, async () => {
        try {
            const resposta = await api.post(`/admin/usuarios/${usuario.id}/senha`, { nova_senha: $("#nova-senha", elemento).value });
            toast(resposta.mensagem);
            fechar();
        } catch (erro) {
            toastErro(erro);
        }
    }));
}

async function encerrarSessoes(usuario) {
    const ok = await confirmar({ titulo: "Encerrar todas as sessões?", mensagem: `${usuario.nome} será desconectado de todos os dispositivos (precisará entrar novamente).`, textoConfirmar: "Encerrar sessões", perigo: true });
    if (!ok) return;
    try {
        toast((await api.delete(`/admin/usuarios/${usuario.id}/sessoes`)).mensagem);
        carregar();
    } catch (erro) {
        toastErro(erro);
    }
}

async function excluir(usuario) {
    const ok = await confirmar({ titulo: `Excluir ${usuario.nome}?`, mensagem: "Esta ação é permanente: matrículas, progresso, anotações e certificados do usuário também serão apagados.", textoConfirmar: "Excluir definitivamente", perigo: true });
    if (!ok) return;
    try {
        toast((await api.delete(`/admin/usuarios/${usuario.id}`)).mensagem);
        estado.selecionados.delete(usuario.id);
        await carregar();
        contexto.app.atualizarPendentes();
    } catch (erro) {
        toastErro(erro);
    }
}

async function detalhes(id) {
    const { corpo, fechar } = abrirGaveta({ titulo: html`${icone("usuario", 18)} Detalhes do usuário`, conteudo: html`<span class="spinner"></span>` });
    let u;
    try {
        u = await api.get(`/admin/usuarios/${id}`);
    } catch (erro) {
        renderizar(corpo, estadoVazio({ icone: "aviso", titulo: "Erro", texto: erro.message }));
        return;
    }
    renderizar(corpo, html`
        <div class="gaveta__perfil">
            ${avatar(u, "avatar--lg")}
            <div>
                <h3>${u.nome}</h3>
                <p class="pequeno">${u.email}</p>
                <div class="linha espaco-topo">${seloStatus(u.status)} ${u.admin_fixo ? html`<span class="selo selo--admin">${icone("escudo", 12)} Admin fixo</span>` : ""}</div>
            </div>
        </div>
        ${u.motivo_status ? html`<div class="alerta alerta--alerta">${icone("info", 16)}<div><strong>Motivo registrado</strong><p>${u.motivo_status}</p></div></div>` : ""}
        <div class="dados-lista espaco-topo">
            <div><span>Cadastro</span><strong>${dataHora(u.criado_em)}</strong></div>
            <div><span>Aprovado em</span><strong>${dataHora(u.aprovado_em)}</strong></div>
            <div><span>Último login</span><strong>${u.ultimo_login ? tempoRelativo(u.ultimo_login) : "Nunca entrou"}</strong></div>
            <div><span>Sessões ativas</span><strong>${u.sessoes.length}</strong></div>
        </div>
        ${u.bio ? html`<div class="gaveta__secao"><h4>Sobre</h4><p>${u.bio}</p></div>` : ""}
        <div class="gaveta__secao">
            <h4>Matrículas (${u.matriculas.length})</h4>
            ${u.matriculas.length ? u.matriculas.map((m) => html`
                <div class="lista-simples__item">
                    <div>
                        <strong>${m.titulo}</strong>
                        <span>${m.aulas_concluidas}/${m.total_aulas} aulas · último acesso ${tempoRelativo(m.ultimo_acesso)}</span>
                        <div class="progresso espaco-topo ${m.percentual >= 100 ? "progresso--sucesso" : ""}"><div class="progresso__barra" data-largura="${m.percentual}"></div></div>
                    </div>
                    <strong>${m.percentual}%</strong>
                </div>`) : html`<p class="mudo pequeno">Nenhuma matrícula.</p>`}
        </div>
        ${u.certificados.length ? html`
            <div class="gaveta__secao">
                <h4>Certificados</h4>
                ${u.certificados.map((c) => html`<div class="lista-simples__item">${icone("medalha", 18)}<div><strong>${c.titulo_curso}</strong><span>${c.codigo} · ${data(c.emitido_em)}</span></div></div>`)}
            </div>` : ""}
        <div class="gaveta__secao">
            <h4>Sessões ativas</h4>
            ${u.sessoes.length ? u.sessoes.map((s) => html`
                <div class="lista-simples__item">${icone("monitor", 18)}<div><strong>IP ${s.ip || "—"}</strong><span>${(s.user_agent || "").slice(0, 70)} · ativa ${tempoRelativo(s.ultimo_acesso)}</span></div></div>`)
                : html`<p class="mudo pequeno">Nenhuma sessão aberta.</p>`}
        </div>
        ${u.admin_fixo ? html`<p class="mudo pequeno espaco-topo">${icone("cadeado", 14)} O administrador fixo é protegido: suas credenciais são definidas no arquivo .env.</p>` : html`
            <div class="gaveta__secao">
                <h4>Ações</h4>
                <div class="acoes-gaveta">
                    ${u.status === "pendente" ? html`<button class="btn btn--sucesso" data-acao="aprovar">${icone("check", 16)} Aprovar</button>` : ""}
                    ${u.status === "ativo" ? html`<button class="btn btn--perigo" data-acao="bloquear">${icone("bloquear", 16)} Bloquear</button>` : ""}
                    ${["bloqueado", "rejeitado"].includes(u.status) ? html`<button class="btn btn--sucesso" data-acao="aprovar">${icone("cadeado-aberto", 16)} Reativar</button>` : ""}
                    <button class="btn" data-acao="editar">${icone("editar", 16)} Editar</button>
                    <button class="btn" data-acao="senha">${icone("chave", 16)} Redefinir senha</button>
                    ${u.sessoes.length ? html`<button class="btn" data-acao="sessoes">${icone("sair", 16)} Encerrar sessões</button>` : ""}
                    <button class="btn btn--perigo" data-acao="excluir">${icone("lixeira", 16)} Excluir</button>
                </div>
            </div>`}`);

    corpo.addEventListener("click", (evento) => {
        const botao = evento.target.closest("[data-acao]");
        if (!botao) return;
        const acoes = {
            aprovar: () => alterarStatus(u, "ativo"),
            bloquear: () => alterarStatus(u, "bloqueado"),
            editar: () => formularioUsuario(u),
            senha: () => redefinirSenha(u),
            sessoes: () => encerrarSessoes(u),
            excluir: () => excluir(u)
        };
        fechar();
        acoes[botao.dataset.acao]?.();
    });
}

// ---------------------------------------------------------------------------
// Tabela
// ---------------------------------------------------------------------------
function botoesRapidos(u) {
    if (u.admin_fixo) return html`<span class="selo selo--admin">${icone("escudo", 12)} Admin fixo</span>`;
    if (u.status === "pendente") {
        return html`
            <button class="btn btn--sm btn--sucesso" data-rapido="aprovar" data-id="${u.id}">${icone("check", 14)} Aprovar</button>
            <button class="btn btn--sm btn--fantasma" data-rapido="rejeitar" data-id="${u.id}">Rejeitar</button>`;
    }
    if (u.status === "ativo") return html`<button class="btn btn--sm btn--fantasma" data-rapido="bloquear" data-id="${u.id}">${icone("bloquear", 14)} Bloquear</button>`;
    return html`<button class="btn btn--sm btn--sucesso" data-rapido="aprovar" data-id="${u.id}">${icone("cadeado-aberto", 14)} Reativar</button>`;
}

function desenharTabela(resposta) {
    estado.dados = resposta.dados;
    const area = $("#area-usuarios");
    if (resposta.dados.length === 0) {
        renderizar(area, estadoVazio({ icone: "usuarios", titulo: "Nenhum usuário encontrado", texto: estado.busca ? "Tente outro termo de busca." : "Não há usuários nesta situação." }));
        return;
    }
    const selecionaveis = resposta.dados.filter((u) => !u.admin_fixo);
    const todosMarcados = selecionaveis.length > 0 && selecionaveis.every((u) => estado.selecionados.has(u.id));
    renderizar(area, html`
        <div class="tabela-container">
            <table class="tabela">
                <thead>
                    <tr>
                        <th><input type="checkbox" class="caixa-selecao" id="marcar-todos" aria-label="Selecionar todos" ${todosMarcados ? "checked" : ""}></th>
                        <th>Usuário</th><th>Situação</th><th>Cadastro</th><th>Último acesso</th><th>Cursos</th><th></th>
                    </tr>
                </thead>
                <tbody>
                    ${resposta.dados.map((u) => html`
                        <tr aria-selected="${estado.selecionados.has(u.id)}">
                            <td>${u.admin_fixo ? "" : html`<input type="checkbox" class="caixa-selecao" data-selecionar="${u.id}" aria-label="Selecionar ${u.nome}" ${estado.selecionados.has(u.id) ? "checked" : ""}>`}</td>
                            <td>
                                <button class="celula-usuario" data-detalhes="${u.id}" title="Ver detalhes">
                                    ${avatar(u)}
                                    <span><strong>${u.nome}</strong><span>${u.email}</span></span>
                                </button>
                            </td>
                            <td>${seloStatus(u.status)}${u.sessoes_ativas > 0 ? html` <span class="selo" title="Sessões ativas">${icone("monitor", 11)} ${u.sessoes_ativas}</span>` : ""}</td>
                            <td><span title="${dataHora(u.criado_em)}">${data(u.criado_em)}</span></td>
                            <td>${u.ultimo_login ? tempoRelativo(u.ultimo_login) : html`<span class="mudo">Nunca</span>`}</td>
                            <td>${u.total_matriculas}</td>
                            <td>
                                <div class="acoes-celula">
                                    ${botoesRapidos(u)}
                                    <button class="btn btn--sm btn--fantasma btn--icone" data-mais="${u.id}" aria-label="Mais ações">${icone("mais_opcoes", 16)}</button>
                                </div>
                            </td>
                        </tr>`)}
                </tbody>
            </table>
        </div>`);
    area.appendChild(paginacao(resposta, (pagina) => {
        estado.pagina = pagina;
        carregar();
    }, "usuário"));
}

function desenharBarraLote() {
    const barra = $("#barra-lote");
    const total = estado.selecionados.size;
    if (total === 0) {
        barra.hidden = true;
        return;
    }
    barra.hidden = false;
    renderizar(barra, html`
        <strong>${total} selecionado(s)</strong>
        <button class="btn btn--sm btn--sucesso" data-lote="aprovar">${icone("check", 14)} Aprovar</button>
        <button class="btn btn--sm" data-lote="desbloquear">${icone("cadeado-aberto", 14)} Reativar</button>
        <button class="btn btn--sm" data-lote="bloquear">${icone("bloquear", 14)} Bloquear</button>
        <button class="btn btn--sm" data-lote="rejeitar">${icone("x", 14)} Rejeitar</button>
        <button class="btn btn--sm btn--perigo" data-lote="excluir">${icone("lixeira", 14)} Excluir</button>
        <button class="btn btn--sm btn--fantasma" data-lote="limpar">Limpar seleção</button>`);
}

async function acaoEmLote(acao) {
    if (acao === "limpar") {
        estado.selecionados.clear();
        desenharBarraLote();
        carregar();
        return;
    }
    const perigosa = ["bloquear", "rejeitar", "excluir"].includes(acao);
    const resposta = await confirmar({
        titulo: `Aplicar "${acao}" a ${estado.selecionados.size} usuário(s)?`,
        mensagem: acao === "excluir" ? "Os usuários e todos os seus dados serão apagados permanentemente." : "A ação será aplicada a todos os usuários selecionados.",
        textoConfirmar: "Confirmar", perigo: perigosa, pedirMotivo: ["bloquear", "rejeitar"].includes(acao)
    });
    if (!resposta) return;
    try {
        const resultado = await api.post("/admin/usuarios/lote", { ids: [...estado.selecionados], acao, motivo: resposta.motivo || null });
        toast(resultado.mensagem);
        estado.selecionados.clear();
        desenharBarraLote();
        await carregar();
        contexto.app.atualizarPendentes();
    } catch (erro) {
        toastErro(erro);
    }
}

async function carregar() {
    const consulta = new URLSearchParams({ status: estado.status, pagina: estado.pagina, limite: 15 });
    if (estado.busca) consulta.set("busca", estado.busca);
    if (estado.ordem) consulta.set("ordem", estado.ordem);
    const resposta = await api.get(`/admin/usuarios?${consulta}`);
    if (!contexto.ativa()) return;

    const contagem = resposta.contagem_status;
    const total = Object.values(contagem).reduce((soma, valor) => soma + valor, 0);
    $$("[data-status]").forEach((aba) => {
        const chave = aba.dataset.status;
        aba.setAttribute("aria-selected", String(chave === estado.status));
        $(".aba__contador", aba).textContent = String(chave === "todos" ? total : contagem[chave] || 0);
    });
    desenharTabela(resposta);
}

export async function montar(alvo, ctx) {
    contexto = ctx;
    estado.status = STATUS.some(([chave]) => chave === ctx.consulta.get("status")) ? ctx.consulta.get("status") : "todos";
    estado.pagina = 1;
    estado.busca = "";
    estado.selecionados.clear();

    renderizar(alvo, html`
        ${cabecalhoPagina({
            titulo: "Usuários",
            descricao: "Aprove novos cadastros, controle o acesso e gerencie os alunos da plataforma.",
            acoes: html`
                <a class="btn" href="${API}/admin/usuarios/exportar" download>${icone("baixar", 16)} Exportar CSV</a>
                <button class="btn btn--primario" id="novo-usuario">${icone("usuario-mais", 16)} Novo aluno</button>`
        })}
        <div class="abas espaco-abaixo" role="tablist">
            ${STATUS.map(([chave, rotulo]) => html`<button class="aba" role="tab" data-status="${chave}" aria-selected="${chave === estado.status}">${rotulo} <span class="aba__contador">0</span></button>`)}
        </div>
        <div class="barra-ferramentas espaco-topo">
            <label class="entrada-icone">
                ${icone("busca", 17)}
                <input class="entrada" type="search" id="busca-usuarios" placeholder="Buscar por nome ou e-mail..." aria-label="Buscar usuários">
            </label>
            <select class="selecao" id="ordem-usuarios" aria-label="Ordenar">
                <option value="">Mais recentes</option>
                <option value="antigos">Mais antigos</option>
                <option value="nome">Nome (A–Z)</option>
                <option value="ultimo_login">Último acesso</option>
            </select>
        </div>
        <div class="barra-lote" id="barra-lote" hidden></div>
        <div id="area-usuarios"><div class="carregando-pagina"><span class="spinner"></span></div></div>`);

    $("#novo-usuario").addEventListener("click", () => formularioUsuario());
    $$("[data-status]").forEach((aba) => aba.addEventListener("click", () => {
        estado.status = aba.dataset.status;
        estado.pagina = 1;
        history.replaceState(null, "", `#/usuarios${estado.status === "todos" ? "" : `?status=${estado.status}`}`);
        carregar();
    }));
    $("#busca-usuarios").addEventListener("input", debounce((evento) => {
        estado.busca = evento.target.value.trim();
        estado.pagina = 1;
        carregar();
    }, 300));
    $("#ordem-usuarios").addEventListener("change", (evento) => {
        estado.ordem = evento.target.value;
        carregar();
    });
    $("#barra-lote").addEventListener("click", (evento) => {
        const botao = evento.target.closest("[data-lote]");
        if (botao) acaoEmLote(botao.dataset.lote);
    });

    const area = $("#area-usuarios");
    area.addEventListener("change", (evento) => {
        if (evento.target.id === "marcar-todos") {
            estado.dados.filter((u) => !u.admin_fixo).forEach((u) => (evento.target.checked ? estado.selecionados.add(u.id) : estado.selecionados.delete(u.id)));
            $$("[data-selecionar]", area).forEach((caixa) => {
                caixa.checked = evento.target.checked;
                caixa.closest("tr").setAttribute("aria-selected", String(evento.target.checked));
            });
        } else if (evento.target.dataset.selecionar) {
            const id = Number(evento.target.dataset.selecionar);
            evento.target.checked ? estado.selecionados.add(id) : estado.selecionados.delete(id);
            evento.target.closest("tr").setAttribute("aria-selected", String(evento.target.checked));
        }
        desenharBarraLote();
    });
    area.addEventListener("click", (evento) => {
        const detalhe = evento.target.closest("[data-detalhes]");
        if (detalhe) return detalhes(Number(detalhe.dataset.detalhes));

        const rapido = evento.target.closest("[data-rapido]");
        if (rapido) {
            const usuario = estado.dados.find((u) => u.id === Number(rapido.dataset.id));
            const status = { aprovar: "ativo", rejeitar: "rejeitado", bloquear: "bloqueado" }[rapido.dataset.rapido];
            return alterarStatus(usuario, status);
        }

        const mais = evento.target.closest("[data-mais]");
        if (mais) {
            const u = estado.dados.find((item) => item.id === Number(mais.dataset.mais));
            abrirMenuContexto(mais, [
                { rotulo: "Ver detalhes", icone: "olho", acao: () => detalhes(u.id) },
                !u.admin_fixo && { rotulo: "Editar dados", icone: "editar", acao: () => formularioUsuario(u) },
                !u.admin_fixo && { rotulo: "Redefinir senha", icone: "chave", acao: () => redefinirSenha(u) },
                !u.admin_fixo && u.sessoes_ativas > 0 && { rotulo: "Encerrar sessões", icone: "sair", acao: () => encerrarSessoes(u) },
                !u.admin_fixo && u.status === "ativo" && { rotulo: "Bloquear acesso", icone: "bloquear", acao: () => alterarStatus(u, "bloqueado") },
                !u.admin_fixo && u.status !== "ativo" && { rotulo: u.status === "pendente" ? "Aprovar" : "Reativar", icone: "check", acao: () => alterarStatus(u, "ativo") },
                !u.admin_fixo && "-",
                !u.admin_fixo && { rotulo: "Excluir usuário", icone: "lixeira", perigo: true, acao: () => excluir(u) }
            ]);
        }
    });

    await carregar();
}
