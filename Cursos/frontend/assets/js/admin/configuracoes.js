// Configurações do site: identidade visual (nome, logo, ícone, cor), página inicial,
// rodapé e redes sociais, controles de acesso, aviso global e certificados.
import { api, enviarComProgresso, urlArquivo } from "../api.js";
import { html, renderizar, $, $$, toast, toastErro, confirmar, comCarregamento } from "../ui.js";
import { icone } from "../icones.js";
import { marca } from "../layout.js";
import { cabecalhoPagina, interruptor } from "./comum.js";

const SECOES = [
    ["identidade", "Identidade visual", "paleta"],
    ["inicio", "Página inicial", "inicio"],
    ["rodape", "Rodapé e contato", "layout"],
    ["acesso", "Acesso e avisos", "escudo"],
    ["certificados", "Certificados", "medalha"]
];
const CORES = ["#7c5cff", "#6366f1", "#3b82f6", "#0ea5e9", "#10b981", "#f59e0b", "#f43f5e", "#ec4899"];
const REDES = [["instagram", "Instagram", "instagram"], ["youtube", "YouTube", "youtube"], ["linkedin", "LinkedIn", "linkedin"], ["github", "GitHub", "github"], ["x", "X (Twitter)", "x-rede"], ["facebook", "Facebook", "facebook"], ["tiktok", "TikTok", "tiktok"], ["whatsapp", "WhatsApp (link wa.me)", "whatsapp"]];
const CAMPOS_TEXTO = ["nome_site", "slogan", "hero_titulo", "hero_subtitulo", "rodape_texto", "email_contato", "aviso_global", "certificado_assinatura"];

let contexto;
let original;
let rascunho;

const clonar = (valor) => JSON.parse(JSON.stringify(valor));

function marcarAlterado() {
    const alterado = JSON.stringify(rascunho) !== JSON.stringify(original);
    $("#barra-salvar").hidden = !alterado;
}

function previaMarca() {
    renderizar($("#previas-marca"), html`
        <div class="marca-previa marca-previa--escura"><span class="marca">${marca(rascunho)}</span></div>
        <div class="marca-previa marca-previa--clara"><span class="marca">${marca(rascunho)}</span></div>`);
}

function previaAviso() {
    const alvo = $("#previa-aviso");
    if (!rascunho.aviso_global) {
        alvo.innerHTML = "";
        return;
    }
    renderizar(alvo, html`<div class="previa-aviso"><div class="aviso-global aviso-global--${rascunho.aviso_tipo}">${icone(["alerta", "perigo"].includes(rascunho.aviso_tipo) ? "aviso" : "info", 16)}${rascunho.aviso_global}</div></div>`);
}

function desenharLinks() {
    renderizar($("#lista-links"), html`${rascunho.rodape_links.map((link, indice) => html`
        <div class="link-editavel">
            <input class="entrada" data-link="${indice}" data-campo="rotulo" maxlength="40" value="${link.rotulo}" placeholder="Texto do link" aria-label="Texto do link ${indice + 1}">
            <input class="entrada" data-link="${indice}" data-campo="url" maxlength="500" value="${link.url}" placeholder="/pagina.html ou https://..." aria-label="Endereço do link ${indice + 1}">
            <div class="linha">
                <button type="button" class="btn btn--sm btn--fantasma btn--icone" data-subir-link="${indice}" ${indice === 0 ? "disabled" : ""} aria-label="Subir">${icone("seta-cima", 15)}</button>
                <button type="button" class="btn btn--sm btn--fantasma btn--icone" data-remover-link="${indice}" aria-label="Remover link">${icone("lixeira", 15)}</button>
            </div>
        </div>`)}`);
}

