// CORS: define quais endereços (front-ends) podem chamar a API pelo navegador.
// A lista fica no .env (CORS_ORIGINS). Por padrão inclui o próprio servidor (porta 3000)
// e o Live Server do VS Code (porta 5500).
import cors from "cors";
import { config } from "../config/ambiente.js";

const corsMiddlewares = cors({
    origin(origem, callback) {
        // Requisições sem "Origin" (mesmo site, Postman, curl) são permitidas
        if (!origem || config.corsOrigens.includes(origem)) {
            return callback(null, true);
        }
        return callback(null, false);
    },
    credentials: true, // permite o envio do cookie de sessão (JWT)
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
    maxAge: 600
});

export default corsMiddlewares;
