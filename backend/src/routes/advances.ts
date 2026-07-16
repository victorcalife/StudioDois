import { Router } from 'express';
import { pool, query } from '../db.js';
import { advanceSchema, advanceUpdateSchema, paymentSchema } from '../validation.js';

export const advancesRouter = Router();

advancesRouter.get('/', async (req, res, next) => {
  try {
    const search = String(req.query.search ?? '').trim();
    const status = String(req.query.status ?? '').trim();
    const tipo = String(req.query.tipo ?? '').trim();
    const funcionarioId = String(req.query.funcionarioId ?? '').trim();
    const result = await query(
      `SELECT id, funcionario_id, funcionario_nome, funcionario_cargo, tipo, descricao, valor_original,
              valor_pago, saldo_aberto, data_lancamento, data_vencimento, parcelas_total,
              status_calculado, status, quitado_em, observacoes, created_at, updated_at
         FROM vw_adiantamentos_saldo
        WHERE ($1::TEXT = '' OR descricao ILIKE '%' || $1 || '%' OR funcionario_nome ILIKE '%' || $1 || '%')
          AND ($2::TEXT = '' OR status_calculado = $2)
          AND ($3::TEXT = '' OR tipo = $3)
          AND ($4::TEXT = '' OR funcionario_id = $4::UUID)
        ORDER BY CASE WHEN status_calculado = 'quitado' THEN 1 ELSE 0 END ASC,
                 COALESCE(data_vencimento, data_lancamento) ASC,
                 created_at DESC`,
      [search, status, tipo, funcionarioId]
    );
    return res.json(result.rows);
  } catch (error) {
    return next(error);
  }
});

advancesRouter.post('/', async (req, res, next) => {
  try {
    const body = advanceSchema.parse(req.body);
    const result = await query<{ id: string }>(
      `INSERT INTO adiantamentos (funcionario_id, tipo, descricao, valor_original, data_lancamento, data_vencimento, parcelas_total, observacoes)
       VALUES ($1, $2, $3, $4, COALESCE($5, CURRENT_DATE), $6, COALESCE($7, 1), $8)
       RETURNING id`,
      [body.funcionarioId, body.tipo, body.descricao, body.valorOriginal, body.dataLancamento ?? null, body.dataVencimento ?? null, body.parcelasTotal ?? 1, body.observacoes ?? null]
    );
    const created = await query('SELECT * FROM vw_adiantamentos_saldo WHERE id = $1', [result.rows[0].id]);
    return res.status(201).json(created.rows[0]);
  } catch (error) {
    return next(error);
  }
});

advancesRouter.patch('/:id', async (req, res, next) => {
  try {
    const body = advanceUpdateSchema.parse(req.body);
    const result = await query(
      `UPDATE adiantamentos
          SET funcionario_id = COALESCE($2, funcionario_id),
              tipo = COALESCE($3, tipo),
              descricao = COALESCE($4, descricao),
              valor_original = COALESCE($5, valor_original),
              data_lancamento = CASE WHEN $6::BOOLEAN THEN $7 ELSE data_lancamento END,
              data_vencimento = CASE WHEN $8::BOOLEAN THEN $9 ELSE data_vencimento END,
              parcelas_total = COALESCE($10, parcelas_total),
              observacoes = CASE WHEN $11::BOOLEAN THEN $12 ELSE observacoes END,
              status = COALESCE($13, status),
              quitado_em = CASE WHEN $13 = 'quitado' THEN COALESCE(quitado_em, now()) WHEN $13 IN ('aberto', 'parcial') THEN NULL ELSE quitado_em END
        WHERE id = $1
        RETURNING id`,
      [
        req.params.id,
        body.funcionarioId,
        body.tipo,
        body.descricao,
        body.valorOriginal,
        Object.prototype.hasOwnProperty.call(body, 'dataLancamento'),
        body.dataLancamento ?? null,
        Object.prototype.hasOwnProperty.call(body, 'dataVencimento'),
        body.dataVencimento ?? null,
        body.parcelasTotal,
        Object.prototype.hasOwnProperty.call(body, 'observacoes'),
        body.observacoes ?? null,
        body.status
      ]
    );
    if (result.rowCount === 0) {
      return res.status(404).json({ message: 'Lançamento não encontrado.' });
    }
    const updated = await query('SELECT * FROM vw_adiantamentos_saldo WHERE id = $1', [req.params.id]);
    return res.json(updated.rows[0]);
  } catch (error) {
    return next(error);
  }
});

