import { Router } from 'express';
import { query } from '../db.js';
import { employeeSchema } from '../validation.js';

export const employeesRouter = Router();

employeesRouter.get('/', async (req, res, next) => {
  try {
    const search = String(req.query.search ?? '').trim();
    const includeInactive = req.query.includeInactive === 'true';
    const result = await query(
      `SELECT f.id, f.nome, f.cargo, f.telefone, f.observacoes, f.ativo, f.created_at,
              COALESCE(SUM(v.valor_original), 0)::NUMERIC(12,2) AS total_emprestado,
              COALESCE(SUM(v.valor_pago), 0)::NUMERIC(12,2) AS total_pago,
              COALESCE(SUM(v.saldo_aberto), 0)::NUMERIC(12,2) AS saldo_aberto,
              COUNT(v.id) FILTER (WHERE v.status_calculado <> 'quitado' AND v.status_calculado <> 'cancelado')::INTEGER AS lancamentos_abertos
         FROM funcionarios f
         LEFT JOIN vw_adiantamentos_saldo v ON v.funcionario_id = f.id
        WHERE ($1::TEXT = '' OR f.nome ILIKE '%' || $1 || '%' OR COALESCE(f.cargo, '') ILIKE '%' || $1 || '%')
          AND ($2::BOOLEAN = TRUE OR f.ativo = TRUE)
        GROUP BY f.id
        ORDER BY f.ativo DESC, f.nome ASC`,
      [search, includeInactive]
    );
    return res.json(result.rows);
  } catch (error) {
    return next(error);
  }
});

employeesRouter.post('/', async (req, res, next) => {
  try {
    const body = employeeSchema.parse(req.body);
    const result = await query(
      `INSERT INTO funcionarios (nome, cargo, telefone, observacoes, ativo)
       VALUES ($1, $2, $3, $4, COALESCE($5, TRUE))
       RETURNING id, nome, cargo, telefone, observacoes, ativo, created_at`,
      [body.nome, body.cargo ?? null, body.telefone ?? null, body.observacoes ?? null, body.ativo ?? true]
    );
    return res.status(201).json(result.rows[0]);
  } catch (error) {
    return next(error);
  }
});

employeesRouter.patch('/:id', async (req, res, next) => {
  try {
    const body = employeeSchema.partial().parse(req.body);
    const result = await query(
      `UPDATE funcionarios
          SET nome = COALESCE($2, nome),
              cargo = CASE WHEN $3::BOOLEAN THEN $4 ELSE cargo END,
              telefone = CASE WHEN $5::BOOLEAN THEN $6 ELSE telefone END,
              observacoes = CASE WHEN $7::BOOLEAN THEN $8 ELSE observacoes END,
              ativo = COALESCE($9, ativo)
        WHERE id = $1
        RETURNING id, nome, cargo, telefone, observacoes, ativo, created_at, updated_at`,
      [
        req.params.id,
        body.nome,
        Object.prototype.hasOwnProperty.call(body, 'cargo'),
        body.cargo ?? null,
        Object.prototype.hasOwnProperty.call(body, 'telefone'),
        body.telefone ?? null,
        Object.prototype.hasOwnProperty.call(body, 'observacoes'),
        body.observacoes ?? null,
        body.ativo
      ]
    );
    if (result.rowCount === 0) {
      return res.status(404).json({ message: 'Funcionário não encontrado.' });
    }
    return res.json(result.rows[0]);
  } catch (error) {
    return next(error);
  }
});

employeesRouter.get('/:id/summary', async (req, res, next) => {
  try {
    const employee = await query('SELECT id, nome, cargo, telefone, observacoes, ativo FROM funcionarios WHERE id = $1', [req.params.id]);
    if (employee.rowCount === 0) {
      return res.status(404).json({ message: 'Funcionário não encontrado.' });
    }

    const totals = await query(
      `SELECT COALESCE(SUM(valor_original), 0)::NUMERIC(12,2) AS total_emprestado,
              COALESCE(SUM(valor_pago), 0)::NUMERIC(12,2) AS total_pago,
              COALESCE(SUM(saldo_aberto), 0)::NUMERIC(12,2) AS saldo_aberto,
              COUNT(*) FILTER (WHERE status_calculado <> 'quitado' AND status_calculado <> 'cancelado')::INTEGER AS lancamentos_abertos,
              COUNT(*) FILTER (WHERE status_calculado = 'quitado')::INTEGER AS lancamentos_quitados
         FROM vw_adiantamentos_saldo
        WHERE funcionario_id = $1`,
      [req.params.id]
    );

    return res.json({ funcionario: employee.rows[0], resumo: totals.rows[0] });
  } catch (error) {
    return next(error);
  }
});