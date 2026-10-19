// Área do aluno: resumo, "continuar assistindo", meus cursos, catálogo, certificados,
// anotações e perfil (dados, foto, senha e sessões ativas).
import { api } from "../api.js";
import {
    html, renderizar, $, $$, toast, toastErro, comCarregamento, confirmar, duracao, numero,
    dataHora, data, tempoRelativo
} from "../ui.js";
import { icone } from "../icones.js";
import { montarLayout, exigirSessao, definirTitulo, avatar } from "../layout.js";
import { capaCurso, cartaoCurso, cartaoCursoAluno, esqueletoCartoes, estadoVazio } from "../componentes.js";

let usuario;
const ABAS = [
    ["cursos", "Meus cursos", "livro"],
    ["explorar", "Explorar", "busca"],
    ["certificados", "Certificados", "medalha"],
    ["anotacoes", "Anotações", "caneta"],
    ["perfil", "Perfil e segurança", "escudo"]
];

function saudacao() {
    const hora = new Date().getHours();
    if (hora < 12) return "Bom dia";
    if (hora < 18) return "Boa tarde";
    return "Boa noite";
}

function indicador(nomeIcone, cor, valor, rotulo) {
    return html`
        <div class="indicador">
            <span class="indicador__icone" data-cor="${cor}">${icone(nomeIcone, 22)}</span>
            <div><strong>${valor}</strong><span>${rotulo}</span></div>
        </div>`;
}

async function montarResumo() {
    const [resumo, cursos] = await Promise.all([api.get("/aluno/painel"), api.get("/aluno/cursos")]);
    renderizar($("#indicadores"), html`
        ${indicador("play-circulo", "#7c5cff", numero(resumo.cursos_em_andamento), "Cursos em andamento")}
        ${indicador("check-circulo", "#22c55e", numero(resumo.aulas_concluidas), "Aulas concluídas")}
        ${indicador("relogio", "#22d3ee", duracao(resumo.segundos_estudados), "Tempo de estudo")}
        ${indicador("medalha", "#f59e0b", numero(resumo.certificados), "Certificados")}`);

    const emAndamento = cursos.find((curso) => curso.percentual < 100) || cursos[0];
    if (emAndamento) {
        const destino = emAndamento.ultima_aula_id
            ? `assistir.html?curso=${emAndamento.id}&aula=${emAndamento.ultima_aula_id}`
            : `assistir.html?curso=${emAndamento.id}`;
        renderizar($("#continuar"), html`
            <div class="continuar">
                ${capaCurso(emAndamento)}
                <div>
                    <span class="secao__rotulo">${icone("play", 12)} Continue de onde parou</span>
                    <h2>${emAndamento.titulo}</h2>
                    <p class="continuar__aula">${icone("relogio", 15)} ${emAndamento.ultima_aula_titulo ? `Última aula: ${emAndamento.ultima_aula_titulo}` : "Comece pela primeira aula"} · acessado ${tempoRelativo(emAndamento.ultimo_acesso)}</p>
                    <div class="progresso"><div class="progresso__barra" data-largura="${emAndamento.percentual}"></div></div>
                    <p class="pequeno mudo espaco-topo">${emAndamento.percentual}% concluído · ${emAndamento.aulas_concluidas} de ${emAndamento.total_aulas} aulas</p>
                </div>
                <a class="btn btn--primario btn--lg" href="${destino}">${icone("play", 17)} Continuar</a>
            </div>`);
    }
    return cursos;
}

// ---------------------------------------------------------------------------
// Abas
// ---------------------------------------------------------------------------
async function abaCursos(alvo) {
    renderizar(alvo, html`<div class="grade-cursos">${esqueletoCartoes(3)}</div>`);
    const cursos = await api.get("/aluno/cursos");
    if (cursos.length === 0) {
        renderizar(alvo, estadoVazio({
            icone: "livro", titulo: "Você ainda não começou nenhum curso",
            texto: "Explore o catálogo e escolha o primeiro curso da sua trilha.",
            acao: html`<a class="btn btn--primario" href="#explorar">${icone("busca", 16)} Explorar cursos</a>`
        }));
        return;
    }
    renderizar(alvo, html`<div class="grade-cursos">${cursos.map(cartaoCursoAluno)}</div>`);
}

