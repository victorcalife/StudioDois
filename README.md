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
- Parcelamento do recebimento em múltiplas datas futuras no próprio lançamento.
- Escolha da quantidade de parcelas e do intervalo de cobrança em dias.
- Agenda de recebíveis com vencidos, próximos 7 dias, próximos 30 dias, mês atual e futuros.
- Recebimento por parcela, com baixa automática do saldo do lançamento.
- Pagamento antecipado ou maior que a parcela é distribuído nas próximas parcelas abertas, recalculando os saldos restantes.
- Campos monetários com máscara brasileira `R$ 1.234,56`, digitando apenas números e enviando payload numérico decimal para a API.
- Dashboard com KPIs de total emprestado, total pago, saldo aberto e funcionários ativos.
- Gráficos por funcionário e por tipo de lançamento.
- Filtros por busca, status e tipo.
- Colunas customizáveis na tabela.
- Exportação CSV dos lançamentos filtrados.
- Interface responsiva em chumbo, azul e branco.

## Banco de dados

Execute manualmente no TablePlus, no PostgreSQL da Railway:

- `migrations/01_criar_gestao_adiantamentos.sql`
- `migrations/02_criar_parcelas_recebimento.sql`
- `migrations/03_adicionar_intervalo_cobranca.sql`

Execute na ordem acima. A migration `02` é incremental e cria a agenda de recebíveis parcelados.
A migration `03` adiciona o intervalo de cobrança em dias ao lançamento.

A estrutura cria:

- `funcionarios`
- `adiantamentos`
- `pagamentos_adiantamento`
- `parcelas_adiantamento`
- `vw_adiantamentos_saldo`
- `vw_parcelas_recebimento`
- índices para filtros, buscas, status, vencimento e relacionamentos
- triggers de `updated_at`

Observação operacional: se a primeira tentativa da migration `02` tiver dado rollback por alteração de view, use a versão atual do arquivo. Ela derruba e recria as views com segurança dentro da própria transação.

## Variáveis do backend no Railway

Configurar no serviço `backend`:

- `DATABASE_URL`: string PostgreSQL da Railway.
- `JWT_SECRET`: segredo forte para assinar tokens.
- `ACCESS_PASSWORD_HASH`: hash bcrypt da senha única de entrada.
- `ALLOWED_ORIGINS`: URL pública do frontend Railway, sem barra final.
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
- O preflight `OPTIONS` é respondido antes das rotas autenticadas para liberar chamadas do frontend autorizado.
- O Vite preview não possui domínio hardcoded; o host permitido é resolvido por variável de ambiente.
- Erros não retornam detalhes sensíveis do banco.
- Pagamento parcial maior que o saldo em aberto é bloqueado.
- Pagamentos por lançamento são alocados nas parcelas abertas mais antigas.
- O carimbo de quitado baixa todas as parcelas em aberto do lançamento.
- Recebimentos por parcela aceitam valor maior que a parcela, desde que não ultrapassem o saldo aberto do lançamento, e alocam o excedente nas próximas parcelas.

## Validação realizada

- Backend: `npm run build` concluído com sucesso.
- Backend: `npm audit --audit-level=moderate` sem vulnerabilidades.
- Frontend: `npm run build` concluído com sucesso.
- Frontend: `npm audit --audit-level=moderate` sem vulnerabilidades.
- Diagnósticos do editor: sem erros.
