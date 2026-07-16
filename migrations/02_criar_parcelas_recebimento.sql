BEGIN;

CREATE TABLE IF NOT EXISTS parcelas_adiantamento (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    adiantamento_id UUID NOT NULL REFERENCES adiantamentos(id) ON DELETE CASCADE,
    numero INTEGER NOT NULL CHECK (numero >= 1),
    valor_previsto NUMERIC(12,2) NOT NULL CHECK (valor_previsto > 0),
    data_vencimento DATE NOT NULL,
    status TEXT NOT NULL DEFAULT 'aberta' CHECK (status IN ('aberta', 'paga', 'cancelada')),
    pago_em DATE,
    observacoes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE pagamentos_adiantamento
ADD COLUMN IF NOT EXISTS parcela_id UUID REFERENCES parcelas_adiantamento(id) ON DELETE SET NULL;

DROP TRIGGER IF EXISTS trg_parcelas_adiantamento_updated_at ON parcelas_adiantamento;
CREATE TRIGGER trg_parcelas_adiantamento_updated_at
BEFORE UPDATE ON parcelas_adiantamento
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE UNIQUE INDEX IF NOT EXISTS uq_parcelas_adiantamento_numero ON parcelas_adiantamento (adiantamento_id, numero);
CREATE INDEX IF NOT EXISTS idx_parcelas_adiantamento ON parcelas_adiantamento (adiantamento_id);
CREATE INDEX IF NOT EXISTS idx_parcelas_vencimento_status ON parcelas_adiantamento (data_vencimento, status);
CREATE INDEX IF NOT EXISTS idx_parcelas_status_vencimento ON parcelas_adiantamento (status, data_vencimento);
CREATE INDEX IF NOT EXISTS idx_pagamentos_parcela ON pagamentos_adiantamento (parcela_id);

INSERT INTO parcelas_adiantamento (adiantamento_id, numero, valor_previsto, data_vencimento, status, pago_em, observacoes)
SELECT
    a.id,
    1,
    a.valor_original,
    COALESCE(a.data_vencimento, a.data_lancamento),
    CASE
        WHEN a.status = 'quitado' THEN 'paga'
        WHEN a.status = 'cancelado' THEN 'cancelada'
        ELSE 'aberta'
    END,
    CASE WHEN a.status = 'quitado' THEN COALESCE(a.quitado_em::DATE, COALESCE(a.data_vencimento, a.data_lancamento)) ELSE NULL END,
    'Parcela criada automaticamente para lançamento existente.'
FROM adiantamentos a
WHERE NOT EXISTS (
    SELECT 1 FROM parcelas_adiantamento pa WHERE pa.adiantamento_id = a.id
);

DROP VIEW IF EXISTS vw_adiantamentos_saldo;
DROP VIEW IF EXISTS vw_parcelas_recebimento;

CREATE VIEW vw_parcelas_recebimento AS
SELECT
    pa.id,
    pa.adiantamento_id,
    pa.numero,
    a.funcionario_id,
    f.nome AS funcionario_nome,
    f.cargo AS funcionario_cargo,
    a.tipo,
    a.descricao,
    pa.valor_previsto,
    CASE
        WHEN COALESCE(SUM(p.valor), 0) > 0 THEN COALESCE(SUM(p.valor), 0)::NUMERIC(12,2)
        WHEN pa.status = 'paga' THEN pa.valor_previsto
        ELSE 0::NUMERIC(12,2)
    END AS valor_pago,
    GREATEST(
        pa.valor_previsto - CASE
            WHEN COALESCE(SUM(p.valor), 0) > 0 THEN COALESCE(SUM(p.valor), 0)
            WHEN pa.status = 'paga' THEN pa.valor_previsto
            ELSE 0
        END,
        0
    )::NUMERIC(12,2) AS saldo_parcela,
    pa.data_vencimento,
    pa.status,
    CASE
        WHEN pa.status = 'cancelada' THEN 'cancelada'
        WHEN pa.status = 'paga' OR COALESCE(SUM(p.valor), 0) >= pa.valor_previsto THEN 'paga'
        WHEN pa.data_vencimento < CURRENT_DATE THEN 'vencida'
        WHEN pa.data_vencimento <= CURRENT_DATE + INTERVAL '7 days' THEN 'proximos_7_dias'
        WHEN pa.data_vencimento <= CURRENT_DATE + INTERVAL '30 days' THEN 'proximos_30_dias'
        WHEN date_trunc('month', pa.data_vencimento) = date_trunc('month', CURRENT_DATE) THEN 'mes_atual'
        ELSE 'futura'
    END AS faixa_recebimento,
    pa.pago_em,
    pa.observacoes,
    pa.created_at,
    pa.updated_at
FROM parcelas_adiantamento pa
JOIN adiantamentos a ON a.id = pa.adiantamento_id
JOIN funcionarios f ON f.id = a.funcionario_id
LEFT JOIN pagamentos_adiantamento p ON p.parcela_id = pa.id
GROUP BY pa.id, a.id, f.id;

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