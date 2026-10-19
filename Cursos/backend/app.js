// Cria e configura a aplicação Express (middlewares, rotas e arquivos estáticos).
// Quem coloca o servidor no ar é o server.js.
import express from "express";
import path from "node:path";
import cookieParser from "cookie-parser";
import { fileURLToPath } from "node:url";
import { config } from "./config/ambiente.js";
import corsMiddlewares from "./middlewares/corsMiddlewares.js";
import { cabecalhosSeguranca, limiteGeral, protegerCsrf } from "./middlewares/seguranca.js";
import { rotaApiNaoEncontrada, tratarErros } from "./middlewares/erros.js";
import { PASTAS } from "./services/arquivos.js";
import rotas from "./routes/index.js";

const PASTA_FRONTEND = fileURLToPath(new URL("../frontend/", import.meta.url));

// CRIANDO APLICAÇÃO
const app = express();
app.disable("x-powered-by");
app.set("trust proxy", config.trustProxy);

// MIDDLEWARES GLOBAIS
app.use(cabecalhosSeguranca);                 // Helmet: CSP e cabeçalhos de segurança
app.use(express.json({ limit: "1mb" }));      // lê o corpo JSON das requisições
app.use(cookieParser());                      // lê o cookie de sessão (JWT)

// API (todas as rotas ficam sob /api)
app.use("/api", corsMiddlewares, limiteGeral, protegerCsrf, rotas);
app.use("/api", rotaApiNaoEncontrada);

// Imagens públicas enviadas (capas, logo, avatares). Vídeos e materiais NÃO ficam aqui.
app.use("/uploads", express.static(PASTAS.raizPublica, {
    dotfiles: "deny",
    index: false,
    maxAge: "7d",
    setHeaders: (res) => res.set("Content-Security-Policy", "default-src 'none'; img-src 'self'; sandbox")
}));

// FRONT-END (HTML, CSS e JavaScript da interface)
app.use(express.static(PASTA_FRONTEND, { extensions: ["html"], dotfiles: "deny" }));

// Página 404 para qualquer outro endereço
app.use((req, res) => {
    res.status(404).sendFile(path.join(PASTA_FRONTEND, "404.html"));
});

// Tratamento centralizado de erros (deve ser o último middleware)
app.use(tratarErros);

export default app;
