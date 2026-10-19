// Importação em massa: envia um .zip e o servidor cria módulos (pastas) e aulas (arquivos).
import { api, enviarComProgresso } from "../api.js";
import { html, renderizar, $, $$, toast, toastErro, bytes } from "../ui.js";
import { icone } from "../icones.js";
import { cabecalhoPagina, areaDeSoltar, ligarAreaDeSoltar, interruptor } from "./comum.js";

let arquivoZip = null;

export async function montar(alvo, ctx) {
    arquivoZip = null;
    const cursos = await api.get("/admin/cursos");
    const cursoInicial = Number(ctx.consulta.get("curso")) || null;

    renderizar(alvo, html`
        ${cabecalhoPagina({ titulo: "Importar curso (ZIP)", descricao: "Crie um curso inteiro de uma vez: cada pasta do ZIP vira um módulo e cada arquivo vira uma aula." })}
        <div class="importar-grade">
            <section class="cartao">
                <div class="cartao__cabecalho"><h2 class="cartao__titulo">${icone("pacote", 18)} Enviar arquivo</h2></div>
                <div class="cartao__corpo pilha" id="painel-importacao">
                    <div class="opcoes-destino">
                        <label class="opcao-destino">
                            <input type="radio" name="destino" value="novo" ${cursoInicial ? "" : "checked"}>
                            <span><strong>${icone("mais", 16)} Novo curso</strong>Cria um curso (como rascunho) com o conteúdo do ZIP.</span>
                        </label>
                        <label class="opcao-destino">
                            <input type="radio" name="destino" value="existente" ${cursoInicial ? "checked" : ""}>
                            <span><strong>${icone("livro", 16)} Curso existente</strong>Adiciona os módulos a um curso já criado.</span>
                        </label>
                    </div>
                    <div class="campo" id="campo-novo">
                        <label for="titulo-importacao">Título do novo curso</label>
                        <input class="entrada" id="titulo-importacao" maxlength="160" placeholder="Se ficar vazio, usamos o nome do arquivo ZIP">
                        <div class="espaco-topo">${interruptor({ id: "publicar-importacao", rotulo: "Publicar imediatamente", descricao: "Caso contrário o curso fica como rascunho para revisão" })}</div>
                    </div>
                    <div class="campo" id="campo-existente" hidden>
                        <label for="curso-importacao">Curso de destino</label>
                        <select class="selecao" id="curso-importacao">
                            ${cursos.map((c) => html`<option value="${c.id}" ${c.id === cursoInicial ? "selected" : ""}>${c.titulo}</option>`)}
                        </select>
                        <small>Pastas com o mesmo nome de um módulo existente terão as aulas adicionadas a ele.</small>
                    </div>
                    <div id="area-zip"></div>
                    <div class="barra-envio" id="progresso-zip" hidden>
                        <div class="barra-envio__texto"><span id="texto-zip">Enviando...</span><strong id="percentual-zip">0%</strong></div>
                        <div class="progresso"><div class="progresso__barra" id="barra-zip"></div></div>
                    </div>
                    <button class="btn btn--primario btn--lg" id="importar" disabled>${icone("enviar", 18)} Importar curso</button>
                    <div id="resultado-importacao"></div>
                </div>
            </section>
            <section class="cartao">
                <div class="cartao__cabecalho"><h2 class="cartao__titulo">${icone("info", 18)} Como montar o ZIP</h2></div>
                <div class="cartao__corpo pilha">
                    <div class="arvore">📦 meu-curso.zip
├── <b>01 - Introdução/</b>          <i>→ módulo</i>
│   ├── 01 - Boas-vindas.mp4     <i>→ aula de vídeo</i>
│   ├── 02 - Apostila.pdf        <i>→ aula de arquivo</i>
│   └── 03 - Leitura.md          <i>→ aula de texto</i>
└── <b>02 - Fundamentos/</b>
    ├── 01 - Conceitos.mp4
    └── 02 - Podcast.mp3         <i>→ aula de áudio</i></div>
                    <ul class="pilha pequeno mudo lista-limpa">
                        <li>${icone("check", 14)} A numeração no início dos nomes define a ordem e é removida do título.</li>
                        <li>${icone("check", 14)} Vídeos: mp4, webm, mov, m4v · Áudios: mp3, m4a, wav, ogg · Documentos: pdf, docx, xlsx, pptx, zip...</li>
                        <li>${icone("check", 14)} Arquivos <code>.md</code> e <code>.txt</code> viram aulas de texto (Markdown).</li>
                        <li>${icone("check", 14)} A duração dos vídeos MP4 é detectada automaticamente.</li>
                        <li>${icone("escudo", 14)} Formatos não suportados são ignorados e listados no resultado; o conteúdo de cada arquivo é verificado.</li>
                    </ul>
                </div>
            </section>
        </div>`);

    const atualizarDestino = () => {
        const novo = $("[name=destino]:checked").value === "novo";
        $("#campo-novo").hidden = !novo;
        $("#campo-existente").hidden = novo;
    };
    $$("[name=destino]").forEach((radio) => radio.addEventListener("change", atualizarDestino));
    atualizarDestino();

    const desenharArea = () => {
        const area = $("#area-zip");
        if (arquivoZip) {
            renderizar(area, html`
                <div class="arquivo-atual">${icone("pacote", 22)}<div><strong>${arquivoZip.name}</strong><span>${bytes(arquivoZip.size)}</span></div>
                <button type="button" class="btn btn--sm btn--fantasma" id="trocar-zip">Trocar</button></div>`);
            $("#trocar-zip").addEventListener("click", () => {
                arquivoZip = null;
                desenharArea();
            });
        } else {
            renderizar(area, areaDeSoltar({ id: "arquivo-zip", titulo: "Arraste o arquivo .zip aqui", subtitulo: "ou clique para escolher", aceitar: ".zip,application/zip", nomeIcone: "pacote" }));
            ligarAreaDeSoltar(area, "arquivo-zip", ([arquivo]) => {
                if (!/\.zip$/i.test(arquivo.name)) return toast("Selecione um arquivo .zip.", "erro");
                arquivoZip = arquivo;
                desenharArea();
            });
        }
        $("#importar").disabled = !arquivoZip;
    };
    desenharArea();

    $("#importar").addEventListener("click", async (evento) => {
        const botao = evento.currentTarget;
        const formulario = new FormData();
        if ($("[name=destino]:checked").value === "existente") {
            formulario.append("curso_id", $("#curso-importacao").value);
        } else {
            formulario.append("titulo", $("#titulo-importacao").value.trim());
            formulario.append("publicar", String($("#publicar-importacao").checked));
        }
        formulario.append("arquivo", arquivoZip);

        botao.disabled = true;
        $("#progresso-zip").hidden = false;
        $("#resultado-importacao").innerHTML = "";
        try {
            const resposta = await enviarComProgresso("/admin/importacao/zip", formulario, {
                aoProgredir: (percentual) => {
                    $("#percentual-zip").textContent = `${percentual}%`;
                    $("#barra-zip").style.setProperty("--largura", `${percentual}%`);
                    if (percentual === 100) $("#texto-zip").textContent = "Descompactando e verificando arquivos no servidor...";
                }
            });
            arquivoZip = null;
            desenharArea();
            renderizar($("#resultado-importacao"), html`
                <div class="alerta alerta--sucesso">${icone("check-circulo", 20)}<div>
                    <strong>${resposta.mensagem}</strong>
                    <p>${resposta.curso_criado ? "Um novo curso foi criado." : "O conteúdo foi adicionado ao curso escolhido."}</p>
                </div></div>
                ${resposta.ignorados.length ? html`
                    <div class="alerta alerta--alerta espaco-topo">${icone("aviso", 18)}<div>
                        <strong>${resposta.ignorados.length} arquivo(s) ignorado(s)</strong>
                        <p>${resposta.ignorados.slice(0, 8).join(" · ")}${resposta.ignorados.length > 8 ? " ..." : ""}</p>
                    </div></div>` : ""}
                <a class="btn btn--primario btn--bloco espaco-topo" href="#/cursos/${resposta.curso_id}">${icone("camadas", 16)} Abrir no editor de conteúdo</a>`);
            toast(resposta.mensagem);
        } catch (erro) {
            toastErro(erro);
            botao.disabled = false;
        } finally {
            $("#progresso-zip").hidden = true;
            $("#texto-zip").textContent = "Enviando...";
        }
    });
}
