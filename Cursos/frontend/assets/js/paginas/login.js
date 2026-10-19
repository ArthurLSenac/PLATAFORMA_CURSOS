// Login: envia e-mail e senha para POST /api/auth/login.
// O servidor responde com um cookie httpOnly contendo o JWT da sessão.
import { api } from "../api.js";
import { html, renderizar, $, comCarregamento, parametro, destinoSeguro } from "../ui.js";
import { montarTelaAuth, alternarVisibilidadeSenha, mostrarMensagem, limparMensagem } from "./auth.js";
import { obterSessao, mostrarAvisoPendente, definirTitulo } from "../layout.js";

const TITULOS_STATUS = {
    CONTA_PENDENTE: ["alerta", "Cadastro em análise"],
    CONTA_BLOQUEADO: ["erro", "Acesso bloqueado"],
    CONTA_REJEITADO: ["erro", "Cadastro não aprovado"],
    LOGIN_SUSPENSO: ["alerta", "Acesso temporariamente suspenso"]
};

function destinoAposLogin(usuario) {
    if (usuario.papel === "admin") {
        const voltar = parametro("voltar");
        return voltar?.startsWith("admin.html") ? destinoSeguro(voltar, "admin.html") : "admin.html";
    }
    return destinoSeguro(parametro("voltar"), "painel.html");
}

async function entrar(evento) {
    evento.preventDefault();
    limparMensagem();
    const email = $("#email").value.trim();
    const senha = $("#senha").value;

    if (!email || !senha) {
        mostrarMensagem("erro", "Preencha e-mail e senha.");
        (email ? $("#senha") : $("#email")).focus();
        return;
    }

    await comCarregamento($("#btn-entrar"), async () => {
        try {
            const resposta = await api.post("/auth/login", { email, senha });
            mostrarMensagem("sucesso", resposta.mensagem, "Redirecionando...");
            location.href = destinoAposLogin(resposta.usuario);
        } catch (erro) {
            const [tipo, titulo] = TITULOS_STATUS[erro.codigo] || ["erro", "Não foi possível entrar"];
            mostrarMensagem(tipo, titulo, erro.message);
            $("#senha").value = "";
            $("#senha").focus();
        }
    });
}

async function iniciar() {
    // Já está logado? Vai direto para o painel certo.
    const usuario = await obterSessao();
    if (usuario) {
        location.replace(destinoAposLogin(usuario));
        return;
    }

    const cfg = await montarTelaAuth();
    definirTitulo("Entrar");
    if (!cfg.registros_abertos) {
        renderizar($("#link-cadastro"), html`Novos cadastros estão temporariamente fechados.`);
    }

    const aviso = mostrarAvisoPendente();
    if (aviso) mostrarMensagem("alerta", "Sua sessão foi encerrada", aviso);
    if (parametro("saiu")) mostrarMensagem("sucesso", "Você saiu da plataforma.", "Até a próxima!");
    if (parametro("cadastro")) mostrarMensagem("info", "Cadastro enviado!", "Você poderá entrar assim que o administrador aprovar seu acesso.");

    alternarVisibilidadeSenha($("#mostrar-senha"), $("#senha"));
    $("#senha").addEventListener("keyup", (evento) => {
        $("#aviso-caps").hidden = !evento.getModifierState?.("CapsLock");
    });
    $("#form-login").addEventListener("submit", entrar);

    $("#contas-demo")?.remove();
    $("#email").focus();
}

iniciar();
