// Rotas de autenticação: /api/auth
import express from "express";
import {
    registrar, login, logout, usuarioAtual, sessaoAtual, atualizarPerfil, alterarSenha,
    enviarAvatar, removerAvatar, listarMinhasSessoes, encerrarMinhaSessao, encerrarOutrasSessoes
} from "../controllers/authController.js";
import { exigirLogin } from "../middlewares/autenticacao.js";
import { limiteLogin, limiteCadastro } from "../middlewares/seguranca.js";
import { uploadAvatar } from "../middlewares/upload.js";

const router = express.Router();

router.post("/registro", limiteCadastro, registrar);
router.post("/login", limiteLogin, login);
router.post("/logout", logout);
router.get("/sessao", sessaoAtual);

// A partir daqui é preciso estar logado
router.get("/me", exigirLogin, usuarioAtual);
router.put("/me", exigirLogin, atualizarPerfil);
router.put("/me/senha", exigirLogin, alterarSenha);
router.post("/me/avatar", exigirLogin, uploadAvatar, enviarAvatar);
router.delete("/me/avatar", exigirLogin, removerAvatar);
router.get("/me/sessoes", exigirLogin, listarMinhasSessoes);
router.delete("/me/sessoes", exigirLogin, encerrarOutrasSessoes);
router.delete("/me/sessoes/:id", exigirLogin, encerrarMinhaSessao);

export default router;