function secaoIdentidade() {
    return html`
        <section class="cartao" data-secao="identidade">
            <div class="cartao__cabecalho"><h2 class="cartao__titulo">${icone("paleta", 18)} Identidade visual</h2></div>
            <div class="cartao__corpo">
                <div class="grade-2">
                    <div class="campo"><label for="cfg-nome_site">Nome da plataforma</label><input class="entrada" id="cfg-nome_site" data-texto="nome_site" maxlength="60"></div>
                    <div class="campo"><label for="cfg-slogan">Slogan</label><input class="entrada" id="cfg-slogan" data-texto="slogan" maxlength="120"></div>
                </div>
                <div class="campo">
                    <span class="rotulo">Logo</span>
                    <div class="marca-previas" id="previas-marca"></div>
                    <div class="linha">
                        <label class="btn">${icone("enviar", 16)} Enviar logo<input type="file" id="arquivo-logo" accept="image/png,image/jpeg,image/webp,image/gif" hidden></label>
                        ${original.logo ? html`<button class="btn btn--fantasma" id="remover-logo">${icone("lixeira", 16)} Remover logo</button>` : ""}
                    </div>
                    <small>PNG com fundo transparente (até 5 MB). Sem imagem enviada, usamos a logo Lumina integrada + nome da plataforma.</small>
                </div>
                <div class="campo">
                    <span class="rotulo">Ícone da aba (favicon)</span>
                    <div class="linha">
                        <span class="avatar avatar--lg" id="previa-favicon"><img src="${original.favicon ? urlArquivo(original.favicon) : "assets/img/favicon.svg"}" alt="Favicon atual"></span>
                        <label class="btn">${icone("enviar", 16)} Enviar ícone<input type="file" id="arquivo-favicon" accept="image/png,image/x-icon,image/vnd.microsoft.icon,image/webp" hidden></label>
                        ${original.favicon ? html`<button class="btn btn--fantasma" id="remover-favicon">${icone("lixeira", 16)} Usar padrão</button>` : ""}
                    </div>
                    <small>PNG ou ICO quadrado (ex.: 64×64), até 1 MB.</small>
                </div>
                <div class="campo">
                    <label for="cfg-cor">Cor principal</label>
                    <div class="cores-predefinidas">
                        <input type="color" class="entrada" id="cfg-cor">
                        ${CORES.map((cor) => html`<button type="button" class="amostra-cor" data-cor="${cor}" data-amostra="${cor}" aria-label="Usar a cor ${cor}"></button>`)}
                    </div>
                    <small>A cor é aplicada em todo o site (botões, destaques e gradientes). A prévia é imediata neste painel.</small>
                </div>
            </div>
        </section>`;
}

function secaoInicio() {
    return html`
        <section class="cartao" data-secao="inicio" hidden>
            <div class="cartao__cabecalho"><h2 class="cartao__titulo">${icone("inicio", 18)} Página inicial</h2><a class="btn btn--sm" href="index.html" target="_blank" rel="noopener">${icone("externo", 14)} Ver página</a></div>
            <div class="cartao__corpo">
                <div class="campo"><label for="cfg-hero_titulo">Título principal (hero)</label><input class="entrada" id="cfg-hero_titulo" data-texto="hero_titulo" maxlength="120"><small>As duas últimas palavras recebem o destaque em gradiente.</small></div>
                <div class="campo"><label for="cfg-hero_subtitulo">Subtítulo</label><textarea class="area-texto" id="cfg-hero_subtitulo" data-texto="hero_subtitulo" maxlength="300" rows="3"></textarea></div>
            </div>
        </section>`;
}

