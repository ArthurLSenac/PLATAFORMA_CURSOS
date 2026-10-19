// Carrega o arquivo .env e centraliza todas as configurações do servidor.
// Qualquer parte do sistema que precise de uma configuração importa "config" daqui.
import dotenv from "dotenv";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

dotenv.config({ path: fileURLToPath(new URL("../.env", import.meta.url)), quiet: true });

const producao = process.env.NODE_ENV === "production";

function numero(valor, padrao) {
    const n = Number(valor);
    return Number.isFinite(n) && n > 0 ? n : padrao;
}

function lista(valor, padrao) {
    return (valor || padrao)
        .split(",")
        .map((item) => item.trim().replace(/\/$/, ""))
        .filter(Boolean);
}

// A chave do JWT precisa ser longa e secreta. Em produção o servidor se recusa a subir sem ela;
// em desenvolvimento geramos uma chave temporária para o projeto funcionar "de primeira".
let segredoJwt = process.env.JWT_SECRET || "";
if (segredoJwt.length < 32) {
    if (producao) {
        console.error("✖ JWT_SECRET ausente ou muito curto no .env (mínimo de 32 caracteres).");
        process.exit(1);
    }
    segredoJwt = crypto.randomBytes(48).toString("hex");
    console.warn("⚠ JWT_SECRET não definido no .env — usando uma chave temporária (os logins expiram ao reiniciar).");
}

const adminEmail = (process.env.ADMIN_EMAIL || "").trim().toLowerCase();
const adminSenha = process.env.ADMIN_SENHA || "";
if (!adminEmail || adminSenha.length < 8) {
    console.error("Defina ADMIN_EMAIL e ADMIN_SENHA (mínimo de 8 caracteres) no arquivo .env local.");
    process.exit(1);
}

export const config = {
    producao,
    porta: numero(process.env.PORT, 3000),
    corsOrigens: lista(
        process.env.CORS_ORIGINS,
        "http://localhost:3000,http://127.0.0.1:3000,http://localhost:5500,http://127.0.0.1:5500"
    ),
    trustProxy: process.env.TRUST_PROXY === "true" ? 1 : false,
    cookieSeguro: process.env.COOKIE_SECURE ? process.env.COOKIE_SECURE === "true" : producao,

    db: {
        host: process.env.DB_HOST || "localhost",
        port: numero(process.env.DB_PORT, 3306),
        user: process.env.DB_USER || "root",
        password: process.env.DB_PASSWORD || "",
        database: process.env.DB_NAME || "plataforma_cursos"
    },

    jwt: {
        segredo: segredoJwt,
        expiracao: process.env.JWT_EXPIRES_IN || "8h",
        emissor: "lumina-academy-api",
        publico: "lumina-academy-web",
        cookie: "lumina_sessao"
    },

    admin: {
        nome: (process.env.ADMIN_NOME || "Administrador").trim(),
        email: adminEmail,
        senha: adminSenha
    },

    uploads: {
        maxVideoMB: numero(process.env.UPLOAD_MAX_VIDEO_MB, 2048),
        maxArquivoMB: numero(process.env.UPLOAD_MAX_ARQUIVO_MB, 200),
        maxImagemMB: numero(process.env.UPLOAD_MAX_IMAGEM_MB, 5),
        maxZipMB: numero(process.env.UPLOAD_MAX_ZIP_MB, 4096)
    }
};
