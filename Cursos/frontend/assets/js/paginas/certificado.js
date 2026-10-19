// Certificado: busca os dados pelo código público e monta o documento para imprimir/salvar em PDF.
import { api } from "../api.js";
import { html, renderizar, $, dataExtenso, parametro, copiarTexto } from "../ui.js";
import { icone } from "../icones.js";
import { carregarConfiguracoes, definirTitulo, marca, botaoTema, alternarTema } from "../layout.js";
import { estadoVazio } from "../componentes.js";

async function iniciar() {
    const cfg = await carregarConfiguracoes();
    const codigo = String(parametro("codigo") || "").toUpperCase();
    const linkVerificacao = `${location.origin}${location.pathname.replace(/certificado\.html$/, "verificar.html")}?codigo=${codigo}`;

    renderizar($("#barra"), html`
        <a class="btn btn--fantasma" href="painel.html#certificados">${icone("voltar", 17)} Voltar</a>
        <div class="linha">
            ${botaoTema()}
            <button class="btn" id="copiar">${icone("link", 16)} Copiar link de verificação</button>
            <button class="btn btn--primario" id="imprimir">${icone("impressora", 16)} Imprimir / salvar PDF</button>
        </div>`);
    $("[data-alternar-tema]").addEventListener("click", alternarTema);

    let certificado;
    try {
        certificado = await api.get(`/publico/certificados/${encodeURIComponent(codigo)}`);
    } catch (erro) {
        definirTitulo("Certificado não encontrado");
        renderizar($("#palco"), estadoVazio({
            icone: "x-circulo", titulo: "Certificado não encontrado", texto: erro.message,
            acao: html`<a class="btn btn--primario" href="verificar.html">Verificar outro código</a>`
        }));
        $("#copiar").hidden = true;
        $("#imprimir").hidden = true;
        return;
    }
    definirTitulo(`Certificado — ${certificado.nome_aluno}`);

    renderizar($("#palco"), html`
        <article class="certificado" aria-label="Certificado de conclusão">
            <div class="certificado__faixa"></div>
            <div class="certificado__conteudo">
                <div class="certificado__topo">
                    <div class="certificado__marca">${marca(cfg)}</div>
                    <span class="certificado__selo-topo">Certificado oficial</span>
                </div>
                <div class="certificado__titulo">Certificado</div>
                <div class="certificado__subtitulo">de conclusão de curso</div>
                <p class="certificado__texto">
                    Certificamos que
                    <span class="certificado__nome">${certificado.nome_aluno}</span>
                    concluiu com êxito o curso <strong>${certificado.titulo_curso}</strong>, com carga horária de
                    <strong>${certificado.carga_horaria} hora(s)</strong>, em ${dataExtenso(certificado.emitido_em)}.
                </p>
                <div class="certificado__rodape">
                    <div class="certificado__assinatura">
                        <span>${cfg.nome_site}</span>
                        <small>${certificado.assinatura || "Coordenação Pedagógica"}</small>
                    </div>
                    <div class="certificado__medalha"><div>${icone("medalha", 30)}Concluído</div></div>
                    <div class="certificado__verificacao">
                        Verifique a autenticidade em<br>
                        <strong>${location.host}/verificar.html</strong><br>
                        <code>${certificado.codigo}</code>
                    </div>
                </div>
            </div>
        </article>`);

    $("#imprimir").addEventListener("click", () => window.print());
    $("#copiar").addEventListener("click", () => copiarTexto(linkVerificacao));
}

iniciar();
