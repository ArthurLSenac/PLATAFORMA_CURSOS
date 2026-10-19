// Ponto central das rotas da API. Tudo aqui fica sob o prefixo /api (ver app.js).
import express from "express";
import authRoutes from "./authRoutes.js";
import publicoRoutes from "./publicoRoutes.js";
import alunoRoutes from "./alunoRoutes.js";
import adminRoutes from "./adminRoutes.js";
import { exigirLogin, exigirAdmin } from "../middlewares/autenticacao.js";
import { pool } from "../database/conexao.js";

const router = express.Router();

// GET /api/saude → verifica se a API e o banco estão respondendo
router.get("/saude", async (req, res) => {
    try {
        await pool.query("SELECT 1");
        res.status(200).json({ api: "online", banco: "conectado", horario: new Date().toISOString() });
    } catch {
        res.status(503).json({ api: "online", banco: "desconectado", mensagem: "Banco de dados indisponível." });
    }
});

router.use("/auth", authRoutes);                                  // cadastro, login, perfil
router.use("/publico", publicoRoutes);                            // site público
router.use("/aluno", exigirLogin, alunoRoutes);                   // área do aluno (login obrigatório)
router.use("/admin", exigirLogin, exigirAdmin, adminRoutes);      // painel (somente administrador)

export default router;
