// Testes de ponta a ponta da API (node:test, sem dependências extras).
// Usa o banco configurado no .env, cria seus próprios dados e apaga tudo no final.
//   npm test
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import zlib from "node:zlib";
import app from "../app.js";
import { pool, testarConexao } from "../database/conexao.js";
import { config } from "../config/ambiente.js";
import { prepararPastasUpload } from "../services/arquivos.js";
import { carregarConfiguracoes, salvarConfiguracoes } from "../services/configuracoes.js";
import { garantirAdminFixo } from "../services/adminFixo.js";

// ---------------------------------------------------------------------------
// Utilitários
// ---------------------------------------------------------------------------
class Cliente {
    constructor(base) {
        this.base = base;
        this.cookie = null;
    }

    async req(metodo, caminho, { json, form, cabecalhos = {}, semCsrf = false } = {}) {
        const headers = { ...cabecalhos };
        if (!semCsrf) headers["X-Requested-With"] = "XMLHttpRequest";
        if (this.cookie) headers.cookie = this.cookie;
        let body;
        if (json !== undefined) {
            headers["content-type"] = "application/json";
            body = JSON.stringify(json);
        }
        if (form) body = form;

        const resposta = await fetch(this.base + caminho, { method: metodo, headers, body });
        for (const cookie of resposta.headers.getSetCookie()) {
            const [par] = cookie.split(";");
            if (par.startsWith(`${config.jwt.cookie}=`)) {
                this.cookie = par.endsWith("=") ? null : par;
            }
        }
        const tipo = resposta.headers.get("content-type") || "";
        const dados = tipo.includes("json") ? await resposta.json() : Buffer.from(await resposta.arrayBuffer());
        if (dados?.token) sessoesCriadas.push(JSON.parse(Buffer.from(dados.token.split(".")[1], "base64url")).sid);
        return { status: resposta.status, dados, headers: resposta.headers };
    }

    get(caminho, opcoes) { return this.req("GET", caminho, opcoes); }
    post(caminho, json, opcoes = {}) { return this.req("POST", caminho, { json, ...opcoes }); }
    put(caminho, json, opcoes = {}) { return this.req("PUT", caminho, { json, ...opcoes }); }
    patch(caminho, json) { return this.req("PATCH", caminho, { json }); }
    delete(caminho) { return this.req("DELETE", caminho); }
    enviar(caminho, form, metodo = "POST") { return this.req(metodo, caminho, { form }); }
}

function caixaMp4(tipo, conteudo) {
    const cabecalho = Buffer.alloc(8);
    cabecalho.writeUInt32BE(8 + conteudo.length, 0);
    cabecalho.write(tipo, 4, "latin1");
    return Buffer.concat([cabecalho, conteudo]);
}

// MP4 mínimo com átomos ftyp + moov/mvhd (suficiente para validar assinatura e duração)
function mp4Falso(segundos) {
    const ftyp = caixaMp4("ftyp", Buffer.from("isom\0\0\x02\0isomiso2mp41", "latin1"));
    const mvhd = Buffer.alloc(100);
    mvhd.writeUInt32BE(1000, 12);            // timescale
    mvhd.writeUInt32BE(segundos * 1000, 16); // duration
    return Buffer.concat([ftyp, caixaMp4("moov", caixaMp4("mvhd", mvhd))]);
}

const PNG = Buffer.from(
    "89504e470d0a1a0a0000000d4948445200000001000000010806000000" +
    "1f15c4890000000d49444154789c626001000000ffff03000006000557bfabd40000000049454e44ae426082",
    "hex"
);
const PDF = Buffer.from("%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n");

