// Ao excluir um curso, módulo ou aula, o banco apaga os registros em cascata (ON DELETE CASCADE),
// mas os arquivos em disco precisam ser removidos pelo próprio sistema. Este módulo coleta
// os nomes dos arquivos ANTES da exclusão e os remove DEPOIS que o banco confirmou.
import { pool } from "../database/conexao.js";
import { PASTAS, removerVarios } from "./arquivos.js";

const CONSULTAS = {
    curso: {
        aulas: "SELECT a.arquivo FROM aulas a JOIN modulos m ON m.id = a.modulo_id WHERE m.curso_id = ? AND a.arquivo IS NOT NULL",
        materiais: `SELECT mt.arquivo FROM materiais mt JOIN aulas a ON a.id = mt.aula_id
                    JOIN modulos m ON m.id = a.modulo_id WHERE m.curso_id = ?`
    },
    modulo: {
        aulas: "SELECT arquivo FROM aulas WHERE modulo_id = ? AND arquivo IS NOT NULL",
        materiais: "SELECT mt.arquivo FROM materiais mt JOIN aulas a ON a.id = mt.aula_id WHERE a.modulo_id = ?"
    },
    aula: {
        aulas: "SELECT arquivo FROM aulas WHERE id = ? AND arquivo IS NOT NULL",
        materiais: "SELECT arquivo FROM materiais WHERE aula_id = ?"
    }
};

export async function coletarArquivos(tipo, id) {
    const consultas = CONSULTAS[tipo];
    const [aulas] = await pool.query(consultas.aulas, [id]);
    const [materiais] = await pool.query(consultas.materiais, [id]);
    return {
        aulas: aulas.map((linha) => linha.arquivo),
        materiais: materiais.map((linha) => linha.arquivo)
    };
}

export async function removerArquivosColetados({ aulas = [], materiais = [] }) {
    await removerVarios(PASTAS.aulas, aulas);
    await removerVarios(PASTAS.materiais, materiais);
}
