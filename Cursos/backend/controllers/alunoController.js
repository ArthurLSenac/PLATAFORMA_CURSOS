// Área do aluno: meus cursos, conteúdo das aulas, progresso, anotações e certificados.
// Todas as rotas daqui passam antes pelo middleware exigirLogin (usuário ativo e aprovado).
import crypto from "node:crypto";
import path from "node:path";
import { pool } from "../database/conexao.js";
import { registrarAuditoria } from "../services/auditoria.js";
import { interpretarVideoExterno } from "../services/videoExterno.js";
import { PASTAS, caminhoPrivado, extensaoDe, existeArquivo } from "../services/arquivos.js";
import { ErroHttp, exigirId, inteiro, booleano } from "../services/validacao.js";

const ehAdmin = (usuario) => usuario.papel === "admin";

// Busca uma aula verificando se o usuário pode vê-la (curso e aula publicados; admin vê tudo)
async function buscarAulaAcessivel(aulaId, usuario) {
    const [linhas] = await pool.query(
        `SELECT a.*, m.curso_id, m.titulo AS modulo_titulo, c.titulo AS curso_titulo, c.publicado AS curso_publicado
           FROM aulas a
           JOIN modulos m ON m.id = a.modulo_id
           JOIN cursos c ON c.id = m.curso_id
          WHERE a.id = ?`,
        [aulaId]
    );
    const aula = linhas[0];
    if (!aula) return null;
    if (!ehAdmin(usuario) && (!aula.curso_publicado || !aula.publicado)) return null;
    return aula;
}

async function exigirAulaAcessivel(aulaId, usuario) {
    const aula = await buscarAulaAcessivel(aulaId, usuario);
    if (!aula) throw new ErroHttp(404, "Aula não encontrada ou indisponível.");
    return aula;
}

async function calcularProgresso(usuarioId, cursoId) {
    const [[linha]] = await pool.query(
        `SELECT COUNT(*) AS total,
                COALESCE(SUM(pa.concluida), 0) AS concluidas,
                COALESCE(SUM(a.duracao_segundos), 0) AS duracao_total
           FROM aulas a
           JOIN modulos m ON m.id = a.modulo_id
           LEFT JOIN progresso_aulas pa ON pa.aula_id = a.id AND pa.usuario_id = ?
          WHERE m.curso_id = ? AND a.publicado = 1`,
        [usuarioId, cursoId]
    );
    const total = Number(linha.total);
    const concluidas = Number(linha.concluidas);
    return {
        total,
        concluidas,
        duracao_total: Number(linha.duracao_total),
        percentual: total ? Math.round((concluidas / total) * 100) : 0
    };
}

async function garantirMatricula(usuario, cursoId, aulaId = null) {
    if (ehAdmin(usuario)) return;
    await pool.query(
        `INSERT INTO matriculas (usuario_id, curso_id, ultima_aula_id, ultimo_acesso) VALUES (?, ?, ?, NOW())
         ON DUPLICATE KEY UPDATE ultimo_acesso = NOW(), ultima_aula_id = COALESCE(VALUES(ultima_aula_id), ultima_aula_id)`,
        [usuario.id, cursoId, aulaId]
    );
}

// GET /api/aluno/painel  → números do painel inicial do aluno
async function resumoDoPainel(req, res) {
    const usuarioId = req.usuario.id;
    const [[numeros]] = await pool.query(
        `SELECT
            (SELECT COUNT(*) FROM matriculas mt JOIN cursos c ON c.id = mt.curso_id
              WHERE mt.usuario_id = ? AND c.publicado = 1 AND mt.concluido_em IS NULL) AS cursos_em_andamento,
            (SELECT COUNT(*) FROM matriculas mt WHERE mt.usuario_id = ? AND mt.concluido_em IS NOT NULL) AS cursos_concluidos,
            (SELECT COUNT(*) FROM progresso_aulas WHERE usuario_id = ? AND concluida = 1) AS aulas_concluidas,
            (SELECT COALESCE(SUM(a.duracao_segundos), 0) FROM progresso_aulas pa JOIN aulas a ON a.id = pa.aula_id
              WHERE pa.usuario_id = ? AND pa.concluida = 1) AS segundos_estudados,
            (SELECT COUNT(*) FROM certificados WHERE usuario_id = ?) AS certificados`,
        [usuarioId, usuarioId, usuarioId, usuarioId, usuarioId]
    );
    res.status(200).json(numeros);
}

