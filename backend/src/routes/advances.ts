import { Router } from 'express';
import type { PoolClient } from 'pg';
import { pool, query } from '../db.js';
import { advanceSchema, advanceUpdateSchema, installmentPaymentSchema, paymentSchema } from '../validation.js';

export const advancesRouter = Router();

type InstallmentInput = {
  numero: number;
  valorPrevisto: number;
  dataVencimento: string;
  observacoes?: string | null;
};

function addDays(dateValue: string, days: number) {
  const [year, month, day] = dateValue.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return date.toISOString().slice(0, 10);
}

function splitMoney(total: number, count: number) {
  const cents = Math.round(total * 100);
  const base = Math.floor(cents / count);
  const remainder = cents - base * count;
  return Array.from({ length: count }, (_, index) => (base + (index < remainder ? 1 : 0)) / 100);
}

function buildInstallments(total: number, count: number, intervalDays: number, firstDueDate?: string | null, custom?: InstallmentInput[]) {
  if (custom?.length) {
    const sum = custom.reduce((acc, item) => acc + Number(item.valorPrevisto), 0);
    if (Math.abs(sum - total) > 0.01) {
      return { error: 'A soma das parcelas precisa fechar com o valor total do lançamento.', installments: [] as InstallmentInput[] };
    }
    return { installments: custom.sort((a, b) => a.numero - b.numero) };
  }

  if (!firstDueDate) {
    return { error: 'Informe a data da primeira parcela.', installments: [] as InstallmentInput[] };
  }

  const values = splitMoney(total, count);
  return {
    installments: values.map((value, index) => ({
      numero: index + 1,
      valorPrevisto: value,
      dataVencimento: addDays(firstDueDate, index * intervalDays),
      observacoes: null
    }))
  };
}

async function allocatePaymentToInstallments(
  client: PoolClient,
  advanceId: string,
  amount: number,
  paidAt?: string | null,
  notes?: string | null,
  startFromInstallmentId?: string
) {
  let remainingPayment = amount;
  const selectedInstallment = startFromInstallmentId
    ? await client.query('SELECT data_vencimento, numero FROM parcelas_adiantamento WHERE id = $1 AND adiantamento_id = $2', [startFromInstallmentId, advanceId])
    : null;

  const installments = await client.query(
    `SELECT id, valor_previsto
       FROM parcelas_adiantamento
      WHERE adiantamento_id = $1
        AND status = 'aberta'
        AND ($2::UUID IS NULL OR id = $2::UUID OR (data_vencimento, numero) > ($3::DATE, $4::INTEGER))
      ORDER BY CASE WHEN id = $2::UUID THEN 0 ELSE 1 END ASC,
               data_vencimento ASC,
               numero ASC
      FOR UPDATE`,
    [
      advanceId,
      startFromInstallmentId ?? null,
      selectedInstallment?.rows[0]?.data_vencimento ?? null,
      selectedInstallment?.rows[0]?.numero ?? 0
    ]
  );

  for (const installment of installments.rows) {
    if (remainingPayment <= 0) break;
    const paid = await client.query('SELECT COALESCE(SUM(valor), 0)::NUMERIC(12,2) AS valor_pago FROM pagamentos_adiantamento WHERE parcela_id = $1', [installment.id]);
    const installmentBalance = Math.max(Number(installment.valor_previsto) - Number(paid.rows[0].valor_pago), 0);
    const allocated = Math.min(remainingPayment, installmentBalance);

    if (allocated <= 0) continue;

    await client.query(
      `INSERT INTO pagamentos_adiantamento (adiantamento_id, parcela_id, valor, pago_em, observacoes)
       VALUES ($1, $2, $3, COALESCE($4, CURRENT_DATE), $5)`,
      [advanceId, installment.id, allocated, paidAt ?? null, notes ?? null]
    );

    remainingPayment = Number((remainingPayment - allocated).toFixed(2));

    if (allocated >= installmentBalance) {
      await client.query('UPDATE parcelas_adiantamento SET status = $2, pago_em = COALESCE($3, CURRENT_DATE) WHERE id = $1', [installment.id, 'paga', paidAt ?? null]);
    }
  }

  return remainingPayment;
}