advancesRouter.get('/:id/payments', async (req, res, next) => {
  try {
    const result = await query(
      `SELECT id, adiantamento_id, valor, pago_em, observacoes, created_at
         FROM pagamentos_adiantamento
        WHERE adiantamento_id = $1
        ORDER BY pago_em DESC, created_at DESC`,
      [req.params.id]
    );
    return res.json(result.rows);
  } catch (error) {
    return next(error);
  }
});

advancesRouter.post('/:id/payments', async (req, res, next) => {
  const client = await pool.connect();
  try {
    const body = paymentSchema.parse(req.body);
    await client.query('BEGIN');
    const advance = await client.query('SELECT id FROM adiantamentos WHERE id = $1 AND status <> $2 FOR UPDATE', [req.params.id, 'cancelado']);
    if (advance.rowCount === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Lançamento não encontrado.' });
    }
    await client.query(
      `INSERT INTO pagamentos_adiantamento (adiantamento_id, valor, pago_em, observacoes)
       VALUES ($1, $2, COALESCE($3, CURRENT_DATE), $4)`,
      [req.params.id, body.valor, body.pagoEm ?? null, body.observacoes ?? null]
    );
    const balance = await client.query('SELECT valor_original, valor_pago FROM vw_adiantamentos_saldo WHERE id = $1', [req.params.id]);
    const original = Number(balance.rows[0].valor_original);
    const paid = Number(balance.rows[0].valor_pago);
    if (paid > original) {
      await client.query('ROLLBACK');
      return res.status(400).json({ message: 'Pagamento maior que o saldo em aberto.' });
    }
    const status = paid >= original ? 'quitado' : 'parcial';
    await client.query('UPDATE adiantamentos SET status = $2, quitado_em = CASE WHEN $2 = $3 THEN COALESCE(quitado_em, now()) ELSE NULL END WHERE id = $1', [req.params.id, status, 'quitado']);
    await client.query('COMMIT');
    const updated = await query('SELECT * FROM vw_adiantamentos_saldo WHERE id = $1', [req.params.id]);
    return res.status(201).json(updated.rows[0]);
  } catch (error) {
    await client.query('ROLLBACK');
    return next(error);
  } finally {
    client.release();
  }
});

advancesRouter.post('/:id/settle', async (req, res, next) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const locked = await client.query('SELECT id FROM adiantamentos WHERE id = $1 AND status <> $2 FOR UPDATE', [req.params.id, 'cancelado']);
    if (locked.rowCount === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Lançamento não encontrado.' });
    }
    const balance = await client.query('SELECT id, saldo_aberto FROM vw_adiantamentos_saldo WHERE id = $1', [req.params.id]);
    const remaining = Number(balance.rows[0].saldo_aberto);
    if (remaining > 0) {
      await client.query(
        `INSERT INTO pagamentos_adiantamento (adiantamento_id, valor, pago_em, observacoes)
         VALUES ($1, $2, CURRENT_DATE, $3)`,
        [req.params.id, remaining, 'Quitação total registrada pelo carimbo de quitado.']
      );
    }
    await client.query('UPDATE adiantamentos SET status = $2, quitado_em = COALESCE(quitado_em, now()) WHERE id = $1', [req.params.id, 'quitado']);
    await client.query('COMMIT');
    const updated = await query('SELECT * FROM vw_adiantamentos_saldo WHERE id = $1', [req.params.id]);
    return res.json(updated.rows[0]);
  } catch (error) {
    await client.query('ROLLBACK');
    return next(error);
  } finally {
    client.release();
  }
});

advancesRouter.post('/:id/reopen', async (req, res, next) => {
  try {
    const result = await query(
      `UPDATE adiantamentos
          SET status = CASE WHEN EXISTS (SELECT 1 FROM pagamentos_adiantamento p WHERE p.adiantamento_id = adiantamentos.id) THEN 'parcial' ELSE 'aberto' END,
              quitado_em = NULL
        WHERE id = $1
        RETURNING id`,
      [req.params.id]
    );
    if (result.rowCount === 0) {
      return res.status(404).json({ message: 'Lançamento não encontrado.' });
    }
    const updated = await query('SELECT * FROM vw_adiantamentos_saldo WHERE id = $1', [req.params.id]);
    return res.json(updated.rows[0]);
  } catch (error) {
    return next(error);
  }
});