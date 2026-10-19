// Aulas e materiais: /api/admin/aulas e /api/admin/materiais
import express from "express";
import {
    buscarAulaPorID, atualizarAula, excluirAula, enviarMateriais, excluirMaterial
} from "../controllers/aulasController.js";
import { uploadAula, uploadMateriais } from "../middlewares/upload.js";

const aulasRouter = express.Router();
aulasRouter.get("/:id", buscarAulaPorID);
aulasRouter.put("/:id", uploadAula, atualizarAula);
aulasRouter.delete("/:id", excluirAula);
aulasRouter.post("/:id/materiais", uploadMateriais, enviarMateriais);

const materiaisRouter = express.Router();
materiaisRouter.delete("/:id", excluirMaterial);

export { aulasRouter, materiaisRouter };