// GET /api/aluno/cursos  → cursos em que o aluno está matriculado, com progresso
async function meusCursos(req, res) {
    const [cursos] = await pool.query(
        `SELECT v.id, v.titulo, v.resumo, v.capa, v.nivel, v.instrutor, v.categoria_nome, v.categoria_cor,
                v.total_modulos, v.total_aulas, v.duracao_segundos,
                mt.ultimo_acesso, mt.concluido_em, mt.ultima_aula_id, mt.criado_em AS matriculado_em,
                ua.titulo AS ultima_aula_titulo,
                (SELECT COUNT(*) FROM progresso_aulas pa
                   JOIN aulas a ON a.id = pa.aula_id JOIN modulos m ON m.id = a.modulo_id
                  WHERE pa.usuario_id = mt.usuario_id AND m.curso_id = mt.curso_id
                    AND pa.concluida = 1 AND a.publicado = 1) AS aulas_concluidas,
                (SELECT codigo FROM certificados ce
                  WHERE ce.usuario_id = mt.usuario_id AND ce.curso_id = mt.curso_id) AS certificado_codigo
           FROM matriculas mt
           JOIN vw_cursos_resumo v ON v.id = mt.curso_id
           LEFT JOIN aulas ua ON ua.id = mt.ultima_aula_id
          WHERE mt.usuario_id = ? AND v.publicado = 1
          ORDER BY mt.ultimo_acesso DESC`,
        [req.usuario.id]
    );
    res.status(200).json(cursos.map((curso) => ({
        ...curso,
        percentual: curso.total_aulas ? Math.round((curso.aulas_concluidas / curso.total_aulas) * 100) : 0
    })));
}

// POST /api/aluno/cursos/:id/matricula
async function matricular(req, res) {
    const cursoId = exigirId(req.params.id);
    const [cursos] = await pool.query("SELECT id, titulo FROM cursos WHERE id = ? AND publicado = 1", [cursoId]);
    if (cursos.length === 0) {
        return res.status(404).json({ mensagem: "Curso não encontrado." });
    }
    const [resultado] = await pool.query(
        "INSERT IGNORE INTO matriculas (usuario_id, curso_id) VALUES (?, ?)",
        [req.usuario.id, cursoId]
    );
    if (resultado.affectedRows > 0) {
        await registrarAuditoria(req, "matricula.criada", `Matrícula no curso "${cursos[0].titulo}"`);
    }
    res.status(resultado.affectedRows > 0 ? 201 : 200).json({ mensagem: "Matrícula confirmada. Bons estudos!" });
}

// GET /api/aluno/cursos/:id/conteudo  → módulos e aulas com o progresso do aluno
async function conteudoDoCurso(req, res) {
    const cursoId = exigirId(req.params.id);
    const admin = ehAdmin(req.usuario);

    const [cursos] = await pool.query(
        `SELECT v.*, c.descricao FROM vw_cursos_resumo v JOIN cursos c ON c.id = v.id WHERE v.id = ?`,
        [cursoId]
    );
    const curso = cursos[0];
    if (!curso || (!curso.publicado && !admin)) {
        return res.status(404).json({ mensagem: "Curso não encontrado ou indisponível." });
    }

    await garantirMatricula(req.usuario, cursoId);

    const [modulos] = await pool.query(
        "SELECT id, titulo, descricao, ordem FROM modulos WHERE curso_id = ? ORDER BY ordem, id",
        [cursoId]
    );
    const [aulas] = await pool.query(
        `SELECT a.id, a.modulo_id, a.titulo, a.tipo, a.duracao_segundos, a.publicado,
                COALESCE(pa.concluida, 0) AS concluida, COALESCE(pa.posicao_segundos, 0) AS posicao_segundos
           FROM aulas a
           JOIN modulos m ON m.id = a.modulo_id
           LEFT JOIN progresso_aulas pa ON pa.aula_id = a.id AND pa.usuario_id = ?
          WHERE m.curso_id = ? ${admin ? "" : "AND a.publicado = 1"}
          ORDER BY a.ordem, a.id`,
        [req.usuario.id, cursoId]
    );

    const [matriculas] = await pool.query(
        "SELECT ultima_aula_id, concluido_em FROM matriculas WHERE usuario_id = ? AND curso_id = ?",
        [req.usuario.id, cursoId]
    );
    const [certificados] = await pool.query(
        "SELECT codigo FROM certificados WHERE usuario_id = ? AND curso_id = ?",
        [req.usuario.id, cursoId]
    );

    curso.modulos = modulos.map((modulo) => ({
        ...modulo,
        aulas: aulas
            .filter((aula) => aula.modulo_id === modulo.id)
            .map((aula) => ({ ...aula, concluida: Boolean(aula.concluida), publicado: Boolean(aula.publicado) }))
    }));
    curso.progresso = await calcularProgresso(req.usuario.id, cursoId);
    curso.ultima_aula_id = matriculas[0]?.ultima_aula_id ?? null;
    curso.certificado_codigo = certificados[0]?.codigo ?? null;
    curso.modo_previa = admin;

    res.status(200).json(curso);
}

