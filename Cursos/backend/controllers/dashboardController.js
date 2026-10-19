// Painel inicial do administrador: indicadores, gráfico de cadastros e atividade recente.
import { pool } from "../database/conexao.js";
import { obterConfiguracoes } from "../services/configuracoes.js";
import { PASTAS, tamanhoDaPasta } from "../services/arquivos.js";

// GET /api/admin/dashboard
async function resumo(req, res) {
    const [[numeros]] = await pool.query(
        `SELECT
            (SELECT COUNT(*) FROM usuarios WHERE papel = 'aluno') AS alunos_total,
            (SELECT COUNT(*) FROM usuarios WHERE papel = 'aluno' AND status = 'ativo') AS alunos_ativos,
            (SELECT COUNT(*) FROM usuarios WHERE status = 'pendente') AS alunos_pendentes,
            (SELECT COUNT(*) FROM usuarios WHERE status = 'bloqueado') AS alunos_bloqueados,
            (SELECT COUNT(*) FROM cursos) AS cursos_total,
            (SELECT COUNT(*) FROM cursos WHERE publicado = 1) AS cursos_publicados,
            (SELECT COUNT(*) FROM modulos) AS modulos_total,
            (SELECT COUNT(*) FROM aulas) AS aulas_total,
            (SELECT COALESCE(SUM(duracao_segundos), 0) FROM aulas) AS duracao_total,
            (SELECT COUNT(*) FROM matriculas) AS matriculas_total,
            (SELECT COUNT(*) FROM matriculas WHERE concluido_em IS NOT NULL) AS matriculas_concluidas,
            (SELECT COUNT(*) FROM certificados) AS certificados_total,
            (SELECT COUNT(*) FROM progresso_aulas WHERE concluida = 1) AS aulas_concluidas,
            (SELECT COUNT(DISTINCT usuario_id) FROM sessoes WHERE revogada_em IS NULL AND expira_em > NOW()
               AND ultimo_acesso > NOW() - INTERVAL 30 MINUTE) AS online_agora`
    );

    // Cadastros por dia nos últimos 30 dias (preenche os dias sem cadastro com zero)
    const [porDia] = await pool.query(
        `SELECT DATE_FORMAT(criado_em, '%Y-%m-%d') AS dia, COUNT(*) AS total
           FROM usuarios
          WHERE papel = 'aluno' AND criado_em >= CURDATE() - INTERVAL 29 DAY
          GROUP BY dia`
    );
    const mapa = Object.fromEntries(porDia.map((linha) => [linha.dia, linha.total]));
    const [[{ hoje }]] = await pool.query("SELECT DATE_FORMAT(CURDATE(), '%Y-%m-%d') AS hoje");
    const cadastros = [];
    for (let i = 29; i >= 0; i--) {
        const data = new Date(`${hoje}T12:00:00Z`);
        data.setUTCDate(data.getUTCDate() - i);
        const dia = data.toISOString().slice(0, 10);
        cadastros.push({ dia, total: mapa[dia] || 0 });
    }

    const [pendentes] = await pool.query(
        "SELECT id, nome, email, criado_em FROM usuarios WHERE status = 'pendente' ORDER BY criado_em DESC LIMIT 6"
    );
    const [populares] = await pool.query(
        `SELECT id, titulo, capa, categoria_nome, categoria_cor, total_alunos, total_aulas, publicado
           FROM vw_cursos_resumo ORDER BY total_alunos DESC, atualizado_em DESC LIMIT 5`
    );
    const [atividade] = await pool.query(
        `SELECT a.id, a.acao, a.descricao, a.criado_em, u.nome AS usuario_nome
           FROM auditoria a LEFT JOIN usuarios u ON u.id = a.usuario_id
          ORDER BY a.id DESC LIMIT 8`
    );

    const armazenamento = {
        aulas: await tamanhoDaPasta(PASTAS.aulas),
        materiais: await tamanhoDaPasta(PASTAS.materiais),
        imagens: await tamanhoDaPasta(PASTAS.raizPublica)
    };

    const configuracoes = obterConfiguracoes();
    res.status(200).json({
        numeros,
        cadastros_por_dia: cadastros,
        pendentes,
        cursos_populares: populares,
        atividade_recente: atividade,
        armazenamento,
        sistema: {
            registros_abertos: configuracoes.registros_abertos,
            login_alunos: configuracoes.login_alunos,
            versao_node: process.version,
            uptime_segundos: Math.round(process.uptime()),
            servidor_status: "online",
            banco: "conectado"
        }
    });
}

export { resumo };