advancesRouter.get('/', async (req, res, next) => {
  try {
    const search = String(req.query.search ?? '').trim();
    const status = String(req.query.status ?? '').trim();
    const tipo = String(req.query.tipo ?? '').trim();
    const funcionarioId = String(req.query.funcionarioId ?? '').trim();
    const result = await query(
      `SELECT id, funcionario_id, funcionario_nome, funcionario_cargo, tipo, descricao, valor_original,
              valor_pago, saldo_aberto, data_lancamento, data_vencimento, parcelas_total,
              status_calculado, status, quitado_em, proximo_vencimento, parcelas_abertas, observacoes, created_at, updated_at
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
  const client = await pool.connect();
  try {
    const body = advanceSchema.parse(req.body);
    const parcelasTotal = body.parcelasRecebimento?.length ?? body.parcelasTotal ?? 1;
    const intervaloDias = body.intervaloDias ?? 30;
    const generated = buildInstallments(body.valorOriginal, parcelasTotal, intervaloDias, body.dataVencimento ?? body.dataLancamento, body.parcelasRecebimento);

    if (generated.error) {
      return res.status(400).json({ message: generated.error });
    }

    await client.query('BEGIN');
    const result = await client.query<{ id: string }>(
      `INSERT INTO adiantamentos (funcionario_id, tipo, descricao, valor_original, data_lancamento, data_vencimento, parcelas_total, intervalo_cobranca_dias, observacoes)
       VALUES ($1, $2, $3, $4, COALESCE($5, CURRENT_DATE), $6, COALESCE($7, 1), $8, $9)
       RETURNING id`,
      [body.funcionarioId, body.tipo, body.descricao, body.valorOriginal, body.dataLancamento ?? null, generated.installments[0].dataVencimento, generated.installments.length, intervaloDias, body.observacoes ?? null]
    );
    const advanceId = result.rows[0].id;
    for (const installment of generated.installments) {
      await client.query(
        `INSERT INTO parcelas_adiantamento (adiantamento_id, numero, valor_previsto, data_vencimento, observacoes)
         VALUES ($1, $2, $3, $4, $5)`,
        [advanceId, installment.numero, installment.valorPrevisto, installment.dataVencimento, installment.observacoes ?? null]
      );
    }
    await client.query('COMMIT');
    const created = await query('SELECT * FROM vw_adiantamentos_saldo WHERE id = $1', [advanceId]);
    return res.status(201).json(created.rows[0]);
  } catch (error) {
    await client.query('ROLLBACK');
    return next(error);
  } finally {
    client.release();
  }
});

advancesRouter.get('/receivables', async (req, res, next) => {
  try {
    const search = String(req.query.search ?? '').trim();
    const faixa = String(req.query.faixa ?? '').trim();
    const funcionarioId = String(req.query.funcionarioId ?? '').trim();
    const result = await query(
      `SELECT id, adiantamento_id, numero, funcionario_id, funcionario_nome, funcionario_cargo,
              tipo, descricao, valor_previsto, valor_pago, saldo_parcela, data_vencimento,
              status, faixa_recebimento, pago_em, observacoes, created_at, updated_at
         FROM vw_parcelas_recebimento
        WHERE status <> 'cancelada'
          AND ($1::TEXT = '' OR descricao ILIKE '%' || $1 || '%' OR funcionario_nome ILIKE '%' || $1 || '%')
          AND ($2::TEXT = '' OR faixa_recebimento = $2)
          AND ($3::TEXT = '' OR funcionario_id = $3::UUID)
        ORDER BY CASE WHEN faixa_recebimento = 'paga' THEN 1 ELSE 0 END ASC,
                 data_vencimento ASC,
                 funcionario_nome ASC,
                 numero ASC`,
      [search, faixa, funcionarioId]
    );
    return res.json(result.rows);
  } catch (error) {
    return next(error);
  }
});

advancesRouter.post('/installments/:id/receive', async (req, res, next) => {
  const client = await pool.connect();
  try {
    const body = installmentPaymentSchema.parse(req.body);
    await client.query('BEGIN');
    const installment = await client.query(
      `SELECT pa.id, pa.adiantamento_id, pa.valor_previsto, COALESCE(SUM(p.valor), 0)::NUMERIC(12,2) AS valor_pago
         FROM parcelas_adiantamento pa
         LEFT JOIN pagamentos_adiantamento p ON p.parcela_id = pa.id
        WHERE pa.id = $1 AND pa.status <> 'cancelada'
        GROUP BY pa.id
        FOR UPDATE OF pa`,
      [req.params.id]
    );
    if (installment.rowCount === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Parcela não encontrada.' });
    }
    const advanceId = installment.rows[0].adiantamento_id as string;
    const expected = Number(installment.rows[0].valor_previsto);
    const alreadyPaid = Number(installment.rows[0].valor_pago);
    const remaining = Math.max(expected - alreadyPaid, 0);
    const totalOpen = await client.query('SELECT COALESCE(SUM(saldo_parcela), 0)::NUMERIC(12,2) AS saldo_aberto FROM vw_parcelas_recebimento WHERE adiantamento_id = $1 AND status = $2', [advanceId, 'aberta']);
    const totalRemaining = Number(totalOpen.rows[0].saldo_aberto);
    const amount = body.valor ?? remaining;

    if (remaining <= 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ message: 'Parcela já está paga.' });
    }

    if (amount > totalRemaining) {
      await client.query('ROLLBACK');
      return res.status(400).json({ message: 'Recebimento maior que o saldo em aberto do lançamento.' });
    }

    const remainingAfterAllocation = await allocatePaymentToInstallments(client, advanceId, amount, body.pagoEm ?? null, body.observacoes ?? null, req.params.id);
    if (remainingAfterAllocation > 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ message: 'Não foi possível alocar todo o recebimento nas parcelas abertas.' });
    }

    const balance = await client.query('SELECT valor_original, valor_pago FROM vw_adiantamentos_saldo WHERE id = $1', [advanceId]);
    const status = Number(balance.rows[0].valor_pago) >= Number(balance.rows[0].valor_original) ? 'quitado' : 'parcial';
    await client.query('UPDATE adiantamentos SET status = $2, quitado_em = CASE WHEN $2 = $3 THEN COALESCE(quitado_em, now()) ELSE NULL END WHERE id = $1', [advanceId, status, 'quitado']);
    await client.query('COMMIT');
    const updated = await query('SELECT * FROM vw_parcelas_recebimento WHERE id = $1', [req.params.id]);
    return res.status(201).json(updated.rows[0]);
  } catch (error) {
    await client.query('ROLLBACK');
    return next(error);
  } finally {
    client.release();
  }
});

advancesRouter.get('/:id/installments', async (req, res, next) => {
  try {
    const result = await query(
      `SELECT id, adiantamento_id, numero, funcionario_id, funcionario_nome, funcionario_cargo,
              tipo, descricao, valor_previsto, valor_pago, saldo_parcela, data_vencimento,
              status, faixa_recebimento, pago_em, observacoes, created_at, updated_at
         FROM vw_parcelas_recebimento
        WHERE adiantamento_id = $1
        ORDER BY numero ASC`,
      [req.params.id]
    );
    return res.json(result.rows);
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
    const remainingPayment = await allocatePaymentToInstallments(client, req.params.id, body.valor, body.pagoEm ?? null, body.observacoes ?? null);

    if (remainingPayment > 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ message: 'Pagamento maior que o saldo em aberto.' });
    }

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
    if (Number(balance.rows[0].saldo_aberto) > 0) {
      const installments = await client.query(
        `SELECT id, valor_previsto
           FROM parcelas_adiantamento
          WHERE adiantamento_id = $1 AND status = 'aberta'
          ORDER BY data_vencimento ASC, numero ASC
          FOR UPDATE`,
        [req.params.id]
      );

      for (const installment of installments.rows) {
        const paid = await client.query('SELECT COALESCE(SUM(valor), 0)::NUMERIC(12,2) AS valor_pago FROM pagamentos_adiantamento WHERE parcela_id = $1', [installment.id]);
        const installmentBalance = Math.max(Number(installment.valor_previsto) - Number(paid.rows[0].valor_pago), 0);

        if (installmentBalance <= 0) {
          await client.query('UPDATE parcelas_adiantamento SET status = $2, pago_em = CURRENT_DATE WHERE id = $1', [installment.id, 'paga']);
          continue;
        }

        await client.query(
          `INSERT INTO pagamentos_adiantamento (adiantamento_id, parcela_id, valor, pago_em, observacoes)
           VALUES ($1, $2, $3, CURRENT_DATE, $4)`,
          [req.params.id, installment.id, installmentBalance, 'Quitação total registrada pelo carimbo de quitado.']
        );
        await client.query('UPDATE parcelas_adiantamento SET status = $2, pago_em = CURRENT_DATE WHERE id = $1', [installment.id, 'paga']);
      }
    } else {
      await client.query(
        `UPDATE parcelas_adiantamento
            SET status = 'paga', pago_em = COALESCE(pago_em, CURRENT_DATE)
          WHERE adiantamento_id = $1 AND status = 'aberta'`,
        [req.params.id]
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