async function abaExplorar(alvo) {
    renderizar(alvo, html`<div class="grade-cursos">${esqueletoCartoes(3)}</div>`);
    const [todos, meus] = await Promise.all([api.get("/publico/cursos"), api.get("/aluno/cursos")]);
    const matriculados = new Set(meus.map((curso) => curso.id));
    const disponiveis = todos.filter((curso) => !matriculados.has(curso.id));
    if (disponiveis.length === 0) {
        renderizar(alvo, estadoVazio({ icone: "brilho", titulo: "Você já está em todos os cursos!", texto: "Novos cursos aparecerão aqui assim que forem publicados." }));
        return;
    }
    renderizar(alvo, html`<div class="grade-cursos">${disponiveis.map(cartaoCurso)}</div>`);
}

async function abaCertificados(alvo) {
    const certificados = await api.get("/aluno/certificados");
    if (certificados.length === 0) {
        renderizar(alvo, estadoVazio({
            icone: "medalha", titulo: "Nenhum certificado ainda",
            texto: "Conclua 100% das aulas de um curso para emitir o seu certificado com código de verificação."
        }));
        return;
    }
    renderizar(alvo, html`
        <div class="lista-certificados">
            ${certificados.map((c) => html`
                <article class="cartao-certificado">
                    <span class="cartao-certificado__icone">${icone("medalha", 26)}</span>
                    <div class="pilha">
                        <div>
                            <h3>${c.titulo_curso}</h3>
                            <span class="pequeno mudo">${c.carga_horaria}h · emitido em ${data(c.emitido_em)}</span><br>
                            <code>${c.codigo}</code>
                        </div>
                        <div class="linha">
                            <a class="btn btn--sm btn--primario" href="certificado.html?codigo=${c.codigo}">${icone("olho", 15)} Visualizar</a>
                            <a class="btn btn--sm" href="verificar.html?codigo=${c.codigo}">${icone("escudo", 15)} Validar</a>
                        </div>
                    </div>
                </article>`)}
        </div>`);
}

async function abaAnotacoes(alvo) {
    const anotacoes = await api.get("/aluno/anotacoes");
    if (anotacoes.length === 0) {
        renderizar(alvo, estadoVazio({ icone: "caneta", titulo: "Sem anotações", texto: "Durante as aulas, use a aba “Anotações” para registrar o que for importante." }));
        return;
    }
    renderizar(alvo, html`
        <div class="pilha">
            ${anotacoes.map((a) => html`
                <article class="anotacao-item">
                    <div class="linha-entre">
                        <div>
                            <strong>${a.aula_titulo}</strong>
                            <div class="pequeno mudo">${a.curso_titulo} · atualizado ${tempoRelativo(a.atualizado_em)}</div>
                        </div>
                        <a class="btn btn--sm" href="assistir.html?curso=${a.curso_id}&aula=${a.aula_id}">${icone("play", 14)} Abrir aula</a>
                    </div>
                    <p>${a.texto}</p>
                </article>`)}
        </div>`);
}

function descreverDispositivo(agente = "") {
    const sistema = /Windows/i.test(agente) ? "Windows" : /Android/i.test(agente) ? "Android" : /iPhone|iPad/i.test(agente) ? "iOS"
        : /Mac OS/i.test(agente) ? "macOS" : /Linux/i.test(agente) ? "Linux" : "Dispositivo";
    const navegador = /Edg\//.test(agente) ? "Edge" : /OPR\//.test(agente) ? "Opera" : /Chrome\//.test(agente) ? "Chrome"
        : /Firefox\//.test(agente) ? "Firefox" : /Safari\//.test(agente) ? "Safari" : "Navegador";
    return { texto: `${navegador} no ${sistema}`, movel: /Android|iPhone|iPad|Mobile/i.test(agente) };
}

