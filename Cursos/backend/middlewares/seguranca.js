// Camadas de segurança HTTP aplicadas a todas as requisições.
import helmet from "helmet";
import { rateLimit, ipKeyGenerator } from "express-rate-limit";
import { config } from "../config/ambiente.js";

// Helmet: cabeçalhos de segurança + Content Security Policy (CSP).
// A CSP só permite scripts do próprio site — scripts injetados (XSS) não executam.
export const cabecalhosSeguranca = helmet({
    contentSecurityPolicy: {
        useDefaults: false,
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'"],
            styleSrc: ["'self'", "https://fonts.googleapis.com"],
            fontSrc: ["'self'", "https://fonts.gstatic.com", "data:"],
            imgSrc: ["'self'", "data:", "blob:", "https://i.ytimg.com"],
            mediaSrc: ["'self'", "blob:"],
            frameSrc: ["'self'", "https://www.youtube-nocookie.com", "https://www.youtube.com", "https://player.vimeo.com"],
            connectSrc: ["'self'"],
            objectSrc: ["'none'"],
            baseUri: ["'self'"],
            formAction: ["'self'"],
            frameAncestors: ["'self'"],
            ...(config.producao ? { upgradeInsecureRequests: [] } : {})
        }
    },
    // O YouTube exige o cabeçalho Referer para liberar o player incorporado
    referrerPolicy: { policy: "strict-origin-when-cross-origin" },
    // Permite que o front-end no Live Server (mesmo "site", outra porta) carregue imagens/vídeos
    crossOriginResourcePolicy: { policy: "same-site" },
    strictTransportSecurity: config.producao
});

const mensagemLimite = (mensagem) => ({ mensagem });

// Limite geral da API: evita abuso/robôs
export const limiteGeral = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 1500,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: mensagemLimite("Muitas requisições. Aguarde alguns minutos e tente novamente.")
});

// Login: no máximo 10 tentativas a cada 15 minutos por IP + e-mail (anti força bruta)
export const limiteLogin = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    keyGenerator: (req) => `${ipKeyGenerator(req.ip)}:${String(req.body?.email || "").toLowerCase().slice(0, 190)}`,
    message: mensagemLimite("Muitas tentativas de login. Aguarde 15 minutos e tente novamente.")
});

// Cadastro: no máximo 10 contas por hora a partir do mesmo IP
export const limiteCadastro = rateLimit({
    windowMs: 60 * 60 * 1000,
    limit: 10,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: mensagemLimite("Muitos cadastros a partir desta rede. Tente novamente mais tarde.")
});

// Proteção CSRF: quando a autenticação vem do cookie, toda requisição que altera dados
// precisa do cabeçalho X-Requested-With (que um site malicioso não consegue enviar
// sem passar pelo CORS) e, se tiver Origin, ele precisa ser um endereço autorizado.
export function protegerCsrf(req, res, next) {
    if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();

    const origem = req.get("origin");
    if (origem) {
        const proprio = `${req.protocol}://${req.get("host")}`;
        if (origem !== proprio && !config.corsOrigens.includes(origem)) {
            return res.status(403).json({ mensagem: "Origem da requisição não autorizada." });
        }
    }

    const usaCookie = Boolean(req.cookies?.[config.jwt.cookie]) && !req.get("authorization");
    if (usaCookie && req.get("x-requested-with") !== "XMLHttpRequest") {
        return res.status(403).json({ mensagem: "Requisição bloqueada pela proteção CSRF." });
    }
    next();
}