// GET /api/aluno/aulas/:id  → conteúdo completo de uma aula
async function detalharAula(req, res) {
    const aulaId = exigirId(req.params.id);
    const aula = await exigirAulaAcessivel(aulaId, req.usuario);
    const admin = ehAdmin(req.usuario);

    const [materiais] = await pool.query(
        "SELECT id, nome, tamanho, criado_em FROM materiais WHERE aula_id = ? ORDER BY id",
        [aulaId]
    );
    const [progressos] = await pool.query(
        "SELECT concluida, posicao_segundos FROM progresso_aulas WHERE usuario_id = ? AND aula_id = ?",
        [req.usuario.id, aulaId]
    );
    const [anotacoes] = await pool.query(
        "SELECT texto, atualizado_em FROM anotacoes WHERE usuario_id = ? AND aula_id = ?",
        [req.usuario.id, aulaId]
    );

    // Sequência de aulas do curso, para os botões "anterior" e "próxima"
    const [sequencia] = await pool.query(
        `SELECT a.id, a.titulo
           FROM aulas a JOIN modulos m ON m.id = a.modulo_id
          WHERE m.curso_id = ? ${admin ? "" : "AND a.publicado = 1"}
          ORDER BY m.ordem, m.id, a.ordem, a.id`,
        [aula.curso_id]
    );
    const posicao = sequencia.findIndex((item) => item.id === aulaId);

    await garantirMatricula(req.usuario, aula.curso_id, aulaId);

    const extensao = aula.arquivo ? extensaoDe(aula.arquivo) : null;
    res.status(200).json({
        id: aula.id,
        titulo: aula.titulo,
        descricao: aula.descricao,
        tipo: aula.tipo,
        conteudo: aula.tipo === "texto" ? aula.conteudo : null,
        duracao_segundos: aula.duracao_segundos,
        publicado: Boolean(aula.publicado),
        arquivo_nome: aula.arquivo_nome,
        arquivo_tamanho: aula.arquivo_tamanho,
        extensao,
        url_arquivo: aula.arquivo ? `/api/aluno/aulas/${aula.id}/arquivo` : null,
        video_externo: aula.tipo === "externo" ? interpretarVideoExterno(aula.url_externa) : null,
        url_externa: aula.tipo === "externo" ? aula.url_externa : null,
        modulo: { id: aula.modulo_id, titulo: aula.modulo_titulo },
        curso: { id: aula.curso_id, titulo: aula.curso_titulo },
        materiais,
        progresso: {
            concluida: Boolean(progressos[0]?.concluida),
            posicao_segundos: progressos[0]?.posicao_segundos ?? 0
        },
        anotacao: anotacoes[0] ?? null,
        anterior: posicao > 0 ? sequencia[posicao - 1] : null,
        proxima: posicao >= 0 && posicao < sequencia.length - 1 ? sequencia[posicao + 1] : null,
        posicao: posicao + 1,
        total_aulas: sequencia.length
    });
}

