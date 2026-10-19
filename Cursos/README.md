# Lumina Academy — Node.js e MySQL

## Requisitos

Node.js 20 ou superior e MySQL 8 ou superior. Para usar os testes do pacote Sites, prefira Node.js 22.13 ou superior.

## Rodar localmente

1. Abra um terminal na pasta `backend` e execute `npm ci`.
2. Copie `.env.example` para `.env`. No PowerShell: `Copy-Item .env.example .env`. No Linux/macOS: `cp .env.example .env`.
3. Preencha `DB_USER`, `DB_PASSWORD`, `ADMIN_EMAIL` e `ADMIN_SENHA` no seu `.env` local.
4. Gere `JWT_SECRET` com o comando abaixo e salve o valor somente no `.env`.
5. Em um banco novo, execute `npm run db:setup` para criar as tabelas e os exemplos fictícios. Esse comando recria as tabelas, portanto não o execute sobre dados que queira preservar.
6. Execute `npm start` e abra `http://localhost:3000`. O painel fica em `http://localhost:3000/admin.html`.

```sh
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

Entre com o administrador que você definiu no `.env`. As contas fictícias da base de exemplo não têm senha funcional neste pacote. Se quiser usá-las, redefina suas senhas pelo painel administrativo.

## Organização

- `frontend/`: HTML, CSS, JavaScript, chamadas fetch e componentes da interface.
- `backend/server.js`: inicia o servidor.
- `backend/app.js`: configura o Express e o atendimento das páginas e da API.
- `backend/routes/`: rotas HTTP.
- `backend/controllers/`: validações e operações do sistema.
- `backend/database/conexao.js`: conexão com o MySQL.
- `sql/plataforma_cursos.sql`: estrutura e dados fictícios de demonstração.

## Testes

`npm test`, dentro de `backend`, usa o banco e o administrador configurados no `.env`, cria registros próprios de teste e os remove no final. Execute em uma base separada para testes. Esta exportação teve a sintaxe revisada; os testes desta versão local requerem MySQL e não foram executados no ambiente de exportação.

## Credenciais

Não existe senha padrão do administrador. Cada instalação deve definir a própria senha.