function secaoRodape() {
    return html`
        <section class="cartao" data-secao="rodape" hidden>
            <div class="cartao__cabecalho"><h2 class="cartao__titulo">${icone("layout", 18)} Rodapé e contato</h2></div>
            <div class="cartao__corpo">
                <div class="campo"><label for="cfg-rodape_texto">Texto do rodapé</label><textarea class="area-texto" id="cfg-rodape_texto" data-texto="rodape_texto" maxlength="400" rows="3"></textarea></div>
                <div class="campo"><label for="cfg-email_contato">E-mail de contato</label><input class="entrada" type="email" id="cfg-email_contato" data-texto="email_contato" maxlength="190"></div>
                <div class="campo">
                    <span class="rotulo">Links do rodapé (até 12)</span>
                    <div id="lista-links"></div>
                    <div><button type="button" class="btn btn--sm" id="adicionar-link">${icone("mais", 15)} Adicionar link</button></div>
                    <small>Use links internos começando com "/" (ex.: /verificar.html) ou endereços completos com https://.</small>
                </div>
                <div class="campo">
                    <span class="rotulo">Redes sociais</span>
                    <div class="redes-grade">
                        ${REDES.map(([chave, rotulo, nomeIcone]) => html`
                            <label class="entrada-icone">${icone(nomeIcone, 17)}<input class="entrada" data-rede="${chave}" placeholder="${rotulo}: https://..." maxlength="500" aria-label="${rotulo}"></label>`)}
                    </div>
                    <small>Deixe em branco para esconder o ícone da rede.</small>
                </div>
            </div>
        </section>`;
}

function secaoAcesso() {
    return html`
        <section class="cartao" data-secao="acesso" hidden>
            <div class="cartao__cabecalho"><h2 class="cartao__titulo">${icone("escudo", 18)} Acesso e avisos</h2></div>
            <div class="cartao__corpo">
                <div class="alerta alerta--info">${icone("info", 18)}<div><strong>Aprovação obrigatória</strong><p>Todo novo cadastro nasce como "pendente" e só consegue entrar depois que você aprovar em Usuários.</p></div></div>
                <div class="controle-acesso">
                    <div><strong>Permitir novos cadastros</strong><p>Desligado: a página de cadastro fica fechada e a API recusa novos registros.</p></div>
                    ${interruptor({ id: "cfg-registros", marcado: original.registros_abertos })}
                </div>
                <div class="controle-acesso">
                    <div><strong>Permitir login de alunos</strong><p>Desligado: todos os alunos são desconectados na hora e ninguém entra (o administrador continua com acesso).</p></div>
                    ${interruptor({ id: "cfg-login", marcado: original.login_alunos })}
                </div>
                <div class="campo">
                    <label for="cfg-aviso_global">Aviso no topo do site</label>
                    <input class="entrada" id="cfg-aviso_global" data-texto="aviso_global" maxlength="240" placeholder="Ex.: Novas turmas abertas! Inscrições até sexta.">
                    <div class="linha espaco-topo">
                        <select class="selecao" id="cfg-aviso_tipo" aria-label="Estilo do aviso">
                            <option value="info">Informativo (azul)</option><option value="sucesso">Sucesso (verde)</option>
                            <option value="alerta">Atenção (amarelo)</option><option value="perigo">Urgente (vermelho)</option>
                        </select>
                    </div>
                    <div id="previa-aviso"></div>
                    <small>Deixe vazio para não exibir nenhum aviso.</small>
                </div>
            </div>
        </section>`;
}

function secaoCertificados() {
    return html`
        <section class="cartao" data-secao="certificados" hidden>
            <div class="cartao__cabecalho"><h2 class="cartao__titulo">${icone("medalha", 18)} Certificados</h2></div>
            <div class="cartao__corpo">
                <div class="campo"><label for="cfg-certificado_assinatura">Assinatura / responsável</label><input class="entrada" id="cfg-certificado_assinatura" data-texto="certificado_assinatura" maxlength="80"><small>Aparece abaixo da linha de assinatura no certificado.</small></div>
                <p class="mudo pequeno">O certificado usa automaticamente o nome, o logo e a cor principal da plataforma. Cada certificado recebe um código único verificável na página pública "Verificar certificado".</p>
            </div>
        </section>`;
}

async function enviarImagem(chave, arquivo) {
    const formulario = new FormData();
    formulario.append("arquivo", arquivo);
    try {
        const resposta = await enviarComProgresso(`/admin/configuracoes/${chave}`, formulario);
        toast(resposta.mensagem);
        await contexto.app.recarregarIdentidade();
        await contexto.app.recarregarTela();
    } catch (erro) {
        toastErro(erro);
    }
}

