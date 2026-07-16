BEGIN;

ALTER TABLE adiantamentos
ADD COLUMN IF NOT EXISTS intervalo_cobranca_dias INTEGER NOT NULL DEFAULT 30 CHECK (intervalo_cobranca_dias >= 1 AND intervalo_cobranca_dias <= 3650);

DROP VIEW IF EXISTS vw_adiantamentos_saldo;

CREATE VIEW vw_adiantamentos_saldo AS
WITH pagamentos_totais AS (
    SELECT
        adiantamento_id,
        COALESCE(SUM(valor), 0)::NUMERIC(12,2) AS valor_pago
    FROM pagamentos_adiantamento
    GROUP BY adiantamento_id
),
parcelas_totais AS (
    SELECT
        adiantamento_id,
        MIN(data_vencimento) FILTER (WHERE status = 'aberta') AS proximo_vencimento,
        COUNT(id) FILTER (WHERE status = 'aberta')::INTEGER AS parcelas_abertas,
        bool_and(status = 'paga') AS todas_parcelas_pagas
    FROM parcelas_adiantamento
    GROUP BY adiantamento_id
)
SELECT
    a.id,
    a.funcionario_id,
    f.nome AS funcionario_nome,
    f.cargo AS funcionario_cargo,
    a.tipo,
    a.descricao,
    a.valor_original,
    COALESCE(pt.valor_pago, 0)::NUMERIC(12,2) AS valor_pago,
    GREATEST(a.valor_original - COALESCE(pt.valor_pago, 0), 0)::NUMERIC(12,2) AS saldo_aberto,
    a.data_lancamento,
    a.data_vencimento,
    a.parcelas_total,
    a.intervalo_cobranca_dias,
    CASE
        WHEN a.status = 'cancelado' THEN 'cancelado'
        WHEN COALESCE(pt.valor_pago, 0) >= a.valor_original OR COALESCE(pat.todas_parcelas_pagas, FALSE) THEN 'quitado'
        WHEN COALESCE(pt.valor_pago, 0) > 0 THEN 'parcial'
        ELSE a.status
    END AS status_calculado,
    a.status,
    a.quitado_em,
    pat.proximo_vencimento,
    COALESCE(pat.parcelas_abertas, 0)::INTEGER AS parcelas_abertas,
    a.observacoes,
    a.created_at,
    a.updated_at
FROM adiantamentos a
JOIN funcionarios f ON f.id = a.funcionario_id
LEFT JOIN pagamentos_totais pt ON pt.adiantamento_id = a.id
LEFT JOIN parcelas_totais pat ON pat.adiantamento_id = a.id;

COMMIT;