// Gerador de ZIP simples (sem compressão) para testar a importação
function crc32(buffer) {
    if (zlib.crc32) return zlib.crc32(buffer);
    let crc = ~0;
    for (const byte of buffer) {
        crc ^= byte;
        for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
    return ~crc >>> 0;
}

function criarZip(arquivos) {
    const locais = [];
    const centrais = [];
    let deslocamento = 0;
    for (const [nome, conteudo] of Object.entries(arquivos)) {
        const nomeBuf = Buffer.from(nome, "utf8");
        const crc = crc32(conteudo);
        const local = Buffer.alloc(30);
        local.writeUInt32LE(0x04034b50, 0);
        local.writeUInt16LE(20, 4);
        local.writeUInt16LE(0x0800, 6); // nomes em UTF-8
        local.writeUInt32LE(crc, 14);
        local.writeUInt32LE(conteudo.length, 18);
        local.writeUInt32LE(conteudo.length, 22);
        local.writeUInt16LE(nomeBuf.length, 26);
        locais.push(local, nomeBuf, conteudo);

        const central = Buffer.alloc(46);
        central.writeUInt32LE(0x02014b50, 0);
        central.writeUInt16LE(20, 4);
        central.writeUInt16LE(20, 6);
        central.writeUInt16LE(0x0800, 8);
        central.writeUInt32LE(crc, 16);
        central.writeUInt32LE(conteudo.length, 20);
        central.writeUInt32LE(conteudo.length, 24);
        central.writeUInt16LE(nomeBuf.length, 28);
        central.writeUInt32LE(deslocamento, 42);
        centrais.push(central, nomeBuf);
        deslocamento += 30 + nomeBuf.length + conteudo.length;
    }
    const diretorio = Buffer.concat(centrais);
    const fim = Buffer.alloc(22);
    fim.writeUInt32LE(0x06054b50, 0);
    fim.writeUInt16LE(Object.keys(arquivos).length, 8);
    fim.writeUInt16LE(Object.keys(arquivos).length, 10);
    fim.writeUInt32LE(diretorio.length, 12);
    fim.writeUInt32LE(deslocamento, 16);
    return Buffer.concat([...locais, diretorio, fim]);
}

function formulario(campos = {}, arquivos = []) {
    const form = new FormData();
    for (const [chave, valor] of Object.entries(campos)) form.append(chave, String(valor));
    for (const { campo, nome, conteudo, tipo = "application/octet-stream" } of arquivos) {
        form.append(campo, new Blob([conteudo], { type: tipo }), nome);
    }
    return form;
}

// ---------------------------------------------------------------------------
// Preparação
// ---------------------------------------------------------------------------
let servidor;
let base;
let ultimaAuditoria = 0;
const sessoesCriadas = [];
const sufixo = Date.now().toString(36);
const aluno = { nome: "Aluno Teste", email: `aluno.teste.${sufixo}@exemplo.com`, senha: "SenhaForte123" };
const criados = { cursos: [], usuarios: [] };
const admin = () => new Cliente(base);

before(async () => {
    await testarConexao();
    [[{ ultimaAuditoria }]] = await pool.query("SELECT COALESCE(MAX(id), 0) AS ultimaAuditoria FROM auditoria");
    await prepararPastasUpload();
    await carregarConfiguracoes();
    await garantirAdminFixo();
    await new Promise((resolver) => {
        servidor = app.listen(0, resolver);
    });
    base = `http://127.0.0.1:${servidor.address().port}/api`;
});

after(async () => {
    const adm = admin();
    await adm.post("/auth/login", { email: config.admin.email, senha: config.admin.senha });
    for (const id of criados.cursos) await adm.delete(`/admin/cursos/${id}`);
    for (const id of criados.usuarios) await adm.delete(`/admin/usuarios/${id}`);
    await salvarConfiguracoes({ registros_abertos: true, login_alunos: true });
    // Remove o que os testes deixaram: registros de auditoria e sessões abertas
    await pool.query("DELETE FROM auditoria WHERE id > ?", [ultimaAuditoria]);
    if (sessoesCriadas.length) await pool.query("DELETE FROM sessoes WHERE id IN (?)", [sessoesCriadas]);
    servidor.close();
    await pool.end();
});

// ---------------------------------------------------------------------------
// Testes
// ---------------------------------------------------------------------------
const adm = new Cliente("");
const estudante = new Cliente("");
const estado = {};

test("API e banco respondem em /api/saude", async () => {
    adm.base = base;
    estudante.base = base;
    const { status, dados } = await adm.get("/saude");
    assert.equal(status, 200);
    assert.equal(dados.banco, "conectado");
});

test("Rotas protegidas exigem login (401) e admin (403)", async () => {
    assert.equal((await new Cliente(base).get("/aluno/cursos")).status, 401);
    assert.equal((await new Cliente(base).get("/admin/dashboard")).status, 401);
});

test("Cadastro cria conta PENDENTE que ainda não consegue entrar", async () => {
    const fraca = await estudante.post("/auth/registro", { ...aluno, senha: "123" });
    assert.equal(fraca.status, 400);

    const cadastro = await estudante.post("/auth/registro", aluno);
    assert.equal(cadastro.status, 201, JSON.stringify(cadastro.dados));
    criados.usuarios.push(cadastro.dados.id);
    estado.alunoId = cadastro.dados.id;

    const duplicado = await estudante.post("/auth/registro", aluno);
    assert.equal(duplicado.status, 409);

    const login = await estudante.post("/auth/login", { email: aluno.email, senha: aluno.senha });
    assert.equal(login.status, 403);
    assert.equal(login.dados.codigo, "CONTA_PENDENTE");
});

test("Senha errada retorna mensagem genérica (401)", async () => {
    const login = await new Cliente(base).post("/auth/login", { email: config.admin.email, senha: "errada123" });
    assert.equal(login.status, 401);
    assert.equal(login.dados.mensagem, "E-mail ou senha inválidos.");
    await pool.query("UPDATE usuarios SET tentativas_login = 0 WHERE email = ?", [config.admin.email]);
});

test("Administrador fixo faz login e recebe cookie httpOnly com o JWT", async () => {
    const login = await adm.post("/auth/login", { email: config.admin.email, senha: config.admin.senha });
    assert.equal(login.status, 200);
    assert.ok(adm.cookie, "cookie de sessão definido");
    assert.match(login.headers.get("set-cookie"), /HttpOnly/i);
    assert.match(login.headers.get("set-cookie"), /SameSite=Strict/i);
    assert.equal(login.dados.token.split(".").length, 3, "token JWT com 3 partes");

    const me = await adm.get("/auth/me");
    assert.equal(me.dados.usuario.papel, "admin");
    assert.equal(me.dados.usuario.admin_fixo, true);
});

test("Token também funciona via cabeçalho Authorization: Bearer", async () => {
    const login = await new Cliente(base).post("/auth/login", { email: config.admin.email, senha: config.admin.senha });
    const resposta = await fetch(`${base}/auth/me`, { headers: { Authorization: `Bearer ${login.dados.token}` } });
    assert.equal(resposta.status, 200);
});

test("Proteção CSRF bloqueia alteração sem o cabeçalho X-Requested-With", async () => {
    const resposta = await adm.req("POST", "/admin/categorias", { json: { nome: "CSRF" }, semCsrf: true });
    assert.equal(resposta.status, 403);
});

test("Admin fixo é protegido contra exclusão e bloqueio", async () => {
    const [[linha]] = await pool.query("SELECT id FROM usuarios WHERE email = ?", [config.admin.email]);
    assert.equal((await adm.delete(`/admin/usuarios/${linha.id}`)).status, 403);
    assert.equal((await adm.patch(`/admin/usuarios/${linha.id}/status`, { status: "bloqueado" })).status, 403);
});

test("Admin aprova o cadastro e o aluno consegue entrar", async () => {
    const lista = await adm.get("/admin/usuarios?status=pendente");
    assert.ok(lista.dados.dados.some((u) => u.id === estado.alunoId));

    const aprovar = await adm.patch(`/admin/usuarios/${estado.alunoId}/status`, { status: "ativo" });
    assert.equal(aprovar.status, 200);

    const login = await estudante.post("/auth/login", { email: aluno.email, senha: aluno.senha });
    assert.equal(login.status, 200);
    assert.equal((await estudante.get("/auth/me")).dados.usuario.status, "ativo");
    assert.equal((await estudante.get("/admin/dashboard")).status, 403, "aluno não acessa o painel");
});

test("CRUD de curso: cadastrar (com capa), buscar, alterar e listar", async () => {
    const criar = await adm.enviar("/admin/cursos", formulario(
        { titulo: `Curso de Teste ${sufixo}`, resumo: "Resumo", nivel: "iniciante", categoria_id: 1, publicado: "false" },
        [{ campo: "capa", nome: "capa.png", conteudo: PNG, tipo: "image/png" }]
    ));
    assert.equal(criar.status, 201, JSON.stringify(criar.dados));
    estado.cursoId = criar.dados.id;
    criados.cursos.push(estado.cursoId);

    const buscar = await adm.get(`/admin/cursos/${estado.cursoId}`);
    assert.equal(buscar.status, 200);
    assert.match(buscar.dados.capa, /^\/uploads\/capas\/.+\.png$/);
    const imagem = await fetch(base.replace("/api", "") + buscar.dados.capa);
    assert.equal(imagem.status, 200);

    const alterar = await adm.enviar(`/admin/cursos/${estado.cursoId}`, formulario({
        titulo: `Curso Alterado ${sufixo}`, nivel: "avancado", publicado: "true", destaque: "true"
    }), "PUT");
    assert.equal(alterar.status, 200);

    const lista = await adm.get("/admin/cursos");
    const curso = lista.dados.find((c) => c.id === estado.cursoId);
    assert.equal(curso.titulo, `Curso Alterado ${sufixo}`);
    assert.equal(curso.publicado, true);

    assert.equal((await adm.get("/admin/cursos/99999999")).status, 404);
});

test("Módulos e aulas: texto, vídeo externo, upload de vídeo e validações", async () => {
    const modulo = await adm.post(`/admin/cursos/${estado.cursoId}/modulos`, { titulo: "Módulo 1" });
    assert.equal(modulo.status, 201);
    estado.moduloId = modulo.dados.id;

    const texto = await adm.enviar(`/admin/modulos/${estado.moduloId}/aulas`, formulario({
        titulo: "Aula de texto", tipo: "texto", conteudo: "# Olá\n\nConteúdo **markdown**.", duracao_segundos: 300
    }));
    assert.equal(texto.status, 201, JSON.stringify(texto.dados));

    const externoInvalido = await adm.enviar(`/admin/modulos/${estado.moduloId}/aulas`, formulario({
        titulo: "Externo", tipo: "externo", url_externa: "https://exemplo.com/video"
    }));
    assert.equal(externoInvalido.status, 400);

    const externo = await adm.enviar(`/admin/modulos/${estado.moduloId}/aulas`, formulario({
        titulo: "Vídeo do YouTube", tipo: "externo", url_externa: "https://youtu.be/PkZNo7MFNFg"
    }));
    assert.equal(externo.status, 201);

    const video = await adm.enviar(`/admin/modulos/${estado.moduloId}/aulas`, formulario(
        { titulo: "Aula em vídeo", tipo: "video" },
        [{ campo: "arquivo", nome: "aula.mp4", conteudo: mp4Falso(95), tipo: "video/mp4" }]
    ));
    assert.equal(video.status, 201, JSON.stringify(video.dados));
    estado.videoId = video.dados.id;
    const detalhe = await adm.get(`/admin/aulas/${estado.videoId}`);
    assert.equal(detalhe.dados.duracao_segundos, 95, "duração lida do MP4");

    const falso = await adm.enviar(`/admin/modulos/${estado.moduloId}/aulas`, formulario(
        { titulo: "Malicioso", tipo: "video" },
        [{ campo: "arquivo", nome: "virus.mp4", conteudo: Buffer.from("MZ executável disfarçado"), tipo: "video/mp4" }]
    ));
    assert.equal(falso.status, 415, "conteúdo que não é MP4 é rejeitado");

    const extensao = await adm.enviar(`/admin/modulos/${estado.moduloId}/aulas`, formulario(
        { titulo: "Script", tipo: "arquivo" },
        [{ campo: "arquivo", nome: "pagina.html", conteudo: Buffer.from("<script>alert(1)</script>"), tipo: "text/html" }]
    ));
    assert.equal(extensao.status, 415, "extensão fora da lista branca é rejeitada");
});

test("Upload em massa cria uma aula por arquivo, em ordem natural", async () => {
    const lote = await adm.enviar(`/admin/modulos/${estado.moduloId}/aulas/lote`, formulario(
        { duracoes: JSON.stringify({ "10 - Encerramento.mp4": 42 }) },
        [
            { campo: "arquivos", nome: "10 - Encerramento.mp4", conteudo: mp4Falso(30) },
            { campo: "arquivos", nome: "2 - Apostila_do_modulo.pdf", conteudo: PDF },
            { campo: "arquivos", nome: "1 - Introdução.mp4", conteudo: mp4Falso(61) }
        ]
    ));
    assert.equal(lote.status, 201, JSON.stringify(lote.dados));
    assert.deepEqual(lote.dados.aulas.map((a) => a.titulo), ["Introdução", "Apostila do modulo", "Encerramento"]);
    assert.deepEqual(lote.dados.aulas.map((a) => a.tipo), ["video", "arquivo", "video"]);

    const curso = await adm.get(`/admin/cursos/${estado.cursoId}`);
    const aulas = curso.dados.modulos[0].aulas;
    assert.equal(aulas.find((a) => a.titulo === "Encerramento").duracao_segundos, 42);
    assert.equal(aulas.find((a) => a.titulo === "Introdução").duracao_segundos, 61);

    const ids = aulas.map((a) => a.id).reverse();
    assert.equal((await adm.put(`/admin/modulos/${estado.moduloId}/aulas/ordem`, { ids })).status, 200);
    const reordenado = await adm.get(`/admin/cursos/${estado.cursoId}`);
    assert.deepEqual(reordenado.dados.modulos[0].aulas.map((a) => a.id), ids);
});

test("Materiais de apoio podem ser anexados e baixados pelo aluno", async () => {
    const envio = await adm.enviar(`/admin/aulas/${estado.videoId}/materiais`, formulario({}, [
        { campo: "arquivos", nome: "exercicios.pdf", conteudo: PDF }
    ]));
    assert.equal(envio.status, 201);
    const aula = await adm.get(`/admin/aulas/${estado.videoId}`);
    estado.materialId = aula.dados.materiais[0].id;

    const download = await estudante.get(`/aluno/materiais/${estado.materialId}`);
    assert.equal(download.status, 200);
    assert.match(download.headers.get("content-disposition"), /attachment/);
});

test("Importação de curso via ZIP (pastas viram módulos, arquivos viram aulas)", async () => {
    const zip = criarZip({
        "Curso ZIP/01 - Primeiros passos/01 - Boas-vindas.mp4": mp4Falso(120),
        "Curso ZIP/01 - Primeiros passos/02 - Leitura.md": Buffer.from("# Leitura\n\nTexto da aula."),
        "Curso ZIP/02 - Avançado/Material.pdf": PDF,
        "Curso ZIP/02 - Avançado/ignorar.exe": Buffer.from("MZ"),
        "__MACOSX/lixo": Buffer.from("x")
    });
    const importacao = await adm.enviar("/admin/importacao/zip", formulario(
        { titulo: `Importado ${sufixo}` },
        [{ campo: "arquivo", nome: "curso.zip", conteudo: zip, tipo: "application/zip" }]
    ));
    assert.equal(importacao.status, 201, JSON.stringify(importacao.dados));
    criados.cursos.push(importacao.dados.curso_id);
    assert.equal(importacao.dados.modulos_criados, 2);
    assert.equal(importacao.dados.aulas_criadas, 3);
    assert.equal(importacao.dados.ignorados.length, 1);

    const curso = await adm.get(`/admin/cursos/${importacao.dados.curso_id}`);
    assert.deepEqual(curso.dados.modulos.map((m) => m.titulo), ["Primeiros passos", "Avançado"]);
    assert.equal(curso.dados.modulos[0].aulas[0].duracao_segundos, 120);
});

test("Aluno assiste: conteúdo, streaming com Range, progresso e anotações", async () => {
    const conteudo = await estudante.get(`/aluno/cursos/${estado.cursoId}/conteudo`);
    assert.equal(conteudo.status, 200);
    estado.aulas = conteudo.dados.modulos.flatMap((m) => m.aulas);
    assert.ok(estado.aulas.length >= 6);

    const aula = await estudante.get(`/aluno/aulas/${estado.videoId}`);
    assert.equal(aula.status, 200);
    assert.equal(aula.dados.url_arquivo, `/api/aluno/aulas/${estado.videoId}/arquivo`);

    const parcial = await estudante.req("GET", `/aluno/aulas/${estado.videoId}/arquivo`, { cabecalhos: { Range: "bytes=0-9" } });
    assert.equal(parcial.status, 206, "streaming parcial (Range)");
    assert.equal(parcial.dados.length, 10);

    assert.equal((await new Cliente(base).get(`/aluno/aulas/${estado.videoId}/arquivo`)).status, 401, "vídeo protegido");

    assert.equal((await estudante.put(`/aluno/aulas/${estado.videoId}/posicao`, { posicao_segundos: 37 })).status, 200);
    assert.equal((await estudante.put(`/aluno/aulas/${estado.videoId}/anotacao`, { texto: "Minha anotação" })).status, 200);
    const recarregada = await estudante.get(`/aluno/aulas/${estado.videoId}`);
    assert.equal(recarregada.dados.progresso.posicao_segundos, 37);
    assert.equal(recarregada.dados.anotacao.texto, "Minha anotação");
});

test("Certificado só é emitido com 100% e pode ser verificado publicamente", async () => {
    const cedo = await estudante.post(`/aluno/cursos/${estado.cursoId}/certificado`);
    assert.equal(cedo.status, 400);

    let ultima;
    for (const aula of estado.aulas) {
        ultima = await estudante.put(`/aluno/aulas/${aula.id}/conclusao`, { concluida: true });
        assert.equal(ultima.status, 200);
    }
    assert.equal(ultima.dados.curso_concluido, true);
    assert.equal(ultima.dados.progresso.percentual, 100);

    const emissao = await estudante.post(`/aluno/cursos/${estado.cursoId}/certificado`);
    assert.equal(emissao.status, 201);
    const verificacao = await new Cliente(base).get(`/publico/certificados/${emissao.dados.codigo}`);
    assert.equal(verificacao.status, 200);
    assert.equal(verificacao.dados.nome_aluno, aluno.nome);
    assert.equal((await new Cliente(base).get("/publico/certificados/AAAA-BBBB-CCCC")).status, 404);
});

test("Admin fecha cadastros e suspende o login de alunos", async () => {
    await adm.put("/admin/configuracoes", { registros_abertos: false });
    const cadastro = await new Cliente(base).post("/auth/registro", { ...aluno, email: `outro.${sufixo}@exemplo.com` });
    assert.equal(cadastro.status, 403);

    await adm.put("/admin/configuracoes", { registros_abertos: true, login_alunos: false });
    const me = await estudante.get("/auth/me");
    assert.equal(me.status, 403);
    assert.equal(me.dados.codigo, "LOGIN_SUSPENSO");
    assert.equal((await adm.get("/auth/me")).status, 200, "admin continua com acesso");

    await adm.put("/admin/configuracoes", { login_alunos: true });
    await estudante.post("/auth/login", { email: aluno.email, senha: aluno.senha });
    assert.equal((await estudante.get("/auth/me")).status, 200);
});

test("Configurações rejeitam links perigosos (javascript:)", async () => {
    const resposta = await adm.put("/admin/configuracoes", { rodape_links: [{ rotulo: "XSS", url: "javascript:alert(1)" }] });
    assert.equal(resposta.status, 400);
});

test("Bloquear o aluno corta o login imediatamente", async () => {
    const bloquear = await adm.patch(`/admin/usuarios/${estado.alunoId}/status`, { status: "bloqueado", motivo: `Teste ${sufixo}` });
    assert.equal(bloquear.status, 200);

    const me = await estudante.get("/auth/me");
    assert.equal(me.status, 403);
    assert.match(me.dados.mensagem, /bloqueado/);

    const login = await estudante.post("/auth/login", { email: aluno.email, senha: aluno.senha });
    assert.equal(login.status, 403);
    assert.equal(login.dados.codigo, "CONTA_BLOQUEADO");
});

test("Logout encerra a sessão no servidor (o token deixa de valer)", async () => {
    const cliente = new Cliente(base);
    const login = await cliente.post("/auth/login", { email: config.admin.email, senha: config.admin.senha });
    const token = login.dados.token;
    await cliente.post("/auth/logout");
    const resposta = await fetch(`${base}/auth/me`, { headers: { Authorization: `Bearer ${token}` } });
    assert.equal(resposta.status, 401);
});

test("Excluir curso remove módulos, aulas e arquivos (DELETE)", async () => {
    const excluir = await adm.delete(`/admin/cursos/${estado.cursoId}`);
    assert.equal(excluir.status, 200);
    criados.cursos = criados.cursos.filter((id) => id !== estado.cursoId);
    assert.equal((await adm.get(`/admin/cursos/${estado.cursoId}`)).status, 404);
    const [aulas] = await pool.query("SELECT id FROM aulas WHERE modulo_id = ?", [estado.moduloId]);
    assert.equal(aulas.length, 0);
});
