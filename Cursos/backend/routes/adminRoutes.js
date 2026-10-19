// Agrupa todas as rotas do painel do administrador: /api/admin/*
// (o acesso de admin é exigido em routes/index.js antes de chegar aqui)
import express from "express";
import usuariosRoutes from "./usuariosRoutes.js";
import categoriasRoutes from "./categoriasRoutes.js";
import cursosRoutes from "./cursosRoutes.js";
import modulosRoutes from "./modulosRoutes.js";
import { aulasRouter, materiaisRouter } from "./aulasRoutes.js";
import configuracoesRoutes from "./configuracoesRoutes.js";
import { resumo } from "../controllers/dashboardController.js";
import { listarAuditoria, listarCertificados, revogarCertificado } from "../controllers/auditoriaController.js";
import { importarZip } from "../controllers/importacaoController.js";
import { uploadZip } from "../middlewares/upload.js";

const router = express.Router();

router.get("/dashboard", resumo);
router.use("/usuarios", usuariosRoutes);
router.use("/categorias", categoriasRoutes);
router.use("/cursos", cursosRoutes);
router.use("/modulos", modulosRoutes);
router.use("/aulas", aulasRouter);
router.use("/materiais", materiaisRouter);
router.use("/configuracoes", configuracoesRoutes);
router.get("/auditoria", listarAuditoria);
router.get("/certificados", listarCertificados);
router.delete("/certificados/:id", revogarCertificado);
router.post("/importacao/zip", uploadZip, importarZip);

export default router;