async function abaPerfil(alvo) {
    renderizar(alvo, html`
        <div class="perfil-grade">
            <div class="cartao perfil-cartao">
                <div id="avatar-perfil">${avatar(usuario, "avatar--xl")}</div>
                <h3>${usuario.nome}</h3>
                <p class="pequeno">${usuario.email}</p>
                <p class="pequeno mudo">Aluno desde ${data(usuario.criado_em)}</p>
                <div class="pilha espaco-topo">
                    <label class="btn btn--bloco">
                        ${icone("imagem", 16)} Alterar foto
                        <input type="file" id="arquivo-avatar" accept="image/png,image/jpeg,image/webp,image/gif" hidden>
                    </label>
                    ${usuario.avatar ? html`<button class="btn btn--fantasma btn--bloco" id="remover-avatar">Remover foto</button>` : ""}
                </div>
            </div>
            <div class="pilha">
                <form class="cartao" id="form-perfil">
                    <div class="cartao__cabecalho"><h3 class="cartao__titulo">${icone("usuario", 18)} Dados pessoais</h3></div>
                    <div class="cartao__corpo pilha">
                        <div class="grade-2">
                            <div class="campo"><label for="perfil-nome">Nome</label><input class="entrada" id="perfil-nome" value="${usuario.nome}" maxlength="120" required></div>
                            <div class="campo"><label for="perfil-email">E-mail</label><input class="entrada" id="perfil-email" value="${usuario.email}" disabled><small>Para alterar o e-mail, fale com o administrador.</small></div>
                        </div>
                        <div class="campo"><label for="perfil-bio">Sobre você</label><textarea class="area-texto" id="perfil-bio" maxlength="500" rows="3" placeholder="Conte um pouco sobre seus objetivos">${usuario.bio || ""}</textarea></div>
                        <div><button class="btn btn--primario" type="submit">${icone("salvar", 16)} Salvar dados</button></div>
                    </div>
                </form>
                <form class="cartao" id="form-senha">
                    <div class="cartao__cabecalho"><h3 class="cartao__titulo">${icone("chave", 18)} Alterar senha</h3></div>
                    <div class="cartao__corpo pilha">
                        <div class="campo"><label for="senha-atual">Senha atual</label><input class="entrada" type="password" id="senha-atual" autocomplete="current-password" required></div>
                        <div class="grade-2">
                            <div class="campo"><label for="senha-nova">Nova senha</label><input class="entrada" type="password" id="senha-nova" autocomplete="new-password" minlength="8" maxlength="72" required></div>
                            <div class="campo"><label for="senha-confirmar">Confirmar nova senha</label><input class="entrada" type="password" id="senha-confirmar" autocomplete="new-password" required></div>
                        </div>
                        <small class="ajuda">Ao alterar a senha, todas as outras sessões abertas serão encerradas.</small>
                        <div><button class="btn btn--primario" type="submit">${icone("cadeado", 16)} Alterar senha</button></div>
                    </div>
                </form>
                <section class="cartao">
                    <div class="cartao__cabecalho">
                        <h3 class="cartao__titulo">${icone("monitor", 18)} Sessões ativas</h3>
                        <button class="btn btn--sm btn--perigo" id="encerrar-outras">Encerrar outras sessões</button>
                    </div>
                    <div class="cartao__corpo" id="lista-sessoes"><span class="spinner"></span></div>
                </section>
            </div>
        </div>`);

    $("#form-perfil").addEventListener("submit", (evento) => {
        evento.preventDefault();
        comCarregamento(evento.submitter, async () => {
            try {
                const resposta = await api.put("/auth/me", { nome: $("#perfil-nome").value.trim(), bio: $("#perfil-bio").value.trim() });
                usuario = { ...usuario, ...resposta.usuario };
                toast(resposta.mensagem);
            } catch (erro) {
                toastErro(erro);
            }
        });
    });

    $("#form-senha").addEventListener("submit", (evento) => {
        evento.preventDefault();
        const nova = $("#senha-nova").value;
        if (nova !== $("#senha-confirmar").value) return toast("A confirmação não confere com a nova senha.", "erro");
        comCarregamento(evento.submitter, async () => {
            try {
                const resposta = await api.put("/auth/me/senha", { senha_atual: $("#senha-atual").value, nova_senha: nova });
                evento.target.reset();
                toast(resposta.mensagem);
                carregarSessoes();
            } catch (erro) {
                toastErro(erro);
            }
        });
    });

    $("#arquivo-avatar").addEventListener("change", async (evento) => {
        const arquivo = evento.target.files[0];
        if (!arquivo) return;
        if (arquivo.size > 5 * 1024 * 1024) return toast("A imagem deve ter no máximo 5 MB.", "erro");
        const formulario = new FormData();
        formulario.append("avatar", arquivo);
        try {
            const resposta = await api.enviar("/auth/me/avatar", formulario);
            usuario.avatar = resposta.avatar;
            toast(resposta.mensagem);
            abaPerfil(alvo);
            await montarLayout({ usuario });
        } catch (erro) {
            toastErro(erro);
        }
    });

    $("#remover-avatar")?.addEventListener("click", async () => {
        try {
            await api.delete("/auth/me/avatar");
            usuario.avatar = null;
            toast("Foto removida.");
            abaPerfil(alvo);
        } catch (erro) {
            toastErro(erro);
        }
    });

    $("#encerrar-outras").addEventListener("click", async () => {
        const ok = await confirmar({ titulo: "Encerrar outras sessões?", mensagem: "Todos os outros dispositivos conectados à sua conta serão desconectados.", textoConfirmar: "Encerrar", perigo: true });
        if (!ok) return;
        try {
            const resposta = await api.delete("/auth/me/sessoes");
            toast(resposta.mensagem);
            carregarSessoes();
        } catch (erro) {
            toastErro(erro);
        }
    });

    async function carregarSessoes() {
        const sessoes = await api.get("/auth/me/sessoes");
        renderizar($("#lista-sessoes"), html`${sessoes.map((sessao) => {
            const dispositivo = descreverDispositivo(sessao.user_agent);
            return html`
                <div class="sessao-item">
                    <span class="sessao-item__icone">${icone(dispositivo.movel ? "celular" : "monitor", 19)}</span>
                    <div>
                        <strong>${dispositivo.texto} ${sessao.atual ? html`<span class="selo selo--sucesso">Esta sessão</span>` : ""}</strong>
                        <span>IP ${sessao.ip || "—"} · iniciada em ${dataHora(sessao.criado_em)} · ativa ${tempoRelativo(sessao.ultimo_acesso)}</span>
                    </div>
                    ${sessao.atual ? "" : html`<button class="btn btn--sm btn--fantasma" data-encerrar="${sessao.id}">Encerrar</button>`}
                </div>`;
        })}`);
        $$("[data-encerrar]", $("#lista-sessoes")).forEach((botao) => botao.addEventListener("click", async () => {
            try {
                await api.delete(`/auth/me/sessoes/${botao.dataset.encerrar}`);
                toast("Sessão encerrada.");
                carregarSessoes();
            } catch (erro) {
                toastErro(erro);
            }
        }));
    }
    carregarSessoes();
}

