// Configuração da conexão com o banco de dados MySQL.
// Usamos um "pool": um conjunto de conexões reaproveitadas entre as requisições.
import mysql from "mysql2/promise";
import { config } from "../config/ambiente.js";

const pool = mysql.createPool({
    host: config.db.host,
    port: config.db.port,
    user: config.db.user,
    password: config.db.password,
    database: config.db.database,
    waitForConnections: true,
    connectionLimit: 10,
    charset: "utf8mb4",
    decimalNumbers: true
});

// Testa a conexão antes de o servidor começar a aceitar requisições.
async function testarConexao() {
    let conexao;
    try {
        conexao = await pool.getConnection();
        await conexao.query("SELECT 1");
        console.log(`✔ Conexão com o banco "${config.db.database}" realizada com sucesso!`);
    } finally {
        if (conexao) {
            conexao.release();
        }
    }
}

// Executa várias consultas dentro de uma transação (tudo ou nada).
async function emTransacao(funcao) {
    const conexao = await pool.getConnection();
    try {
        await conexao.beginTransaction();
        const resultado = await funcao(conexao);
        await conexao.commit();
        return resultado;
    } catch (erro) {
        await conexao.rollback();
        throw erro;
    } finally {
        conexao.release();
    }
}

export { pool, testarConexao, emTransacao };
