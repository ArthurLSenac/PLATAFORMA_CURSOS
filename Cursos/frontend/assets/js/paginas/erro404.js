// Página 404: só monta cabeçalho e rodapé.
import { montarLayout, definirTitulo } from "../layout.js";

montarLayout().then(() => definirTitulo("Página não encontrada"));
