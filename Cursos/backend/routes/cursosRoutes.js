// CRUD de cursos: /api/admin/cursos  (+ módulos do curso)
import express from "express";
import {
    listarCursos, buscarCursoPorID, cadastrarCurso, atualizarCurso, alterarPublicacao, excluirCurso, duplicarCurso
} from "../controllers/cursosController.js";
import { listarModulos, cadastrarModulo, reordenarModulos } from "../controllers/modulosController.js";
import { uploadCapa } from "../middlewares/upload.js";

const router = express.Router();

router.get("/", listarCursos);                         // READ   (lista)
router.post("/", uploadCapa, cadastrarCurso);          // CREATE
router.get("/:id", buscarCursoPorID);                  // READ   (um)
router.put("/:id", uploadCapa, atualizarCurso);        // UPDATE
router.delete("/:id", excluirCurso);                   // DELETE
router.patch("/:id/publicacao", alterarPublicacao);
router.post("/:id/duplicar", duplicarCurso);

// Módulos pertencentes a um curso
router.get("/:cursoId/modulos", listarModulos);
router.post("/:cursoId/modulos", cadastrarModulo);
router.put("/:cursoId/modulos/ordem", reordenarModulos);

export default router;
