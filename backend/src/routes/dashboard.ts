import { Router } from 'express';
import { query } from '../db.js';
import type { DashboardSummary } from '../types.js';

export const dashboardRouter = Router();

dashboardRouter.get('/', async (_, res, next) => {
  try {
    const summary = await query<DashboardSummary>(
      `SELECT (SELECT COUNT(*) FROM funcionarios WHERE ativo = TRUE)::INTEGER AS total_funcionarios,
            (SELECT COALESCE(SUM(valor_original), 0)::NUMERIC(12,2) FROM vw_adiantamentos_saldo) AS total_emprestado,
            (SELECT COALESCE(SUM(valor_pago), 0)::NUMERIC(12,2) FROM vw_adiantamentos_saldo) AS total_pago,
            (SELECT COALESCE(SUM(saldo_aberto), 0)::NUMERIC(12,2) FROM vw_adiantamentos_saldo) AS saldo_aberto,
            (SELECT COUNT(*) FILTER (WHERE status_calculado <> 'quitado' AND status_calculado <> 'cancelado')::INTEGER FROM vw_adiantamentos_saldo) AS lancamentos_abertos,
            (SELECT COUNT(*) FILTER (WHERE status_calculado = 'quitado')::INTEGER FROM vw_adiantamentos_saldo) AS lancamentos_quitados,
            (SELECT COUNT(*)::INTEGER FROM vw_parcelas_recebimento WHERE faixa_recebimento = 'vencida') AS parcelas_vencidas,
            (SELECT COALESCE(SUM(saldo_parcela), 0)::NUMERIC(12,2) FROM vw_parcelas_recebimento WHERE faixa_recebimento = 'vencida') AS valor_vencido,
            (SELECT COALESCE(SUM(saldo_parcela), 0)::NUMERIC(12,2) FROM vw_parcelas_recebimento WHERE faixa_recebimento = 'proximos_7_dias') AS valor_proximos_7_dias,
            (SELECT COALESCE(SUM(saldo_parcela), 0)::NUMERIC(12,2) FROM vw_parcelas_recebimento WHERE faixa_recebimento IN ('proximos_7_dias', 'proximos_30_dias')) AS valor_proximos_30_dias`
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

    const upcoming = await query(
      `SELECT id, adiantamento_id, numero, funcionario_nome, tipo, descricao, valor_previsto,
              valor_pago, saldo_parcela, data_vencimento, status, faixa_recebimento
         FROM vw_parcelas_recebimento
        WHERE faixa_recebimento <> 'paga' AND status <> 'cancelada'
        ORDER BY data_vencimento ASC, funcionario_nome ASC, numero ASC
        LIMIT 12`
    );

    return res.json({ resumo: summary.rows[0], porFuncionario: byEmployee.rows, porTipo: byType.rows, recentes: latest.rows, proximosRecebimentos: upcoming.rows });
  } catch (error) {
    return next(error);
  }
});