// Tratamento centralizado de erros.
// O Express 5 encaminha automaticamente para cá qualquer erro lançado dentro de
// um controller async — por isso os controllers podem simplesmente usar "throw".
import multer from "multer";
import { ErroHttp } from "../services/validacao.js";

const MENSAGENS_MULTER = {
    LIMIT_FILE_COUNT: "Quantidade de arquivos acima do permitido.",
    LIMIT_UNEXPECTED_FILE: "Campo de arquivo inesperado no formulário.",
    LIMIT_FIELD_VALUE: "Um dos campos de texto é grande demais.",
    LIMIT_PART_COUNT: "Formulário com partes demais.",
    LIMIT_FIELD_COUNT: "Formulário com campos demais."
};

export function rotaApiNaoEncontrada(req, res) {
    res.status(404).json({ mensagem: `Rota não encontrada: ${req.method} ${req.originalUrl.split("?")[0]}` });
}

export function tratarErros(erro, req, res, next) {
    if (res.headersSent) {
        return next(erro);
    }

    // Erros de validação/regra de negócio lançados pelos controllers
    if (erro instanceof ErroHttp) {
        return res.status(erro.status).json({ mensagem: erro.message, ...erro.extra });
    }

    // Erros de upload
    if (erro instanceof multer.MulterError) {
        if (erro.code === "LIMIT_FILE_SIZE") {
            return res.status(413).json({ mensagem: `Arquivo maior que o limite permitido (${req.limiteUploadMB} MB).` });
        }
        return res.status(400).json({ mensagem: MENSAGENS_MULTER[erro.code] || "Falha no envio do arquivo." });
    }

    // Corpo da requisição inválido
    if (erro.type === "entity.parse.failed") {
        return res.status(400).json({ mensagem: "O corpo da requisição não é um JSON válido." });
    }
    if (erro.type === "entity.too.large") {
        return res.status(413).json({ mensagem: "O corpo da requisição é grande demais." });
    }

    // Erros do MySQL
    if (erro.code === "ER_DUP_ENTRY") {
        return res.status(409).json({ mensagem: "Já existe um registro com esses dados." });
    }
    if (erro.code === "ER_NO_REFERENCED_ROW_2") {
        return res.status(400).json({ mensagem: "Um dos registros relacionados não existe." });
    }
    if (["ECONNREFUSED", "PROTOCOL_CONNECTION_LOST", "ER_ACCESS_DENIED_ERROR", "ETIMEDOUT", "ENOTFOUND"].includes(erro.code)) {
        console.error("Banco de dados indisponível:", erro.code);
        return res.status(503).json({ mensagem: "Banco de dados indisponível no momento. Tente novamente em instantes." });
    }

    console.error(`Erro em ${req.method} ${req.originalUrl}:`, erro);
    return res.status(500).json({ mensagem: "Erro interno no servidor. Tente novamente." });
}