async function removerImagem(chave) {
    try {
        toast((await api.delete(`/admin/configuracoes/${chave}`)).mensagem);
        await contexto.app.recarregarIdentidade();
        await contexto.app.recarregarTela();
    } catch (erro) {
        toastErro(erro);
    }
}

export async function montar(alvo, ctx) {
    contexto = ctx;
    original = await api.get("/admin/configuracoes");
    rascunho = clonar(original);
    if (!ctx.ativa()) return;

    renderizar(alvo, html`
        ${cabecalhoPagina({ titulo: "Configurações do site", descricao: "Personalize a identidade da plataforma e controle o acesso dos alunos. As mudanças valem para todo o site." })}
        <div class="config-grade">
            <nav class="config-menu" role="tablist">
                ${SECOES.map(([id, rotulo, nomeIcone], indice) => html`<button role="tab" data-ir-secao="${id}" aria-selected="${indice === 0}">${icone(nomeIcone, 17)} ${rotulo}</button>`)}
            </nav>
            <div class="config-secao">
                ${secaoIdentidade()}${secaoInicio()}${secaoRodape()}${secaoAcesso()}${secaoCertificados()}
                <div class="barra-salvar" id="barra-salvar" hidden>
                    <span>${icone("info", 17)} Você tem alterações não salvas.</span>
                    <button class="btn btn--fantasma" id="descartar">Descartar</button>
                    <button class="btn btn--primario" id="salvar-config">${icone("salvar", 16)} Salvar alterações</button>
                </div>
            </div>
        </div>`);

    // Preenche os campos com os valores atuais
    CAMPOS_TEXTO.forEach((chave) => {
        const campo = $(`[data-texto="${chave}"]`, alvo);
        if (campo) campo.value = rascunho[chave] || "";
    });
    $("#cfg-cor", alvo).value = rascunho.cor_primaria;
    $("#cfg-aviso_tipo", alvo).value = rascunho.aviso_tipo;
    $$("[data-rede]", alvo).forEach((campo) => (campo.value = rascunho.redes_sociais?.[campo.dataset.rede] || ""));
    previaMarca();
    previaAviso();
    desenharLinks();

    // Navegação entre seções
    $$("[data-ir-secao]", alvo).forEach((botao) => botao.addEventListener("click", () => {
        $$("[data-ir-secao]", alvo).forEach((outro) => outro.setAttribute("aria-selected", String(outro === botao)));
        $$("[data-secao]", alvo).forEach((secao) => (secao.hidden = secao.dataset.secao !== botao.dataset.irSecao));
    }));

    // Campos de texto, redes e links
    alvo.addEventListener("input", (evento) => {
        const campo = evento.target;
        if (campo.dataset.texto) {
            rascunho[campo.dataset.texto] = campo.value;
            if (campo.dataset.texto === "nome_site") previaMarca();
            if (campo.dataset.texto === "aviso_global") previaAviso();
        } else if (campo.dataset.rede) {
            rascunho.redes_sociais = { ...rascunho.redes_sociais, [campo.dataset.rede]: campo.value.trim() };
            if (!campo.value.trim()) delete rascunho.redes_sociais[campo.dataset.rede];
        } else if (campo.dataset.link !== undefined) {
            rascunho.rodape_links[Number(campo.dataset.link)][campo.dataset.campo] = campo.value;
        } else if (campo.id === "cfg-cor") {
            rascunho.cor_primaria = campo.value;
            document.documentElement.style.setProperty("--primaria", campo.value);
        } else {
            return;
        }
        marcarAlterado();
    });
    $("#cfg-aviso_tipo", alvo).addEventListener("change", (evento) => {
        rascunho.aviso_tipo = evento.target.value;
        previaAviso();
        marcarAlterado();
    });

    alvo.addEventListener("click", (evento) => {
        const amostra = evento.target.closest("[data-amostra]");
        if (amostra) {
            rascunho.cor_primaria = amostra.dataset.amostra;
            $("#cfg-cor", alvo).value = amostra.dataset.amostra;
            document.documentElement.style.setProperty("--primaria", amostra.dataset.amostra);
            marcarAlterado();
        }
        if (evento.target.closest("#adicionar-link")) {
            if (rascunho.rodape_links.length >= 12) return toast("Máximo de 12 links.", "alerta");
            rascunho.rodape_links.push({ rotulo: "", url: "" });
            desenharLinks();
            marcarAlterado();
        }
        const remover = evento.target.closest("[data-remover-link]");
        if (remover) {
            rascunho.rodape_links.splice(Number(remover.dataset.removerLink), 1);
            desenharLinks();
            marcarAlterado();
        }
        const subir = evento.target.closest("[data-subir-link]");
        if (subir) {
            const i = Number(subir.dataset.subirLink);
            [rascunho.rodape_links[i - 1], rascunho.rodape_links[i]] = [rascunho.rodape_links[i], rascunho.rodape_links[i - 1]];
            desenharLinks();
            marcarAlterado();
        }
    });

    // Controles de acesso: salvam na hora
    $("#cfg-registros", alvo).addEventListener("change", async (evento) => {
        try {
            await api.put("/admin/configuracoes", { registros_abertos: evento.target.checked });
            original.registros_abertos = rascunho.registros_abertos = evento.target.checked;
            toast(evento.target.checked ? "Novos cadastros liberados." : "Novos cadastros bloqueados.");
        } catch (erro) {
            evento.target.checked = !evento.target.checked;
            toastErro(erro);
        }
    });
    $("#cfg-login", alvo).addEventListener("change", async (evento) => {
        const ligar = evento.target.checked;
        if (!ligar && !(await confirmar({ titulo: "Suspender o login dos alunos?", mensagem: "Todos os alunos serão desconectados imediatamente.", textoConfirmar: "Suspender", perigo: true }))) {
            evento.target.checked = true;
            return;
        }
        try {
            await api.put("/admin/configuracoes", { login_alunos: ligar });
            original.login_alunos = rascunho.login_alunos = ligar;
            toast(ligar ? "Login de alunos liberado." : "Login de alunos suspenso.", ligar ? "sucesso" : "alerta");
        } catch (erro) {
            evento.target.checked = !ligar;
            toastErro(erro);
        }
    });

    // Imagens: enviadas imediatamente
    $("#arquivo-logo", alvo).addEventListener("change", (evento) => evento.target.files[0] && enviarImagem("logo", evento.target.files[0]));
    $("#arquivo-favicon", alvo).addEventListener("change", (evento) => evento.target.files[0] && enviarImagem("favicon", evento.target.files[0]));
    $("#remover-logo", alvo)?.addEventListener("click", () => removerImagem("logo"));
    $("#remover-favicon", alvo)?.addEventListener("click", () => removerImagem("favicon"));

    // Salvar / descartar
    $("#descartar", alvo).addEventListener("click", () => {
        document.documentElement.style.setProperty("--primaria", original.cor_primaria);
        ctx.app.recarregarTela();
    });
    $("#salvar-config", alvo).addEventListener("click", (evento) => comCarregamento(evento.currentTarget, async () => {
        const corpo = {
            ...Object.fromEntries(CAMPOS_TEXTO.map((chave) => [chave, rascunho[chave] || ""])),
            cor_primaria: rascunho.cor_primaria,
            aviso_tipo: rascunho.aviso_tipo,
            redes_sociais: rascunho.redes_sociais || {},
            rodape_links: rascunho.rodape_links.filter((link) => link.rotulo.trim() || link.url.trim())
        };
        try {
            const resposta = await api.put("/admin/configuracoes", corpo);
            toast(resposta.mensagem);
            original = clonar(resposta.configuracoes);
            rascunho = clonar(resposta.configuracoes);
            marcarAlterado();
            await ctx.app.recarregarIdentidade();
        } catch (erro) {
            toastErro(erro);
        }
    }));

    window.addEventListener("hashchange", () => {
        // Saiu sem salvar: volta a cor original
        document.documentElement.style.setProperty("--primaria", (ctx.app.cfg || original).cor_primaria);
    }, { once: true });
}
