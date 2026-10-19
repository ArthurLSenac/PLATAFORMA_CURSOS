// Módulos: /api/admin/modulos  (+ aulas do módulo)
import express from "express";
import { buscarModuloPorID, atualizarModulo, excluirModulo } from "../controllers/modulosController.js";
import { listarAulas, cadastrarAula, reordenarAulas, enviarAulasEmLote } from "../controllers/aulasController.js";
import { uploadAula, uploadAulasEmLote } from "../middlewares/upload.js";

const router = express.Router();

router.get("/:id", buscarModuloPorID);
router.put("/:id", atualizarModulo);
router.delete("/:id", excluirModulo);

// Aulas pertencentes a um módulo
router.get("/:moduloId/aulas", listarAulas);
router.post("/:moduloId/aulas", uploadAula, cadastrarAula);
router.post("/:moduloId/aulas/lote", uploadAulasEmLote, enviarAulasEmLote);   // upload em massa
router.put("/:moduloId/aulas/ordem", reordenarAulas);

export default router;
