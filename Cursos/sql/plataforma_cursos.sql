-- =====================================================================
--  LUMINA ACADEMY — Plataforma de Cursos
--  Script de criação do banco de dados (MySQL 8+)
--
--  ATENÇÃO: este script RECRIA as tabelas (DROP TABLE IF EXISTS).
--  Executá-lo novamente apaga os dados existentes e volta ao estado inicial.
--
--  Como executar:
--    • MySQL Workbench: abra este arquivo e clique em "Execute" (raio)
--    • Terminal:        mysql -u root -p < sql/plataforma_cursos.sql
--    • Pelo projeto:    cd backend && npm run db:setup
--
--  O administrador fixo NÃO é criado aqui: o servidor cria/sincroniza
--  automaticamente a conta definida no arquivo backend/.env
--  (ADMIN_EMAIL / ADMIN_SENHA) toda vez que é iniciado.
-- =====================================================================

CREATE DATABASE IF NOT EXISTS plataforma_cursos
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE plataforma_cursos;

-- Remove na ordem inversa das dependências (chaves estrangeiras)
DROP VIEW  IF EXISTS vw_cursos_resumo;
DROP TABLE IF EXISTS auditoria;
DROP TABLE IF EXISTS certificados;
DROP TABLE IF EXISTS anotacoes;
DROP TABLE IF EXISTS progresso_aulas;
DROP TABLE IF EXISTS matriculas;
DROP TABLE IF EXISTS materiais;
DROP TABLE IF EXISTS aulas;
DROP TABLE IF EXISTS modulos;
DROP TABLE IF EXISTS cursos;
DROP TABLE IF EXISTS categorias;
DROP TABLE IF EXISTS sessoes;
DROP TABLE IF EXISTS usuarios;
DROP TABLE IF EXISTS configuracoes;

