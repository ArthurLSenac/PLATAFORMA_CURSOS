// Tudo relacionado a senhas: hash com bcrypt, comparação e política de força.
import bcrypt from "bcryptjs";
import { ErroHttp } from "./validacao.js";

const CUSTO_BCRYPT = 12;

// Hash "falso" usado quando o e-mail não existe: assim o login leva o mesmo
// tempo com e sem usuário, impedindo descobrir e-mails cadastrados pelo tempo de resposta.
const HASH_FALSO = bcrypt.hashSync("usuario-inexistente-tempo-constante", CUSTO_BCRYPT);

export function gerarHash(senha) {
    return bcrypt.hash(senha, CUSTO_BCRYPT);
}

export async function compararSenha(senha, hash) {
    if (typeof senha !== "string" || senha.length === 0) return false;
    const confere = await bcrypt.compare(senha, hash || HASH_FALSO);
    return Boolean(hash) && confere;
}

// Política: 8+ caracteres, pelo menos uma letra e um número (máx. 72 bytes, limite do bcrypt)
export function validarForcaSenha(senha, campo = "senha") {
    if (typeof senha !== "string" || senha.length === 0) {
        throw new ErroHttp(400, `O campo "${campo}" é obrigatório.`);
    }
    if (senha.length < 8) {
        throw new ErroHttp(400, "A senha deve ter pelo menos 8 caracteres.");
    }
    if (Buffer.byteLength(senha, "utf8") > 72) {
        throw new ErroHttp(400, "A senha deve ter no máximo 72 caracteres.");
    }
    if (!/\p{L}/u.test(senha) || !/\d/.test(senha)) {
        throw new ErroHttp(400, "A senha deve conter letras e números.");
    }
    return senha;
}
