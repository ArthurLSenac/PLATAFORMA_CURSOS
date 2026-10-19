// Partes compartilhadas entre as páginas de login e cadastro.
import { html, renderizar, $ } from "../ui.js";
import { icone } from "../icones.js";
import { carregarConfiguracoes, marca, botaoTema, alternarTema } from "../layout.js";

export async function montarTelaAuth() {
    const cfg = await carregarConfiguracoes();

    renderizar($("#arte"), html`
        <a class="marca" href="index.html">${marca(cfg)}</a>
        <div>
            <h2>${cfg.slogan || "Aprenda no seu ritmo. Evolua sem limites."}</h2>
            <ul class="auth__lista">
                <li><span>${icone("play-circulo", 16)}</span> Aulas em vídeo, áudio, textos e materiais</li>
                <li><span>${icone("subindo", 16)}</span> Progresso salvo automaticamente</li>
                <li><span>${icone("medalha", 16)}</span> Certificado com código de verificação</li>
                <li><span>${icone("escudo", 16)}</span> Acesso seguro com aprovação do administrador</li>
            </ul>
        </div>
        <blockquote class="depoimento">
            <p>“As trilhas são muito bem organizadas. Consegui estudar no meu ritmo e o certificado foi um diferencial no meu currículo.”</p>
            <footer><span class="avatar avatar--sm">AS</span><div><strong>Ana Souza</strong><br><span>Aluna de Desenvolvimento Web</span></div></footer>
        </blockquote>`);

    renderizar($("#auth-topo"), html`
        <a class="btn btn--fantasma btn--sm" href="index.html">${icone("voltar", 15)} Voltar ao site</a>
        ${botaoTema()}`);
    $("#auth-topo [data-alternar-tema]").addEventListener("click", alternarTema);
    return cfg;
}

export function alternarVisibilidadeSenha(botao, ...campos) {
    const desenhar = (visivel) => {
        botao.innerHTML = String(icone(visivel ? "olho-fechado" : "olho", 17));
        botao.setAttribute("aria-label", visivel ? "Ocultar senha" : "Mostrar senha");
    };
    desenhar(false);
    botao.addEventListener("click", () => {
        const visivel = campos[0].type === "password";
        campos.forEach((campo) => (campo.type = visivel ? "text" : "password"));
        desenhar(visivel);
    });
}

export function mostrarMensagem(tipo, titulo, texto = "") {
    const icones = { erro: "x-circulo", sucesso: "check-circulo", alerta: "ampulheta", info: "info" };
    renderizar($("#mensagem"), html`
        <div class="alerta alerta--${tipo}" role="alert">
            ${icone(icones[tipo] || "info", 18)}
            <div><strong>${titulo}</strong>${texto ? html`<p>${texto}</p>` : ""}</div>
        </div>`);
    $("#mensagem").style.marginBottom = "20px";
}

export function limparMensagem() {
    $("#mensagem").innerHTML = "";
    $("#mensagem").style.marginBottom = "";
}
