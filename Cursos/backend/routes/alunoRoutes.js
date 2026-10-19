// Rotas da área do aluno: /api/aluno  (todas exigem login — ver routes/index.js)
import express from "express";
import {
    resumoDoPainel, meusCursos, matricular, conteudoDoCurso, detalharAula, arquivoDaAula, baixarMaterial,
    salvarPosicao, marcarConclusao, salvarAnotacao, minhasAnotacoes, emitirCertificado, meusCertificados
} from "../controllers/alunoController.js";

const router = express.Router();

router.get("/painel", resumoDoPainel);

router.get("/cursos", meusCursos);
router.post("/cursos/:id/matricula", matricular);
router.get("/cursos/:id/conteudo", conteudoDoCurso);
router.post("/cursos/:id/certificado", emitirCertificado);

router.get("/aulas/:id", detalharAula);
router.get("/aulas/:id/arquivo", arquivoDaAula);
router.put("/aulas/:id/posicao", salvarPosicao);
router.put("/aulas/:id/conclusao", marcarConclusao);
router.put("/aulas/:id/anotacao", salvarAnotacao);

router.get("/materiais/:id", baixarMaterial);
router.get("/anotacoes", minhasAnotacoes);
router.get("/certificados", meusCertificados);

export default router;