-- ---------------------------------------------------------------------
-- USUÁRIOS: administrador fixo e alunos.
-- status controla o acesso: um cadastro novo nasce 'pendente' e só
-- consegue entrar depois que o administrador muda para 'ativo'.
-- ---------------------------------------------------------------------
CREATE TABLE usuarios (
  id                INT AUTO_INCREMENT PRIMARY KEY,
  nome              VARCHAR(120) NOT NULL,
  email             VARCHAR(190) NOT NULL,
  senha_hash        VARCHAR(255) NOT NULL,                 -- hash bcrypt (nunca a senha pura)
  papel             ENUM('admin','aluno') NOT NULL DEFAULT 'aluno',
  status            ENUM('pendente','ativo','bloqueado','rejeitado') NOT NULL DEFAULT 'pendente',
  admin_fixo        TINYINT(1) NOT NULL DEFAULT 0,          -- 1 = conta do .env (protegida)
  motivo_status     VARCHAR(255) NULL,                      -- motivo do bloqueio/rejeição
  bio               VARCHAR(500) NULL,
  avatar            VARCHAR(255) NULL,
  tentativas_login  INT NOT NULL DEFAULT 0,                 -- proteção contra força bruta
  bloqueado_ate     DATETIME NULL,
  ultimo_login      DATETIME NULL,
  aprovado_em       DATETIME NULL,
  aprovado_por      INT NULL,
  criado_em         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  atualizado_em     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_usuarios_email (email),
  KEY idx_usuarios_status (status),
  CONSTRAINT fk_usuarios_aprovador FOREIGN KEY (aprovado_por) REFERENCES usuarios(id) ON DELETE SET NULL
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- SESSÕES: cada login gera uma sessão; o JWT carrega o id dela (sid).
-- Revogar a sessão "corta" o login na hora, mesmo com o token válido.
-- ---------------------------------------------------------------------
CREATE TABLE sessoes (
  id             CHAR(36) PRIMARY KEY,                      -- UUID (vai no JWT como "sid")
  usuario_id     INT NOT NULL,
  ip             VARCHAR(45) NULL,
  user_agent     VARCHAR(255) NULL,
  criado_em      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ultimo_acesso  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expira_em      DATETIME NOT NULL,
  revogada_em    DATETIME NULL,
  KEY idx_sessoes_usuario (usuario_id),
  CONSTRAINT fk_sessoes_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- CATEGORIAS dos cursos
-- ---------------------------------------------------------------------
CREATE TABLE categorias (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  nome       VARCHAR(80) NOT NULL,
  descricao  VARCHAR(255) NULL,
  cor        CHAR(7) NOT NULL DEFAULT '#7c5cff',
  criado_em  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_categorias_nome (nome)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- CURSOS  →  MÓDULOS  →  AULAS  →  MATERIAIS
-- ---------------------------------------------------------------------
CREATE TABLE cursos (
  id             INT AUTO_INCREMENT PRIMARY KEY,
  titulo         VARCHAR(160) NOT NULL,
  resumo         VARCHAR(300) NULL,
  descricao      TEXT NULL,                                 -- aceita Markdown simples
  categoria_id   INT NULL,
  nivel          ENUM('iniciante','intermediario','avancado') NOT NULL DEFAULT 'iniciante',
  instrutor      VARCHAR(120) NULL,
  capa           VARCHAR(255) NULL,                         -- caminho público da imagem de capa
  publicado      TINYINT(1) NOT NULL DEFAULT 0,
  destaque       TINYINT(1) NOT NULL DEFAULT 0,
  criado_em      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  atualizado_em  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_cursos_publicado (publicado),
  CONSTRAINT fk_cursos_categoria FOREIGN KEY (categoria_id) REFERENCES categorias(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE modulos (
  id             INT AUTO_INCREMENT PRIMARY KEY,
  curso_id       INT NOT NULL,
  titulo         VARCHAR(160) NOT NULL,
  descricao      VARCHAR(500) NULL,
  ordem          INT NOT NULL DEFAULT 0,
  criado_em      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  atualizado_em  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_modulos_curso (curso_id, ordem),
  CONSTRAINT fk_modulos_curso FOREIGN KEY (curso_id) REFERENCES cursos(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE aulas (
  id                INT AUTO_INCREMENT PRIMARY KEY,
  modulo_id         INT NOT NULL,
  titulo            VARCHAR(160) NOT NULL,
  descricao         TEXT NULL,
  tipo              ENUM('video','audio','externo','texto','arquivo') NOT NULL DEFAULT 'video',
  arquivo           VARCHAR(255) NULL,                      -- nome gerado pelo servidor (pasta privada)
  arquivo_nome      VARCHAR(255) NULL,                      -- nome original enviado
  arquivo_tamanho   BIGINT NULL,
  url_externa       VARCHAR(500) NULL,                      -- YouTube / Vimeo
  conteudo          MEDIUMTEXT NULL,                        -- aulas de texto (Markdown)
  duracao_segundos  INT NOT NULL DEFAULT 0,
  ordem             INT NOT NULL DEFAULT 0,
  publicado         TINYINT(1) NOT NULL DEFAULT 1,
  criado_em         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  atualizado_em     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_aulas_modulo (modulo_id, ordem),
  CONSTRAINT fk_aulas_modulo FOREIGN KEY (modulo_id) REFERENCES modulos(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE materiais (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  aula_id    INT NOT NULL,
  nome       VARCHAR(255) NOT NULL,
  arquivo    VARCHAR(255) NOT NULL,
  tamanho    BIGINT NOT NULL DEFAULT 0,
  criado_em  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_materiais_aula (aula_id),
  CONSTRAINT fk_materiais_aula FOREIGN KEY (aula_id) REFERENCES aulas(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- MATRÍCULAS, PROGRESSO, ANOTAÇÕES E CERTIFICADOS
-- ---------------------------------------------------------------------
CREATE TABLE matriculas (
  id             INT AUTO_INCREMENT PRIMARY KEY,
  usuario_id     INT NOT NULL,
  curso_id       INT NOT NULL,
  ultima_aula_id INT NULL,
  ultimo_acesso  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  concluido_em   DATETIME NULL,
  criado_em      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_matricula (usuario_id, curso_id),
  CONSTRAINT fk_matriculas_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE,
  CONSTRAINT fk_matriculas_curso   FOREIGN KEY (curso_id)   REFERENCES cursos(id)   ON DELETE CASCADE,
  CONSTRAINT fk_matriculas_aula    FOREIGN KEY (ultima_aula_id) REFERENCES aulas(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE progresso_aulas (
  usuario_id        INT NOT NULL,
  aula_id           INT NOT NULL,
  concluida         TINYINT(1) NOT NULL DEFAULT 0,
  posicao_segundos  INT NOT NULL DEFAULT 0,                 -- de onde o vídeo continua
  concluida_em      DATETIME NULL,
  atualizado_em     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (usuario_id, aula_id),
  CONSTRAINT fk_progresso_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE,
  CONSTRAINT fk_progresso_aula    FOREIGN KEY (aula_id)    REFERENCES aulas(id)    ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE anotacoes (
  usuario_id     INT NOT NULL,
  aula_id        INT NOT NULL,
  texto          TEXT NOT NULL,
  atualizado_em  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (usuario_id, aula_id),
  CONSTRAINT fk_anotacoes_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE,
  CONSTRAINT fk_anotacoes_aula    FOREIGN KEY (aula_id)    REFERENCES aulas(id)    ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE certificados (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  codigo          VARCHAR(20) NOT NULL,                     -- código público de verificação
  usuario_id      INT NOT NULL,
  curso_id        INT NOT NULL,
  nome_aluno      VARCHAR(120) NOT NULL,                    -- "foto" dos dados na emissão
  titulo_curso    VARCHAR(160) NOT NULL,
  carga_horaria   DECIMAL(6,1) NOT NULL DEFAULT 0,
  emitido_em      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_certificados_codigo (codigo),
  UNIQUE KEY uk_certificado_aluno_curso (usuario_id, curso_id),
  CONSTRAINT fk_certificados_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE,
  CONSTRAINT fk_certificados_curso   FOREIGN KEY (curso_id)   REFERENCES cursos(id)   ON DELETE CASCADE
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- CONFIGURAÇÕES DO SITE (chave → valor), editadas no painel admin:
-- nome, logo, cores, rodapé, abrir/fechar cadastros, suspender login...
-- ---------------------------------------------------------------------
CREATE TABLE configuracoes (
  chave          VARCHAR(60) PRIMARY KEY,
  valor          TEXT NULL,
  atualizado_em  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- AUDITORIA: registro de todas as ações importantes (quem, o quê, quando)
-- ---------------------------------------------------------------------
CREATE TABLE auditoria (
  id          BIGINT AUTO_INCREMENT PRIMARY KEY,
  usuario_id  INT NULL,
  acao        VARCHAR(60) NOT NULL,
  descricao   VARCHAR(500) NULL,
  ip          VARCHAR(45) NULL,
  criado_em   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_auditoria_data (criado_em),
  KEY idx_auditoria_acao (acao),
  CONSTRAINT fk_auditoria_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE SET NULL
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- VIEW com os totais de cada curso (módulos, aulas, duração e alunos)
-- ---------------------------------------------------------------------
CREATE VIEW vw_cursos_resumo AS
SELECT
  c.id,
  c.titulo,
  c.resumo,
  c.nivel,
  c.instrutor,
  c.capa,
  c.publicado,
  c.destaque,
  c.categoria_id,
  cat.nome AS categoria_nome,
  cat.cor  AS categoria_cor,
  c.criado_em,
  c.atualizado_em,
  (SELECT COUNT(*) FROM modulos m WHERE m.curso_id = c.id) AS total_modulos,
  (SELECT COUNT(*) FROM aulas a JOIN modulos m ON m.id = a.modulo_id
     WHERE m.curso_id = c.id AND a.publicado = 1) AS total_aulas,
  (SELECT COALESCE(SUM(a.duracao_segundos), 0) FROM aulas a JOIN modulos m ON m.id = a.modulo_id
     WHERE m.curso_id = c.id AND a.publicado = 1) AS duracao_segundos,
  (SELECT COUNT(*) FROM matriculas mt WHERE mt.curso_id = c.id) AS total_alunos
FROM cursos c
LEFT JOIN categorias cat ON cat.id = c.categoria_id;

-- =====================================================================
--  DADOS INICIAIS
-- =====================================================================

INSERT INTO configuracoes (chave, valor) VALUES
('nome_site',              'Lumina Academy'),
('slogan',                 'Aprenda no seu ritmo. Evolua sem limites.'),
('logo',                   ''),
('favicon',                ''),
('cor_primaria',           '#7c5cff'),
('hero_titulo',            'Domine as habilidades que o mercado procura'),
('hero_subtitulo',         'Cursos práticos, organizados em módulos, com acompanhamento de progresso e certificado de conclusão. Estude quando e onde quiser.'),
('rodape_texto',           'A Lumina Academy é uma plataforma de cursos online focada em aprendizado prático, do primeiro passo ao nível profissional.'),
('rodape_links',           '[{"rotulo":"Catálogo de cursos","url":"/#cursos"},{"rotulo":"Verificar certificado","url":"/verificar.html"},{"rotulo":"Criar conta","url":"/cadastro.html"},{"rotulo":"Entrar","url":"/login.html"}]'),
('redes_sociais',          '{"instagram":"https://instagram.com","youtube":"https://youtube.com","linkedin":"https://linkedin.com","github":"https://github.com"}'),
('email_contato',          'contato@lumina.academy'),
('registros_abertos',      '1'),
('login_alunos',           '1'),
('aviso_global',           ''),
('aviso_tipo',             'info'),
('certificado_assinatura', 'Coordenação Pedagógica');

INSERT INTO categorias (id, nome, descricao, cor) VALUES
(1, 'Programação',   'Lógica, linguagens e desenvolvimento de software', '#7c5cff'),
(2, 'Banco de Dados','Modelagem, SQL e administração de dados',          '#22c3ee'),
(3, 'Back-end',      'APIs, servidores e arquitetura',                   '#10b981'),
(4, 'Design',        'UI, UX e design de interfaces',                    '#f472b6');

-- Alunos de exemplo (contas fictícias sem senha funcional; o administrador pode redefini-la) para demonstrar o fluxo de aprovação
INSERT INTO usuarios (id, nome, email, senha_hash, papel, status, motivo_status, bio, aprovado_em, criado_em) VALUES
(100, 'Ana Souza',    'ana@exemplo.com',    'CONTA_DEMONSTRACAO_SEM_SENHA', 'aluno', 'ativo',    NULL, 'Estudante de Análise e Desenvolvimento de Sistemas.', NOW() - INTERVAL 9 DAY, NOW() - INTERVAL 10 DAY),
(101, 'Bruno Lima',   'bruno@exemplo.com',  'CONTA_DEMONSTRACAO_SEM_SENHA', 'aluno', 'pendente', NULL, NULL, NULL, NOW() - INTERVAL 2 DAY),
(102, 'Carla Mendes', 'carla@exemplo.com',  'CONTA_DEMONSTRACAO_SEM_SENHA', 'aluno', 'pendente', NULL, NULL, NULL, NOW() - INTERVAL 1 DAY),
(103, 'Diego Rocha',  'diego@exemplo.com',  'CONTA_DEMONSTRACAO_SEM_SENHA', 'aluno', 'bloqueado','Uso indevido da plataforma.', NULL, NOW() - INTERVAL 20 DAY, NOW() - INTERVAL 21 DAY),
(104, 'Elisa Prado',  'elisa@exemplo.com',  'CONTA_DEMONSTRACAO_SEM_SENHA', 'aluno', 'ativo',    NULL, NULL, NOW() - INTERVAL 4 DAY, NOW() - INTERVAL 5 DAY);

-- ---------------------------------------------------------------------
-- Cursos de exemplo
-- ---------------------------------------------------------------------
INSERT INTO cursos (id, titulo, resumo, descricao, categoria_id, nivel, instrutor, publicado, destaque) VALUES
(1, 'JavaScript do Zero ao Profissional',
 'Aprenda a linguagem mais usada da web: fundamentos, funções, objetos, assincronismo e consumo de APIs com fetch.',
 '## O que você vai aprender

Neste curso você sai do absoluto zero até escrever código JavaScript moderno com confiança.

- Variáveis, tipos e operadores
- Funções, arrays e objetos
- Manipulação do DOM
- Promises, **async/await** e `fetch`

> Ideal para quem está começando na programação ou quer consolidar a base.',
 1, 'iniciante', 'Prof. Rafael Martins', 1, 1),

(2, 'Banco de Dados com MySQL',
 'Modele bancos relacionais, escreva consultas SQL eficientes e domine o CRUD na prática.',
 '## Sobre o curso

Do modelo conceitual às consultas avançadas. Você vai entender **tabelas**, **chaves primárias e estrangeiras**, **JOINs** e boas práticas de modelagem.

- Modelagem entidade-relacionamento
- Comandos DDL e DML
- Consultas com JOIN, GROUP BY e subconsultas',
 2, 'iniciante', 'Profa. Juliana Costa', 1, 1),

(3, 'APIs REST com Node.js e Express',
 'Construa APIs profissionais com Express, rotas, controllers, MySQL e autenticação JWT.',
 '## Sobre o curso

Você vai construir uma API REST completa, organizada em **rotas**, **controllers** e **middlewares**, conectada ao MySQL e protegida com **JWT**.

- Arquitetura em camadas
- CRUD completo com mysql2
- Autenticação e autorização com JWT
- Segurança: CORS, rate limit e validação',
 3, 'intermediario', 'Prof. Rafael Martins', 1, 0),

(4, 'UI Design para Desenvolvedores',
 'Princípios visuais para criar interfaces bonitas e consistentes sem depender de um designer.',
 '## Sobre o curso

Hierarquia visual, espaçamento, cor e tipografia aplicados ao dia a dia do desenvolvedor.',
 4, 'intermediario', 'Marina Alves', 1, 0);

INSERT INTO modulos (id, curso_id, titulo, descricao, ordem) VALUES
(1,  1, 'Primeiros passos',            'Ambiente, sintaxe básica e seus primeiros programas.', 1),
(2,  1, 'Funções, arrays e objetos',   'As estruturas que você vai usar todos os dias.',         2),
(3,  1, 'JavaScript assíncrono',       'Promises, async/await e consumo de APIs.',               3),
(4,  2, 'Modelagem de dados',          'Entidades, atributos e relacionamentos.',                1),
(5,  2, 'SQL na prática',              'CRUD completo com comandos SQL.',                        2),
(6,  3, 'Fundamentos do Express',      'Servidor, rotas e middlewares.',                         1),
(7,  3, 'Banco de dados e CRUD',       'Conectando a API ao MySQL.',                             2),
(8,  3, 'Autenticação com JWT',        'Login seguro e rotas protegidas.',                       3),
(9,  4, 'Fundamentos visuais',         'Hierarquia, espaçamento e alinhamento.',                 1),
(10, 4, 'Cor e tipografia',            'Paletas, contraste e escalas tipográficas.',             2);

INSERT INTO aulas (modulo_id, titulo, descricao, tipo, url_externa, conteudo, duracao_segundos, ordem) VALUES
-- Curso 1 · Módulo 1
(1, 'Boas-vindas ao curso', 'Como o curso está organizado e como aproveitar melhor cada módulo.', 'texto', NULL,
'# Seja bem-vindo(a)! 👋

Este curso foi pensado para você aprender **fazendo**. Cada módulo traz aulas curtas e objetivas.

## Como estudar

1. Assista ou leia a aula com calma
2. Reproduza os exemplos no seu computador
3. Marque a aula como **concluída** para acompanhar seu progresso

> Dica: use a aba **Anotações** para guardar o que for mais importante.', 300, 1),
(1, 'JavaScript: curso completo (vídeo)', 'Aula em vídeo com uma visão geral completa da linguagem.', 'externo', 'https://www.youtube.com/watch?v=PkZNo7MFNFg', NULL, 1800, 2),
(1, 'Variáveis e tipos de dados', 'let, const e os tipos primitivos.', 'texto', NULL,
'# Variáveis e tipos

Em JavaScript moderno usamos `let` para valores que mudam e `const` para valores fixos.

```js
const nome = "Ana";
let idade = 20;
idade = idade + 1;
console.log(`${nome} tem ${idade} anos`);
```

## Tipos primitivos

- `string` — textos
- `number` — números inteiros e decimais
- `boolean` — `true` ou `false`
- `null` e `undefined`', 600, 3),
-- Curso 1 · Módulo 2
(2, 'Funções', 'Declarando e reutilizando blocos de código.', 'texto', NULL,
'# Funções

Funções agrupam instruções que podem ser reutilizadas.

```js
function somar(a, b) {
  return a + b;
}

const dobrar = (n) => n * 2;
```

Prefira **funções pequenas** e com nomes que descrevam o que fazem.', 720, 1),
(2, 'Arrays e métodos essenciais', 'map, filter e reduce na prática.', 'texto', NULL,
'# Arrays

```js
const precos = [10, 25, 40];
const comDesconto = precos.map((p) => p * 0.9);
const caros = precos.filter((p) => p > 20);
const total = precos.reduce((soma, p) => soma + p, 0);
```', 840, 2),
-- Curso 1 · Módulo 3
(3, 'Promises e async/await', 'Entendendo código assíncrono.', 'texto', NULL,
'# Código assíncrono

Uma **Promise** representa um valor que ficará disponível no futuro.

```js
async function carregar() {
  try {
    const resposta = await fetch("/api/publico/cursos");
    const cursos = await resposta.json();
    console.log(cursos);
  } catch (erro) {
    console.error("Falha na requisição", erro);
  }
}
```', 900, 1),
-- Curso 2
(4, 'O que é um banco de dados relacional', 'Tabelas, linhas, colunas e chaves.', 'texto', NULL,
'# Banco de dados relacional

Os dados ficam em **tabelas** formadas por **linhas** (registros) e **colunas** (campos).

- **Chave primária (PK):** identifica cada registro
- **Chave estrangeira (FK):** liga uma tabela a outra

Nesta própria plataforma, um **curso** tem vários **módulos** e cada módulo tem várias **aulas**.', 600, 1),
(4, 'SQL: curso completo (vídeo)', 'Vídeo introdutório sobre SQL.', 'externo', 'https://www.youtube.com/watch?v=HXV3zeQKqGY', NULL, 2400, 2),
(5, 'CRUD com SQL', 'INSERT, SELECT, UPDATE e DELETE.', 'texto', NULL,
'# CRUD com SQL

```sql
-- CREATE
INSERT INTO cursos (titulo, nivel) VALUES (''Node.js'', ''iniciante'');

-- READ
SELECT id, titulo FROM cursos WHERE publicado = 1;

-- UPDATE
UPDATE cursos SET titulo = ''Node.js Avançado'' WHERE id = 5;

-- DELETE
DELETE FROM cursos WHERE id = 5;
```

> Sempre use **WHERE** no UPDATE e no DELETE!', 900, 1),
(5, 'JOIN entre tabelas', 'Combinando dados de várias tabelas.', 'texto', NULL,
'# JOIN

```sql
SELECT c.titulo, m.titulo AS modulo
FROM cursos c
JOIN modulos m ON m.curso_id = c.id
ORDER BY c.id, m.ordem;
```', 780, 2),
-- Curso 3
(6, 'Criando o servidor', 'express(), middlewares e app.listen.', 'texto', NULL,
'# Criando o servidor

```js
import express from "express";

const app = express();
app.use(express.json());

app.get("/api/saude", (req, res) => {
  res.json({ status: "ok" });
});

app.listen(3000, () => console.log("Servidor rodando"));
```', 660, 1),
(6, 'Rotas e controllers', 'Separando responsabilidades.', 'texto', NULL,
'# Rotas e controllers

- **Rota:** define *qual* método HTTP e *qual* caminho
- **Controller:** define *o que* acontece (regras + banco)

```js
router.get("/", listarCursos);
router.post("/", cadastrarCurso);
router.put("/:id", atualizarCurso);
router.delete("/:id", excluirCurso);
```', 720, 2),
(7, 'Conectando ao MySQL com mysql2', 'Pool de conexões e consultas parametrizadas.', 'texto', NULL,
'# Pool de conexões

```js
const [linhas] = await pool.query(
  "SELECT * FROM cursos WHERE id = ?",
  [id]
);
```

O `?` evita **SQL Injection**: o valor é enviado separado do comando.', 840, 1),
(8, 'Como funciona o JWT', 'Header, payload e assinatura.', 'texto', NULL,
'# JSON Web Token

Um JWT tem três partes separadas por ponto: `header.payload.assinatura`.

1. O usuário faz login com e-mail e senha
2. O servidor valida e **assina** um token
3. O navegador envia o token nas próximas requisições
4. O servidor confere a assinatura antes de responder', 780, 1),
-- Curso 4
(9, 'Hierarquia visual', 'Guiando o olhar do usuário.', 'texto', NULL,
'# Hierarquia visual

Tamanho, peso, cor e espaçamento definem **o que é mais importante** na tela.

- Um único destaque principal por tela
- Agrupe o que é relacionado
- Use espaço em branco com generosidade', 540, 1),
(10, 'Contraste e acessibilidade', 'Cores legíveis para todos.', 'texto', NULL,
'# Contraste

Textos devem ter contraste mínimo de **4.5:1** com o fundo (WCAG AA).

> Cor nunca deve ser a única forma de transmitir uma informação.', 480, 1);

-- Progresso de exemplo da aluna Ana (para o painel não começar vazio)
INSERT INTO matriculas (usuario_id, curso_id, ultimo_acesso) VALUES (100, 1, NOW() - INTERVAL 1 DAY), (100, 2, NOW() - INTERVAL 3 DAY);
INSERT INTO progresso_aulas (usuario_id, aula_id, concluida, concluida_em) VALUES
(100, 1, 1, NOW() - INTERVAL 2 DAY), (100, 2, 1, NOW() - INTERVAL 1 DAY), (100, 7, 1, NOW() - INTERVAL 3 DAY);
UPDATE matriculas SET ultima_aula_id = 3 WHERE usuario_id = 100 AND curso_id = 1;
UPDATE matriculas SET ultima_aula_id = 8 WHERE usuario_id = 100 AND curso_id = 2;

-- Consultas úteis para a apresentação
-- SELECT * FROM usuarios;
-- SELECT * FROM vw_cursos_resumo;
-- SELECT * FROM cursos;
-- SELECT * FROM modulos WHERE curso_id = 1 ORDER BY ordem;
-- SELECT * FROM aulas WHERE modulo_id = 1 ORDER BY ordem;