// Envia um arquivo protegido com suporte a "Range" (permite avançar o vídeo sem baixar tudo)
function enviarArquivoProtegido(res, caminho, nomeOriginal, { download }) {
    if (!existeArquivo(caminho)) {
        return res.status(404).json({ mensagem: "Arquivo não encontrado no servidor." });
    }
    const nome = nomeOriginal || path.basename(caminho);
    res.set({
        "Content-Disposition": `${download ? "attachment" : "inline"}; filename*=UTF-8''${encodeURIComponent(nome)}`,
        "Cache-Control": "private, max-age=3600",
        "X-Content-Type-Options": "nosniff"
    });
    // O visualizador de PDF do navegador precisa rodar sem a CSP das páginas
    res.removeHeader("Content-Security-Policy");
    res.sendFile(caminho, { acceptRanges: true, dotfiles: "deny" }, (erro) => {
        // Cancelamentos são normais (o aluno pulou o vídeo ou fechou a página)
        if (erro && !res.headersSent) {
            res.status(erro.status || 500).json({ mensagem: "Não foi possível enviar o arquivo." });
        }
    });
}

// GET /api/aluno/aulas/:id/arquivo  (?download=1 para baixar)
async function arquivoDaAula(req, res) {
    const aula = await exigirAulaAcessivel(exigirId(req.params.id), req.usuario);
    if (!aula.arquivo) {
        return res.status(404).json({ mensagem: "Esta aula não possui arquivo." });
    }
    const download = req.query.download === "1" || (aula.tipo === "arquivo" && extensaoDe(aula.arquivo) !== ".pdf");
    enviarArquivoProtegido(res, caminhoPrivado(PASTAS.aulas, aula.arquivo), aula.arquivo_nome, { download });
}

// GET /api/aluno/materiais/:id
async function baixarMaterial(req, res) {
    const materialId = exigirId(req.params.id);
    const [linhas] = await pool.query("SELECT id, aula_id, nome, arquivo FROM materiais WHERE id = ?", [materialId]);
    const material = linhas[0];
    if (!material) {
        return res.status(404).json({ mensagem: "Material não encontrado." });
    }
    await exigirAulaAcessivel(material.aula_id, req.usuario);
    const inline = req.query.visualizar === "1" && extensaoDe(material.arquivo) === ".pdf";
    enviarArquivoProtegido(res, caminhoPrivado(PASTAS.materiais, material.arquivo), material.nome, { download: !inline });
}

// PUT /api/aluno/aulas/:id/posicao  { posicao_segundos }
async function salvarPosicao(req, res) {
    const aula = await exigirAulaAcessivel(exigirId(req.params.id), req.usuario);
    const posicao = inteiro(req.body.posicao_segundos, "posicao_segundos", { min: 0, max: 86400 });
    await pool.query(
        `INSERT INTO progresso_aulas (usuario_id, aula_id, posicao_segundos) VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE posicao_segundos = VALUES(posicao_segundos)`,
        [req.usuario.id, aula.id, posicao]
    );
    res.status(200).json({ mensagem: "Posição salva." });
}

// PUT /api/aluno/aulas/:id/conclusao  { concluida: true|false }
async function marcarConclusao(req, res) {
    const aula = await exigirAulaAcessivel(exigirId(req.params.id), req.usuario);
    const concluida = booleano(req.body.concluida);

    await pool.query(
        `INSERT INTO progresso_aulas (usuario_id, aula_id, concluida, concluida_em) VALUES (?, ?, ?, IF(?, NOW(), NULL))
         ON DUPLICATE KEY UPDATE concluida = VALUES(concluida), concluida_em = VALUES(concluida_em)`,
        [req.usuario.id, aula.id, concluida ? 1 : 0, concluida]
    );

    const progresso = await calcularProgresso(req.usuario.id, aula.curso_id);
    const cursoConcluido = progresso.total > 0 && progresso.concluidas >= progresso.total;
    if (!ehAdmin(req.usuario)) {
        await pool.query(
            `UPDATE matriculas SET concluido_em = ${cursoConcluido ? "COALESCE(concluido_em, NOW())" : "NULL"}
              WHERE usuario_id = ? AND curso_id = ?`,
            [req.usuario.id, aula.curso_id]
        );
    }

    res.status(200).json({
        mensagem: concluida ? "Aula marcada como concluída." : "Aula marcada como não concluída.",
        progresso,
        curso_concluido: cursoConcluido
    });
}

