// CRUD de usuários: /api/admin/usuarios
import express from "express";
import {
    listarUsuarios, buscarUsuarioPorID, cadastrarUsuario, atualizarUsuario, alterarStatus, acaoEmLote,
    redefinirSenha, encerrarSessoes, excluirUsuario, exportarCsv
} from "../controllers/usuariosController.js";

const router = express.Router();

router.get("/", listarUsuarios);                       // READ   (lista)
router.get("/exportar", exportarCsv);
router.post("/", cadastrarUsuario);                    // CREATE
router.post("/lote", acaoEmLote);
router.get("/:id", buscarUsuarioPorID);                // READ   (um)
router.put("/:id", atualizarUsuario);                  // UPDATE
router.patch("/:id/status", alterarStatus);            // aprovar / rejeitar / bloquear / desbloquear
router.post("/:id/senha", redefinirSenha);
router.delete("/:id/sessoes", encerrarSessoes);        // "cortar" o login
router.delete("/:id", excluirUsuario);                 // DELETE

export default router;
