// Converte links do YouTube/Vimeo no endereço do player incorporado (embed).
// Apenas esses dois provedores são aceitos, e o ID do vídeo é validado por expressão regular.

function segundosDoParametro(valor) {
    if (!valor) return 0;
    if (/^\d+$/.test(valor)) return Number(valor);
    const partes = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/.exec(valor);
    if (!partes) return 0;
    return Number(partes[1] || 0) * 3600 + Number(partes[2] || 0) * 60 + Number(partes[3] || 0);
}

export function interpretarVideoExterno(endereco) {
    let url;
    try {
        url = new URL(String(endereco || "").trim());
    } catch {
        return null;
    }
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;

    const host = url.hostname.toLowerCase().replace(/^(www\.|m\.|music\.)/, "");

    let idYoutube = null;
    if (host === "youtu.be") {
        idYoutube = url.pathname.split("/")[1];
    } else if (host === "youtube.com" || host === "youtube-nocookie.com") {
        if (url.pathname === "/watch") {
            idYoutube = url.searchParams.get("v");
        } else {
            const partes = /^\/(?:embed|shorts|live|v)\/([^/?#]+)/.exec(url.pathname);
            if (partes) idYoutube = partes[1];
        }
    }

    if (idYoutube && /^[\w-]{11}$/.test(idYoutube)) {
        const inicio = segundosDoParametro(url.searchParams.get("t") || url.searchParams.get("start"));
        return {
            provedor: "youtube",
            id: idYoutube,
            embed: `https://www.youtube-nocookie.com/embed/${idYoutube}?rel=0&modestbranding=1${inicio ? `&start=${inicio}` : ""}`,
            miniatura: `https://i.ytimg.com/vi/${idYoutube}/hqdefault.jpg`
        };
    }

    if (host === "vimeo.com" || host === "player.vimeo.com") {
        const partes = /\/(?:video\/)?(\d{6,12})(?:\/|$)/.exec(url.pathname);
        if (partes) {
            return {
                provedor: "vimeo",
                id: partes[1],
                embed: `https://player.vimeo.com/video/${partes[1]}`,
                miniatura: null
            };
        }
    }

    return null;
}