// PUT /api/aluno/aulas/:id/anotacao  { texto }
async function salvarAnotacao(req, res) {
    const aula = await exigirAulaAcessivel(exigirId(req.params.id), req.usuario);
    const texto = typeof req.body.texto === "string" ? req.body.texto.slice(0, 20000) : "";

    if (texto.trim() === "") {
        await pool.query("DELETE FROM anotacoes WHERE usuario_id = ? AND aula_id = ?", [req.usuario.id, aula.id]);
        return res.status(200).json({ mensagem: "Anotação removida." });
    }
    await pool.query(
        `INSERT INTO anotacoes (usuario_id, aula_id, texto) VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE texto = VALUES(texto)`,
        [req.usuario.id, aula.id, texto]
    );
    res.status(200).json({ mensagem: "Anotação salva." });
}

// GET /api/aluno/anotacoes  → todas as anotações do aluno
async function minhasAnotacoes(req, res) {
    const [anotacoes] = await pool.query(
        `SELECT an.aula_id, an.texto, an.atualizado_em, a.titulo AS aula_titulo, c.id AS curso_id, c.titulo AS curso_titulo
           FROM anotacoes an
           JOIN aulas a ON a.id = an.aula_id
           JOIN modulos m ON m.id = a.modulo_id
           JOIN cursos c ON c.id = m.curso_id
          WHERE an.usuario_id = ?
          ORDER BY an.atualizado_em DESC`,
        [req.usuario.id]
    );
    res.status(200).json(anotacoes);
}

function gerarCodigoCertificado() {
    const alfabeto = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    const bloco = () => Array.from({ length: 4 }, () => alfabeto[crypto.randomInt(alfabeto.length)]).join("");
    return `${bloco()}-${bloco()}-${bloco()}`;
}

// POST /api/aluno/cursos/:id/certificado  → emite o certificado se o curso estiver 100% concluído
async function emitirCertificado(req, res) {
    const cursoId = exigirId(req.params.id);
    if (ehAdmin(req.usuario)) {
        return res.status(400).json({ mensagem: "O administrador não emite certificados para si mesmo." });
    }

    const [existentes] = await pool.query(
        "SELECT codigo FROM certificados WHERE usuario_id = ? AND curso_id = ?",
        [req.usuario.id, cursoId]
    );
    if (existentes.length > 0) {
        return res.status(200).json({ mensagem: "Certificado já emitido.", codigo: existentes[0].codigo });
    }

    const [cursos] = await pool.query("SELECT id, titulo FROM cursos WHERE id = ? AND publicado = 1", [cursoId]);
    if (cursos.length === 0) {
        return res.status(404).json({ mensagem: "Curso não encontrado." });
    }

    const progresso = await calcularProgresso(req.usuario.id, cursoId);
    if (progresso.total === 0 || progresso.concluidas < progresso.total) {
        return res.status(400).json({
            mensagem: `Conclua todas as aulas para emitir o certificado (${progresso.concluidas}/${progresso.total}).`
        });
    }

    const cargaHoraria = Math.max(1, Math.round(progresso.duracao_total / 3600));
    const codigo = gerarCodigoCertificado();
    await pool.query(
        `INSERT INTO certificados (codigo, usuario_id, curso_id, nome_aluno, titulo_curso, carga_horaria)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [codigo, req.usuario.id, cursoId, req.usuario.nome, cursos[0].titulo, cargaHoraria]
    );
    await pool.query(
        "UPDATE matriculas SET concluido_em = COALESCE(concluido_em, NOW()) WHERE usuario_id = ? AND curso_id = ?",
        [req.usuario.id, cursoId]
    );
    await registrarAuditoria(req, "certificado.emitido", `Certificado ${codigo} — "${cursos[0].titulo}"`);

    res.status(201).json({ mensagem: "Parabéns! Seu certificado foi emitido.", codigo });
}

// GET /api/aluno/certificados
async function meusCertificados(req, res) {
    const [certificados] = await pool.query(
        `SELECT id, codigo, curso_id, titulo_curso, carga_horaria, emitido_em
           FROM certificados WHERE usuario_id = ? ORDER BY emitido_em DESC`,
        [req.usuario.id]
    );
    res.status(200).json(certificados);
}

export {
    resumoDoPainel, meusCursos, matricular, conteudoDoCurso, detalharAula, arquivoDaAula, baixarMaterial,
    salvarPosicao, marcarConclusao, salvarAnotacao, minhasAnotacoes, emitirCertificado, meusCertificados
};
