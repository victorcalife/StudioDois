# PROJECT_CONTEXT — Studio 2

## Estado atual

Projeto criado para controle rápido de adiantamentos/empréstimos de funcionários da empresa Studio 2.

Arquitetura consolidada:

- Monorepo com dois serviços Railway: `backend/` e `frontend/`.
- Backend Node.js/TypeScript com Express, JWT, bcryptjs, CORS, Helmet e PostgreSQL nativo via `pg`.
- Frontend React/TypeScript com Vite, Recharts e interface responsiva em chumbo, azul e branco.
- Sem `.env`, sem ORM, sem seed/mock e sem migrations automáticas em runtime.

## Banco de dados

Migration criada:

- `migrations/01_criar_gestao_adiantamentos.sql`

Objetos criados pela migration:

- `funcionarios`
- `adiantamentos`
- `pagamentos_adiantamento`
- `vw_adiantamentos_saldo`
- função/trigger `set_updated_at`
- índices para busca por nome, ativos, funcionário, status, tipo, vencimento, lançamento e pagamentos

O usuário deve executar essa migration manualmente no TablePlus no PostgreSQL da Railway antes de usar o sistema.

## Backend

Arquivos principais:

- `backend/src/config.ts`: valida variáveis obrigatórias Railway.
- `backend/src/db.ts`: pool PostgreSQL nativo.
- `backend/src/app.ts`: Express, CORS, Helmet e rotas.
- `backend/src/routes/auth.ts`: login por senha única.
- `backend/src/routes/employees.ts`: CRUD básico e resumo por funcionário.
- `backend/src/routes/advances.ts`: lançamentos, pagamentos parciais, quitação e reabertura.
- `backend/src/routes/dashboard.ts`: KPIs e dados dos gráficos.
- `backend/scripts/hash-password.mjs`: gera hash bcrypt para `ACCESS_PASSWORD_HASH`.

Variáveis obrigatórias do backend:

- `DATABASE_URL`
- `JWT_SECRET`
- `ACCESS_PASSWORD_HASH`
- `ALLOWED_ORIGINS`
- `NODE_ENV=production`
- `PORT=8080`

## Frontend

Arquivos principais:

- `frontend/src/App.tsx`: aplicação principal, login, dashboard, formulários, filtros e tabela.
- `frontend/src/api.ts`: cliente HTTP usando `VITE_API_URL`.
- `frontend/src/styles.css`: UI responsiva chumbo/azul/branco.
- `frontend/src/types.ts`: tipos compartilhados da interface.

Variável obrigatória do frontend:

- `VITE_API_URL`

Variáveis usadas pelo runtime do Vite preview no frontend:

- `PORT`, injetada pela Railway.
- `RAILWAY_PUBLIC_DOMAIN`, quando disponibilizada automaticamente pela Railway.
- `ALLOWED_ORIGINS`, opcional no frontend caso seja necessário restringir explicitamente `preview.allowedHosts` sem hardcode.

O frontend não possui domínio, URL pública, host ou porta fixa no `vite.config.ts` ou nos scripts do `package.json`.

Funcionalidades visuais/operacionais:

- Dashboard com KPIs.
- Gráfico de maiores saldos por funcionário.
- Gráfico por tipo de lançamento.
- Cadastro de funcionário.
- Lançamento de valores.
- Pagamento parcial.
- Carimbo visual e persistente de quitado.
- Filtros e exportação CSV.
- Colunas customizáveis.
- Tabela vira cards em telas pequenas.

## Validação executada

- `backend`: `npm run build` passou.
- `backend`: `npm audit --audit-level=moderate` retornou zero vulnerabilidades.
- `frontend`: `npm run build` passou.
- `frontend`: `npm audit --audit-level=moderate` retornou zero vulnerabilidades.
- Diagnósticos do editor para `backend/` e `frontend/`: sem erros.

## Próximo passo técnico

1. Executar `migrations/01_criar_gestao_adiantamentos.sql` no TablePlus conectado ao PostgreSQL da Railway.
2. Conferir as variáveis dos dois serviços Railway.
3. Fazer deploy dos dois serviços com root directories `backend` e `frontend`.
4. Abrir a URL do frontend, entrar com a senha configurada e cadastrar os primeiros funcionários/lançamentos reais.