// Arquivo que INICIA o servidor (npm start → node server.js).
// Ordem: testa o banco → prepara pastas → carrega configurações → garante o admin fixo → app.listen
import app from "./app.js";
import { config } from "./config/ambiente.js";
import { testarConexao } from "./database/conexao.js";
import { prepararPastasUpload } from "./services/arquivos.js";
import { carregarConfiguracoes } from "./services/configuracoes.js";
import { garantirAdminFixo } from "./services/adminFixo.js";
import { limparSessoesAntigas } from "./services/tokens.js";

// Traduz os erros mais comuns de banco para mensagens que ajudam a resolver
function explicarErro(erro) {
    const dicas = {
        ECONNREFUSED: "O MySQL não está rodando ou a porta (DB_PORT) está errada.",
        ER_ACCESS_DENIED_ERROR: "Usuário ou senha do MySQL incorretos (DB_USER / DB_PASSWORD no .env).",
        ER_BAD_DB_ERROR: `O banco "${config.db.database}" não existe. Rode: npm run db:setup`,
        ER_NO_SUCH_TABLE: "As tabelas não existem. Rode: npm run db:setup",
        ENOTFOUND: "Host do banco (DB_HOST) não encontrado."
    };
    return dicas[erro.code] || erro.message;
}

async function iniciarServidor() {
    try {
        await testarConexao();
        await prepararPastasUpload();
        await carregarConfiguracoes();
        await garantirAdminFixo();

        const servidor = app.listen(config.porta, () => {
            console.log("");
            console.log("  ▲ Lumina Academy");
            console.log(`  ➜ Site:        http://localhost:${config.porta}`);
            console.log(`  ➜ Painel admin: http://localhost:${config.porta}/admin.html`);
            console.log(`  ➜ API:         http://localhost:${config.porta}/api/saude`);
            console.log("");
        });

        // Uploads grandes (vídeos) podem levar vários minutos
        servidor.requestTimeout = 60 * 60 * 1000;
        servidor.headersTimeout = 65 * 1000;

        // Limpeza periódica das sessões vencidas (a cada 6 horas)
        setInterval(() => limparSessoesAntigas().catch(() => {}), 6 * 60 * 60 * 1000).unref();
    } catch (erro) {
        console.error("✖ Não foi possível iniciar o servidor.");
        console.error(`  Motivo: ${explicarErro(erro)}`);
        process.exit(1);
    }
}

iniciarServidor();
