# Studio 2 — Controle de Adiantamentos

Sistema web simples, bonito e funcional para controlar valores que funcionários pegam antecipadamente: adiantamentos, empréstimos, compras, ferramentas e outros lançamentos.

O projeto está separado em dois serviços Railway dentro do mesmo repositório:

- `backend/`: API Node.js + TypeScript + Express + PostgreSQL nativo com `pg`.
- `frontend/`: React + TypeScript + Vite + Recharts.

Não usa ORM, não usa `.env` e não executa migrations automaticamente. O banco deve ser alterado manualmente no TablePlus usando os arquivos SQL da pasta `migrations/`.

## Funcionalidades entregues

- Entrada por senha única com JWT.
- Cadastro de funcionários.
- Lançamento de adiantamentos, empréstimos, compras, ferramentas e outros débitos.
- Pagamento parcial por lançamento.
- Botão de “carimbar quitado”, registrando a quitação real no banco.
- Dashboard com KPIs de total emprestado, total pago, saldo aberto e funcionários ativos.
- Gráficos por funcionário e por tipo de lançamento.
- Filtros por busca, status e tipo.
- Colunas customizáveis na tabela.
- Exportação CSV dos lançamentos filtrados.
- Interface responsiva em chumbo, azul e branco.

## Banco de dados

Execute manualmente no TablePlus, no PostgreSQL da Railway:

- `migrations/01_criar_gestao_adiantamentos.sql`

Esse script cria:

- `funcionarios`
- `adiantamentos`
- `pagamentos_adiantamento`
- `vw_adiantamentos_saldo`
- índices para filtros, buscas, status, vencimento e relacionamentos
- triggers de `updated_at`

## Variáveis do backend no Railway

Configurar no serviço `backend`:

- `DATABASE_URL`: string PostgreSQL da Railway.
- `JWT_SECRET`: segredo forte para assinar tokens.
- `ACCESS_PASSWORD_HASH`: hash bcrypt da senha única de entrada.
- `ALLOWED_ORIGINS`: URL pública do frontend Railway.
- `NODE_ENV`: `production`.
- `PORT`: `8080`.

Para gerar o hash da senha única, use o script do backend em um ambiente seguro e copie apenas o resultado para `ACCESS_PASSWORD_HASH` no Railway:

- `npm run hash-password -- senhaEscolhida`

## Variáveis do frontend no Railway

Configurar no serviço `frontend`:

- `VITE_API_URL`: URL pública do backend Railway.

O serviço frontend usa `VITE_API_URL` exclusivamente para chamar a API. Para o host público do próprio frontend, o `vite.config.ts` não possui domínio fixo: ele usa a variável automática `RAILWAY_PUBLIC_DOMAIN`, quando disponível no Railway, e também aceita `ALLOWED_ORIGINS` caso essa variável seja disponibilizada no serviço frontend para restringir o `preview.allowedHosts`.

O serviço frontend usa a porta injetada pelo Railway em `PORT`, sem porta fixa no comando `start`.

## Deploy Railway

Criar dois serviços apontando para o mesmo repositório:

### Serviço backend

- Root directory: `backend`
- Build command: `npm install && npm run build`
- Start command: `npm start`

### Serviço frontend

- Root directory: `frontend`
- Build command: `npm install && npm run build`
- Start command: `npm start`

## Segurança e operação

- Sem usuário/senha tradicional: somente senha única, armazenada como bcrypt hash em variável Railway.
- Tokens expiram em 8 horas.
- CORS aceita apenas as origens configuradas em `ALLOWED_ORIGINS`.
- O Vite preview não possui domínio hardcoded; o host permitido é resolvido por variável de ambiente.
- Erros não retornam detalhes sensíveis do banco.
- Pagamento parcial maior que o saldo em aberto é bloqueado.

## Validação realizada

- Backend: `npm run build` concluído com sucesso.
- Backend: `npm audit --audit-level=moderate` sem vulnerabilidades.
- Frontend: `npm run build` concluído com sucesso.
- Frontend: `npm audit --audit-level=moderate` sem vulnerabilidades.
- Diagnósticos do editor: sem erros.
