// Configurações do site editadas pelo administrador: identidade visual, página inicial,
// rodapé, redes sociais e controles de acesso (abrir/fechar cadastros, suspender login).
import { obterConfiguracoes, salvarConfiguracoes, definirConfiguracaoDeArquivo } from "../services/configuracoes.js";
import { registrarAuditoria } from "../services/auditoria.js";
import { caminhoPublico, removerArquivoPublico } from "../services/arquivos.js";
import { ErroHttp } from "../services/validacao.js";

// GET /api/admin/configuracoes
async function obter(req, res) {
    res.status(200).json(obterConfiguracoes());
}

// PUT /api/admin/configuracoes  { nome_site, cor_primaria, rodape_links, registros_abertos, ... }
async function atualizar(req, res) {
    const anteriores = { ...obterConfiguracoes() };
    const alteradas = await salvarConfiguracoes(req.body);
    const atuais = obterConfiguracoes();

    await registrarAuditoria(req, "configuracoes.atualizadas", `Configurações alteradas: ${alteradas.join(", ")}`);
    if (anteriores.registros_abertos !== atuais.registros_abertos) {
        await registrarAuditoria(req, atuais.registros_abertos ? "acesso.registros_abertos" : "acesso.registros_fechados",
            atuais.registros_abertos ? "Novos cadastros foram liberados" : "Novos cadastros foram bloqueados");
    }
    if (anteriores.login_alunos !== atuais.login_alunos) {
        await registrarAuditoria(req, atuais.login_alunos ? "acesso.login_liberado" : "acesso.login_suspenso",
            atuais.login_alunos ? "Login de alunos liberado" : "Login de todos os alunos suspenso");
    }

    res.status(200).json({ mensagem: "Configurações salvas com sucesso.", configuracoes: atuais });
}

// POST /api/admin/configuracoes/logo | /favicon  (multipart: "arquivo")
function enviarImagem(chave, rotulo) {
    return async function (req, res) {
        if (!req.file) throw new ErroHttp(400, "Selecione uma imagem.");
        const anterior = obterConfiguracoes()[chave];
        const caminho = caminhoPublico("marca", req.file.filename);

        await definirConfiguracaoDeArquivo(chave, caminho);
        await removerArquivoPublico(anterior);
        await registrarAuditoria(req, `configuracoes.${chave}`, `${rotulo} do site atualizado`);

        res.status(200).json({ mensagem: `${rotulo} atualizado com sucesso.`, [chave]: caminho });
    };
}

// DELETE /api/admin/configuracoes/logo | /favicon
function removerImagem(chave, rotulo) {
    return async function (req, res) {
        const anterior = obterConfiguracoes()[chave];
        await definirConfiguracaoDeArquivo(chave, "");
        await removerArquivoPublico(anterior);
        await registrarAuditoria(req, `configuracoes.${chave}_removido`, `${rotulo} do site removido`);
        res.status(200).json({ mensagem: `${rotulo} removido. O padrão será usado.` });
    };
}

const enviarLogo = enviarImagem("logo", "Logo");
const removerLogo = removerImagem("logo", "Logo");
const enviarFavicon = enviarImagem("favicon", "Ícone");
const removerFavicon = removerImagem("favicon", "Ícone");

export { obter, atualizar, enviarLogo, removerLogo, enviarFavicon, removerFavicon };
