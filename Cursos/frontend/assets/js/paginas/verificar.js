// Verificação pública de certificados: GET /api/publico/certificados/:codigo
import { api } from "../api.js";
import { html, renderizar, $, comCarregamento, dataExtenso, parametro } from "../ui.js";
import { icone } from "../icones.js";
import { montarLayout, definirTitulo } from "../layout.js";

function formatarCodigo(valor) {
    const limpo = valor.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 12);
    return limpo.match(/.{1,4}/g)?.join("-") || "";
}

async function verificar(evento) {
    evento?.preventDefault();
    const codigo = formatarCodigo($("#codigo").value);
    const resultado = $("#resultado");
    if (codigo.length < 14) {
        renderizar(resultado, html`<div class="alerta alerta--alerta">${icone("info", 18)}<div><strong>Código incompleto</strong><p>O código tem 12 caracteres no formato XXXX-XXXX-XXXX.</p></div></div>`);
        return;
    }
    await comCarregamento($("#btn-verificar"), async () => {
        try {
            const certificado = await api.get(`/publico/certificados/${codigo}`);
            history.replaceState(null, "", `verificar.html?codigo=${codigo}`);
            renderizar(resultado, html`
                <div class="alerta alerta--sucesso">${icone("escudo", 20)}<div><strong>Certificado autêntico</strong><p>Este certificado foi emitido pela plataforma e é válido.</p></div></div>
                <div class="dados-certificado">
                    <div><span>Aluno(a)</span><strong>${certificado.nome_aluno}</strong></div>
                    <div><span>Curso</span><strong>${certificado.titulo_curso}</strong></div>
                    <div><span>Carga horária</span><strong>${certificado.carga_horaria} hora(s)</strong></div>
                    <div><span>Emitido em</span><strong>${dataExtenso(certificado.emitido_em)}</strong></div>
                </div>
                <a class="btn btn--bloco espaco-topo" href="certificado.html?codigo=${certificado.codigo}">${icone("certificado", 17)} Ver certificado completo</a>`);
        } catch (erro) {
            renderizar(resultado, html`<div class="alerta alerta--erro">${icone("x-circulo", 20)}<div><strong>Certificado não encontrado</strong><p>${erro.message}</p></div></div>`);
        }
    });
}

async function iniciar() {
    await montarLayout({ ativo: "verificar" });
    definirTitulo("Verificar certificado");
    renderizar($("#icone-topo"), icone("escudo", 28));
    $("#codigo").addEventListener("input", (evento) => {
        evento.target.value = formatarCodigo(evento.target.value);
    });
    $("#form-verificar").addEventListener("submit", verificar);
    const codigo = parametro("codigo");
    if (codigo) {
        $("#codigo").value = formatarCodigo(codigo);
        verificar();
    } else {
        $("#codigo").focus();
    }
}

iniciar();
