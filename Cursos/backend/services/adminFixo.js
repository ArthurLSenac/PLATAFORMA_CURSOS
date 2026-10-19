// Garante que o administrador fixo (definido no .env) exista e esteja sincronizado.
// É chamado toda vez que o servidor inicia (server.js).
//  • Se não existir → é criado já ativo.
//  • Se a ADMIN_SENHA do .env mudou → o hash é atualizado e as sessões antigas são encerradas.
//  • Se o ADMIN_EMAIL mudou → a conta antiga perde o papel de administrador.
import { pool } from "../database/conexao.js";
import { config } from "../config/ambiente.js";
import { gerarHash, compararSenha } from "./senha.js";
import { revogarSessoesDoUsuario } from "./tokens.js";

export async function garantirAdminFixo() {
    const { nome, email, senha } = config.admin;

    if (senha.length < 8) {
        throw new Error("ADMIN_SENHA no .env deve ter pelo menos 8 caracteres.");
    }

    const [linhas] = await pool.query("SELECT id, senha_hash FROM usuarios WHERE email = ?", [email]);

    if (linhas.length === 0) {
        const hash = await gerarHash(senha);
        await pool.query(
            `INSERT INTO usuarios (nome, email, senha_hash, papel, status, admin_fixo, aprovado_em)
             VALUES (?, ?, ?, 'admin', 'ativo', 1, NOW())`,
            [nome, email, hash]
        );
        console.log(`✔ Administrador fixo criado (${email}).`);
    } else {
        const admin = linhas[0];
        const senhaIgual = await compararSenha(senha, admin.senha_hash);
        const hash = senhaIgual ? admin.senha_hash : await gerarHash(senha);
        await pool.query(
            `UPDATE usuarios
                SET nome = ?, senha_hash = ?, papel = 'admin', status = 'ativo', admin_fixo = 1,
                    tentativas_login = 0, bloqueado_ate = NULL, motivo_status = NULL
              WHERE id = ?`,
            [nome, hash, admin.id]
        );
        if (!senhaIgual) {
            await revogarSessoesDoUsuario(admin.id);
            console.log("✔ Senha do administrador fixo atualizada a partir do .env.");
        }
    }

    // Só pode existir UM administrador: o do .env.
    const [antigos] = await pool.query(
        "SELECT id FROM usuarios WHERE (admin_fixo = 1 OR papel = 'admin') AND email <> ?",
        [email]
    );
    for (const antigo of antigos) {
        await pool.query(
            `UPDATE usuarios
                SET admin_fixo = 0, papel = 'aluno', status = 'bloqueado',
                    motivo_status = 'Conta de administrador desativada: o administrador fixo foi alterado no .env.'
              WHERE id = ?`,
            [antigo.id]
        );
        await revogarSessoesDoUsuario(antigo.id);
    }

    console.log(`✔ Login do administrador: ${email}`);
}
