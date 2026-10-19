// Conversor de Markdown → HTML SEGURO, usado nas aulas de texto e descrições de curso.
// Primeiro TODO o texto é escapado; só depois aplicamos a formatação permitida.
// Não existe forma de injetar <script>, atributos ou links "javascript:".
import { esc } from "./ui.js";

const PALAVRAS = new Set((
    "const let var function return if else for while do switch case break continue new class extends import from export default " +
    "async await try catch finally throw typeof instanceof in of null undefined true false this super yield delete void " +
    "select insert into values update set delete from where join left right inner outer on order by group having limit offset " +
    "create table primary key foreign references not null auto_increment int varchar text datetime and or as distinct count sum " +
    "def elif print lambda pass none self public private static void interface type enum"
).split(" "));

// Realce de sintaxe simples: separa o código em "tokens" e escapa cada um
function realcar(codigo) {
    const padrao = /(\/\/[^\n]*|(?:^|(?<=\s))--\s[^\n]*|(?:^|(?<=\s))#\s[^\n]*|\/\*[\s\S]*?\*\/)|("(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'|`(?:\\.|[^`\\])*`)|(\b\d+(?:\.\d+)?\b)|([A-Za-z_$][\w$]*)(?=\s*\()|([A-Za-z_$][\w$]*)/g;
    let saida = "";
    let ultimo = 0;
    for (const achado of codigo.matchAll(padrao)) {
        saida += esc(codigo.slice(ultimo, achado.index));
        const [texto, comentario, string, numero, funcao, palavra] = achado;
        if (comentario) saida += `<span class="tk-comentario">${esc(texto)}</span>`;
        else if (string) saida += `<span class="tk-texto">${esc(texto)}</span>`;
        else if (numero) saida += `<span class="tk-numero">${esc(texto)}</span>`;
        else if (funcao && !PALAVRAS.has(funcao.toLowerCase())) saida += `<span class="tk-funcao">${esc(texto)}</span>`;
        else if ((funcao || palavra) && PALAVRAS.has(texto.toLowerCase())) saida += `<span class="tk-palavra">${esc(texto)}</span>`;
        else saida += esc(texto);
        ultimo = achado.index + texto.length;
    }
    return saida + esc(codigo.slice(ultimo));
}

function linkSeguro(url) {
    const limpo = url.trim();
    if (/^https?:\/\//i.test(limpo) || /^\/(?!\/)/.test(limpo) || /^#[\w-]*$/.test(limpo) || /^mailto:/i.test(limpo)) return limpo;
    return null;
}

// Formatação dentro de uma linha: `código`, **negrito**, *itálico*, ~~riscado~~, [link](url)
function inline(texto) {
    const codigos = [];
    let resultado = texto.replace(/`([^`]+)`/g, (_, codigo) => {
        codigos.push(`<code>${esc(codigo)}</code>`);
        return `\u0000${codigos.length - 1}\u0000`;
    });
    resultado = esc(resultado);
    resultado = resultado
        .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
        .replace(/(^|[^*])\*(?!\s)(.+?)\*(?!\*)/g, "$1<em>$2</em>")
        .replace(/(^|\s)_(?!\s)(.+?)_(?=\s|$|[.,!?])/g, "$1<em>$2</em>")
        .replace(/~~(.+?)~~/g, "<del>$1</del>")
        .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, rotulo, url) => {
            // a URL já está escapada; desfazemos só &amp; para validar e escapamos de novo
            const original = url.replace(/&amp;/g, "&");
            const seguro = linkSeguro(original);
            if (!seguro) return rotulo;
            const externo = /^https?:/i.test(seguro);
            return `<a href="${esc(seguro)}"${externo ? ' target="_blank" rel="noopener noreferrer"' : ""}>${rotulo}</a>`;
        });
    return resultado.replace(/\u0000(\d+)\u0000/g, (_, indice) => codigos[Number(indice)]);
}

export function markdownParaHtml(fonte) {
    const linhas = String(fonte || "").replace(/\r\n?/g, "\n").split("\n");
    const blocos = [];
    let paragrafo = [];
    let lista = null;
    let citacao = [];

    const fecharParagrafo = () => {
        if (paragrafo.length) blocos.push(`<p>${inline(paragrafo.join(" "))}</p>`);
        paragrafo = [];
    };
    const fecharLista = () => {
        if (lista) blocos.push(`<${lista.tipo}>${lista.itens.map((item) => `<li>${inline(item)}</li>`).join("")}</${lista.tipo}>`);
        lista = null;
    };
    const fecharCitacao = () => {
        if (citacao.length) blocos.push(`<blockquote>${inline(citacao.join(" "))}</blockquote>`);
        citacao = [];
    };
    const fecharTudo = () => {
        fecharParagrafo();
        fecharLista();
        fecharCitacao();
    };

    for (let i = 0; i < linhas.length; i++) {
        const linha = linhas[i];

        const cerca = /^```\s*([\w+-]*)\s*$/.exec(linha);
        if (cerca) {
            fecharTudo();
            const codigo = [];
            i += 1;
            while (i < linhas.length && !/^```\s*$/.test(linhas[i])) {
                codigo.push(linhas[i]);
                i += 1;
            }
            const linguagem = cerca[1] ? `<span class="rotulo-linguagem">${esc(cerca[1])}</span>` : "";
            blocos.push(`<pre>${linguagem}<code>${realcar(codigo.join("\n"))}</code></pre>`);
            continue;
        }

        if (/^\s*$/.test(linha)) {
            fecharTudo();
            continue;
        }

        const titulo = /^(#{1,4})\s+(.+)$/.exec(linha);
        if (titulo) {
            fecharTudo();
            const nivel = Math.min(4, titulo[1].length + 1);
            blocos.push(`<h${nivel}>${inline(titulo[2])}</h${nivel}>`);
            continue;
        }

        if (/^(-{3,}|\*{3,})\s*$/.test(linha)) {
            fecharTudo();
            blocos.push("<hr>");
            continue;
        }

        const cit = /^>\s?(.*)$/.exec(linha);
        if (cit) {
            fecharParagrafo();
            fecharLista();
            citacao.push(cit[1]);
            continue;
        }

        const item = /^\s*([-*+]|\d+[.)])\s+(.+)$/.exec(linha);
        if (item) {
            fecharParagrafo();
            fecharCitacao();
            const tipo = /\d/.test(item[1]) ? "ol" : "ul";
            if (!lista || lista.tipo !== tipo) {
                fecharLista();
                lista = { tipo, itens: [] };
            }
            lista.itens.push(item[2]);
            continue;
        }

        if (lista && /^\s{2,}\S/.test(linha)) {
            lista.itens[lista.itens.length - 1] += ` ${linha.trim()}`;
            continue;
        }

        fecharLista();
        fecharCitacao();
        paragrafo.push(linha.trim());
    }
    fecharTudo();
    return blocos.join("\n");
}

// Adiciona botão "copiar" aos blocos de código renderizados
export function prepararBlocosDeCodigo(raiz) {
    raiz.querySelectorAll("pre").forEach((bloco) => {
        if (bloco.querySelector(".copiar-codigo")) return;
        const botao = document.createElement("button");
        botao.type = "button";
        botao.className = "btn btn--sm copiar-codigo";
        botao.textContent = "Copiar";
        botao.addEventListener("click", async () => {
            try {
                await navigator.clipboard.writeText(bloco.querySelector("code").innerText);
                botao.textContent = "Copiado!";
            } catch {
                botao.textContent = "Erro";
            }
            setTimeout(() => (botao.textContent = "Copiar"), 1600);
        });
        bloco.appendChild(botao);
    });
}
