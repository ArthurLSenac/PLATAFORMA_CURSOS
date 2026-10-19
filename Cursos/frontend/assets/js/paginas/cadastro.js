// Cadastro (CREATE de usuário): POST /api/auth/registro.
// A conta nasce com status "pendente" e só pode entrar após a aprovação do administrador.
import { api } from "../api.js";
import { html, renderizar, $, comCarregamento } from "../ui.js";
import { icone } from "../icones.js";
import { montarTelaAuth, alternarVisibilidadeSenha, mostrarMensagem, limparMensagem } from "./auth.js";
import { obterSessao, definirTitulo } from "../layout.js";

const DICAS = [
    "Use 8+ caracteres misturando letras, números e símbolos.",
    "Senha fraca — adicione mais caracteres.",
    "Razoável — inclua números e letras maiúsculas.",
    "Boa senha!",
    "Senha excelente!"
];

function calcularForca(senha) {
    if (!senha) return 0;
    let pontos = 0;
    if (senha.length >= 8) pontos++;
    if (/[a-zA-Z]/.test(senha) && /\d/.test(senha)) pontos++;
    if (/[A-Z]/.test(senha) && /[a-z]/.test(senha)) pontos++;
    if (/[^A-Za-z0-9]/.test(senha) || senha.length >= 14) pontos++;
    return Math.max(1, pontos);
}

function validar({ nome, email, senha, confirmar }) {
    if (nome.length < 2) return ["nome", "Informe seu nome completo."];
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return ["email", "Informe um e-mail válido."];
    if (senha.length < 8) return ["senha", "A senha deve ter pelo menos 8 caracteres."];
    if (!/[a-zA-Z]/.test(senha) || !/\d/.test(senha)) return ["senha", "A senha deve conter letras e números."];
    if (senha !== confirmar) return ["confirmar", "As senhas não conferem."];
    return null;
}

function mostrarSucesso(email) {
    renderizar($("#cartao-cadastro"), html`
        <div class="estado-final">
            <div class="estado-final__icone estado-final__icone--sucesso">${icone("check-circulo", 36)}</div>
            <h1>Cadastro enviado!</h1>
            <p>Recebemos o cadastro de <strong>${email}</strong>. Assim que o administrador aprovar, você poderá entrar e acessar todos os cursos.</p>
            <a class="btn btn--primario btn--lg btn--bloco" href="login.html?cadastro=1">Ir para o login</a>
            <a class="btn btn--fantasma btn--bloco espaco-topo" href="index.html">Voltar ao site</a>
        </div>`);
}

function mostrarFechado() {
    renderizar($("#cartao-cadastro"), html`
        <div class="estado-final">
            <div class="estado-final__icone estado-final__icone--alerta">${icone("cadeado", 34)}</div>
            <h1>Cadastros fechados</h1>
            <p>No momento o administrador não está aceitando novos cadastros. Tente novamente mais tarde.</p>
            <a class="btn btn--primario btn--lg btn--bloco" href="login.html">Já tenho conta</a>
            <a class="btn btn--fantasma btn--bloco espaco-topo" href="index.html">Voltar ao site</a>
        </div>`);
}

async function cadastrar(evento) {
    evento.preventDefault();
    limparMensagem();
    document.querySelectorAll("[aria-invalid]").forEach((campo) => campo.removeAttribute("aria-invalid"));

    const dados = {
        nome: $("#nome").value.trim(),
        email: $("#email").value.trim().toLowerCase(),
        senha: $("#senha").value,
        confirmar: $("#confirmar").value
    };
    const problema = validar(dados);
    if (problema) {
        const [campo, mensagem] = problema;
        $(`#${campo}`).setAttribute("aria-invalid", "true");
        $(`#${campo}`).focus();
        mostrarMensagem("erro", mensagem);
        return;
    }

    await comCarregamento($("#btn-cadastrar"), async () => {
        try {
            await api.post("/auth/registro", {
                nome: dados.nome, email: dados.email, senha: dados.senha, confirmar_senha: dados.confirmar
            });
            mostrarSucesso(dados.email);
        } catch (erro) {
            if (erro.status === 403) return mostrarFechado();
            mostrarMensagem("erro", "Não foi possível concluir o cadastro", erro.message);
        }
    });
}

async function iniciar() {
    const usuario = await obterSessao();
    if (usuario) {
        location.replace(usuario.papel === "admin" ? "admin.html" : "painel.html");
        return;
    }
    const cfg = await montarTelaAuth();
    definirTitulo("Criar conta");
    if (!cfg.registros_abertos) return mostrarFechado();

    alternarVisibilidadeSenha($("#mostrar-senha"), $("#senha"), $("#confirmar"));
    $("#senha").addEventListener("input", () => {
        const nivel = calcularForca($("#senha").value);
        $("#forca-senha").dataset.nivel = String(nivel);
        $("#dica-senha").textContent = DICAS[nivel];
    });
    $("#form-cadastro").addEventListener("submit", cadastrar);
    $("#nome").focus();
}

iniciar();
