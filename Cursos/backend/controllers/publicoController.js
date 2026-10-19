// Rotas públicas (não exigem login): configurações do site, catálogo e verificação de certificados.
import { pool } from "../database/conexao.js";
import { obterConfiguracoes } from "../services/configuracoes.js";
import { exigirId, escolha, termoBusca, idOpcional } from "../services/validacao.js";

// GET /api/publico/configuracoes
async function configuracoesPublicas(req, res) {
    res.set("Cache-Control", "no-cache");
    res.status(200).json(obterConfiguracoes());
}

// GET /api/publico/estatisticas
async function estatisticas(req, res) {
    const [[linha]] = await pool.query(
        `SELECT
            (SELECT COUNT(*) FROM cursos WHERE publicado = 1) AS cursos,
            (SELECT COUNT(*) FROM aulas a JOIN modulos m ON m.id = a.modulo_id JOIN cursos c ON c.id = m.curso_id
              WHERE c.publicado = 1 AND a.publicado = 1) AS aulas,
            (SELECT COALESCE(SUM(a.duracao_segundos), 0) FROM aulas a JOIN modulos m ON m.id = a.modulo_id
               JOIN cursos c ON c.id = m.curso_id WHERE c.publicado = 1 AND a.publicado = 1) AS duracao_segundos,
            (SELECT COUNT(*) FROM usuarios WHERE papel = 'aluno' AND status = 'ativo') AS alunos,
            (SELECT COUNT(*) FROM certificados) AS certificados`
    );
    res.status(200).json(linha);
}

// GET /api/publico/categorias
async function listarCategorias(req, res) {
    const [categorias] = await pool.query(
        `SELECT cat.id, cat.nome, cat.descricao, cat.cor,
                (SELECT COUNT(*) FROM cursos c WHERE c.categoria_id = cat.id AND c.publicado = 1) AS total_cursos
           FROM categorias cat
          ORDER BY cat.nome`
    );
    res.status(200).json(categorias);
}

// GET /api/publico/cursos?busca=&categoria=&nivel=&ordem=
async function listarCursos(req, res) {
    const filtros = ["publicado = 1"];
    const valores = [];

    const busca = termoBusca(req.query.busca);
    if (busca) {
        filtros.push("(titulo LIKE ? OR resumo LIKE ? OR instrutor LIKE ?)");
        valores.push(busca, busca, busca);
    }
    const categoria = idOpcional(req.query.categoria, "categoria");
    if (categoria) {
        filtros.push("categoria_id = ?");
        valores.push(categoria);
    }
    if (req.query.nivel) {
        filtros.push("nivel = ?");
        valores.push(escolha(req.query.nivel, ["iniciante", "intermediario", "avancado"], "nivel"));
    }

    const ordenacoes = {
        destaque: "destaque DESC, criado_em DESC",
        recentes: "criado_em DESC",
        populares: "total_alunos DESC, criado_em DESC",
        titulo: "titulo ASC"
    };
    const ordem = ordenacoes[req.query.ordem] || ordenacoes.destaque;

    const [cursos] = await pool.query(
        `SELECT id, titulo, resumo, nivel, instrutor, capa, destaque, categoria_id, categoria_nome, categoria_cor,
                total_modulos, total_aulas, duracao_segundos, total_alunos, criado_em
           FROM vw_cursos_resumo
          WHERE ${filtros.join(" AND ")}
          ORDER BY ${ordem}`,
        valores
    );
    res.status(200).json(cursos);
}

// GET /api/publico/cursos/:id  → detalhes + grade curricular (sem o conteúdo das aulas)
async function detalharCurso(req, res) {
    const id = exigirId(req.params.id);
    const [cursos] = await pool.query(
        `SELECT v.*, c.descricao
           FROM vw_cursos_resumo v
           JOIN cursos c ON c.id = v.id
          WHERE v.id = ? AND v.publicado = 1`,
        [id]
    );
    if (cursos.length === 0) {
        return res.status(404).json({ mensagem: "Curso não encontrado." });
    }

    const [modulos] = await pool.query(
        "SELECT id, titulo, descricao, ordem FROM modulos WHERE curso_id = ? ORDER BY ordem, id",
        [id]
    );
    const [aulas] = await pool.query(
        `SELECT a.id, a.modulo_id, a.titulo, a.tipo, a.duracao_segundos
           FROM aulas a JOIN modulos m ON m.id = a.modulo_id
          WHERE m.curso_id = ? AND a.publicado = 1
          ORDER BY a.ordem, a.id`,
        [id]
    );

    const curso = cursos[0];
    curso.modulos = modulos.map((modulo) => ({
        ...modulo,
        aulas: aulas.filter((aula) => aula.modulo_id === modulo.id)
    }));

    res.status(200).json(curso);
}

// GET /api/publico/certificados/:codigo  → verificação pública de autenticidade
async function verificarCertificado(req, res) {
    const codigo = String(req.params.codigo || "").trim().toUpperCase();
    if (!/^[A-Z0-9-]{8,20}$/.test(codigo)) {
        return res.status(400).json({ mensagem: "Código de certificado inválido." });
    }
    const [linhas] = await pool.query(
        `SELECT codigo, nome_aluno, titulo_curso, carga_horaria, emitido_em, curso_id
           FROM certificados WHERE codigo = ?`,
        [codigo]
    );
    if (linhas.length === 0) {
        return res.status(404).json({ mensagem: "Certificado não encontrado. Confira o código digitado.", valido: false });
    }
    res.status(200).json({ valido: true, ...linhas[0], assinatura: obterConfiguracoes().certificado_assinatura });
}

export { configuracoesPublicas, estatisticas, listarCategorias, listarCursos, detalharCurso, verificarCertificado };
