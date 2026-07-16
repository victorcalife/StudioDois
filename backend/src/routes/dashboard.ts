import { Router } from 'express';
import { query } from '../db.js';
import type { DashboardSummary } from '../types.js';

export const dashboardRouter = Router();

dashboardRouter.get('/', async (_, res, next) => {
  try {
    const summary = await query<DashboardSummary>(
      `SELECT (SELECT COUNT(*) FROM funcionarios WHERE ativo = TRUE)::INTEGER AS total_funcionarios,
              COALESCE(SUM(valor_original), 0)::NUMERIC(12,2) AS total_emprestado,
              COALESCE(SUM(valor_pago), 0)::NUMERIC(12,2) AS total_pago,
              COALESCE(SUM(saldo_aberto), 0)::NUMERIC(12,2) AS saldo_aberto,
              COUNT(*) FILTER (WHERE status_calculado <> 'quitado' AND status_calculado <> 'cancelado')::INTEGER AS lancamentos_abertos,
              COUNT(*) FILTER (WHERE status_calculado = 'quitado')::INTEGER AS lancamentos_quitados
         FROM vw_adiantamentos_saldo`
    );

    const byEmployee = await query(
      `SELECT funcionario_id, funcionario_nome, COALESCE(SUM(valor_original), 0)::NUMERIC(12,2) AS total_emprestado,
              COALESCE(SUM(saldo_aberto), 0)::NUMERIC(12,2) AS saldo_aberto
         FROM vw_adiantamentos_saldo
        WHERE status_calculado <> 'cancelado'
        GROUP BY funcionario_id, funcionario_nome
        ORDER BY saldo_aberto DESC, total_emprestado DESC
        LIMIT 8`
    );

    const byType = await query(
      `SELECT tipo, COALESCE(SUM(valor_original), 0)::NUMERIC(12,2) AS total_emprestado,
              COALESCE(SUM(saldo_aberto), 0)::NUMERIC(12,2) AS saldo_aberto
         FROM vw_adiantamentos_saldo
        WHERE status_calculado <> 'cancelado'
        GROUP BY tipo
        ORDER BY total_emprestado DESC`
    );

    const latest = await query(
      `SELECT id, funcionario_nome, tipo, descricao, valor_original, valor_pago, saldo_aberto,
              data_lancamento, data_vencimento, status_calculado
         FROM vw_adiantamentos_saldo
        ORDER BY created_at DESC
        LIMIT 10`
    );

    return res.json({ resumo: summary.rows[0], porFuncionario: byEmployee.rows, porTipo: byType.rows, recentes: latest.rows });
  } catch (error) {
    return next(error);
  }
});