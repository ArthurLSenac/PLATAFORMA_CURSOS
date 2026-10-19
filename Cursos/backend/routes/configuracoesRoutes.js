// Configurações do site: /api/admin/configuracoes
import express from "express";
import {
    obter, atualizar, enviarLogo, removerLogo, enviarFavicon, removerFavicon
} from "../controllers/configuracoesController.js";
import { uploadLogo, uploadFavicon } from "../middlewares/upload.js";

const router = express.Router();

router.get("/", obter);
router.put("/", atualizar);
router.post("/logo", uploadLogo, enviarLogo);
router.delete("/logo", removerLogo);
router.post("/favicon", uploadFavicon, enviarFavicon);
router.delete("/favicon", removerFavicon);

export default router;