const RENDERIZADORES = { cursos: abaCursos, explorar: abaExplorar, certificados: abaCertificados, anotacoes: abaAnotacoes, perfil: abaPerfil };

async function mostrarAba() {
    const nome = RENDERIZADORES[location.hash.slice(1)] ? location.hash.slice(1) : "cursos";
    $$("[data-aba]").forEach((aba) => aba.setAttribute("aria-selected", String(aba.dataset.aba === nome)));
    const alvo = $("#conteudo-aba");
    try {
        await RENDERIZADORES[nome](alvo);
    } catch (erro) {
        renderizar(alvo, estadoVazio({ icone: "aviso", titulo: "Não foi possível carregar", texto: erro.message }));
    }
}

async function iniciar() {
    usuario = await exigirSessao({ papel: "aluno" });
    await montarLayout({ usuario });
    definirTitulo("Meu painel");

    renderizar($("#painel"), html`
        <div class="boas-vindas">
            <div>
                <h1>${saudacao()}, ${usuario.nome.split(" ")[0]}!</h1>
                <p>Que bom ter você aqui. Bora continuar aprendendo?</p>
            </div>
            <a class="btn" href="#explorar">${icone("busca", 16)} Explorar cursos</a>
        </div>
        <div class="indicadores" id="indicadores">
            ${Array.from({ length: 4 }, () => html`<div class="esqueleto"></div>`)}
        </div>
        <div id="continuar"></div>
        <div class="abas" role="tablist">
            ${ABAS.map(([id, rotulo, nomeIcone]) => html`
                <a class="aba" role="tab" href="#${id}" data-aba="${id}" aria-selected="false">${icone(nomeIcone, 16)} ${rotulo}</a>`)}
        </div>
        <section class="secao-painel" id="conteudo-aba"></section>`);

    $$("#indicadores .esqueleto").forEach((el) => (el.style.height = "88px"));
    window.addEventListener("hashchange", mostrarAba);
    await Promise.all([montarResumo().catch(toastErro), mostrarAba()]);
}

iniciar();
