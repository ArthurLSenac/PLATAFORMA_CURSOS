// Rotas públicas (sem login): /api/publico
import express from "express";
import {
    configuracoesPublicas, estatisticas, listarCategorias, listarCursos, detalharCurso, verificarCertificado
} from "../controllers/publicoController.js";

const router = express.Router();

router.get("/configuracoes", configuracoesPublicas);
router.get("/estatisticas", estatisticas);
router.get("/categorias", listarCategorias);
router.get("/cursos", listarCursos);
router.get("/cursos/:id", detalharCurso);
router.get("/certificados/:codigo", verificarCertificado);

export default router;
