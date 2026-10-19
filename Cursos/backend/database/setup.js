// Script auxiliar: cria o banco de dados e as tabelas executando o arquivo sql/plataforma_cursos.sql.
// Uso: npm run db:setup
import fs from "node:fs/promises";
import mysql from "mysql2/promise";
import { fileURLToPath } from "node:url";
import { config } from "../config/ambiente.js";

const arquivoSql = fileURLToPath(new URL("../../sql/plataforma_cursos.sql", import.meta.url));

async function executar() {
    let sql = await fs.readFile(arquivoSql, "utf8");

    // Se o .env usar outro nome de banco, adapta o script para ele.
    if (config.db.database !== "plataforma_cursos") {
        if (!/^[a-zA-Z0-9_]+$/.test(config.db.database)) {
            throw new Error("DB_NAME inválido: use apenas letras, números e _");
        }
        sql = sql.replace(/\bplataforma_cursos\b/g, config.db.database);
    }

    const conexao = await mysql.createConnection({
        host: config.db.host,
        port: config.db.port,
        user: config.db.user,
        password: config.db.password,
        multipleStatements: true,
        charset: "utf8mb4"
    });

    try {
        console.log(`→ Executando ${arquivoSql}`);
        await conexao.query(sql);
        console.log(`✔ Banco "${config.db.database}" criado com tabelas e dados de exemplo.`);
        console.log("  Agora rode: npm start");
    } finally {
        await conexao.end();
    }
}

executar().catch((erro) => {
    console.error("✖ Falha ao criar o banco de dados:", erro.message);
    process.exit(1);
});
