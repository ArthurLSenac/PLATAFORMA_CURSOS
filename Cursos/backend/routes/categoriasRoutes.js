// CRUD de categorias: /api/admin/categorias
import express from "express";
import {
    listarCategorias, buscarCategoriaPorID, cadastrarCategoria, atualizarCategoria, excluirCategoria
} from "../controllers/categoriasController.js";

const router = express.Router();

router.get("/", listarCategorias);
router.post("/", cadastrarCategoria);
router.get("/:id", buscarCategoriaPorID);
router.put("/:id", atualizarCategoria);
router.delete("/:id", excluirCategoria);

export default router;
