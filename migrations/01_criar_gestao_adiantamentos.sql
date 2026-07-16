BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE IF NOT EXISTS funcionarios (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nome TEXT NOT NULL CHECK (length(trim(nome)) >= 2),
    cargo TEXT,
    telefone TEXT,
    observacoes TEXT,
    ativo BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS adiantamentos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    funcionario_id UUID NOT NULL REFERENCES funcionarios(id) ON DELETE RESTRICT,
    tipo TEXT NOT NULL CHECK (tipo IN ('adiantamento', 'emprestimo', 'compra', 'ferramentas', 'outro')),
    descricao TEXT NOT NULL CHECK (length(trim(descricao)) >= 2),
    valor_original NUMERIC(12,2) NOT NULL CHECK (valor_original > 0),
    data_lancamento DATE NOT NULL DEFAULT CURRENT_DATE,
    data_vencimento DATE,
    parcelas_total INTEGER NOT NULL DEFAULT 1 CHECK (parcelas_total >= 1),
    status TEXT NOT NULL DEFAULT 'aberto' CHECK (status IN ('aberto', 'parcial', 'quitado', 'cancelado')),
    quitado_em TIMESTAMPTZ,
    observacoes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS pagamentos_adiantamento (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    adiantamento_id UUID NOT NULL REFERENCES adiantamentos(id) ON DELETE CASCADE,
    valor NUMERIC(12,2) NOT NULL CHECK (valor > 0),
    pago_em DATE NOT NULL DEFAULT CURRENT_DATE,
    observacoes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_funcionarios_updated_at ON funcionarios;
CREATE TRIGGER trg_funcionarios_updated_at
BEFORE UPDATE ON funcionarios
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_adiantamentos_updated_at ON adiantamentos;
CREATE TRIGGER trg_adiantamentos_updated_at
BEFORE UPDATE ON adiantamentos
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE OR REPLACE VIEW vw_adiantamentos_saldo AS
SELECT
    a.id,
    a.funcionario_id,
    f.nome AS funcionario_nome,
    f.cargo AS funcionario_cargo,
    a.tipo,
    a.descricao,
    a.valor_original,
    COALESCE(SUM(p.valor), 0)::NUMERIC(12,2) AS valor_pago,
    GREATEST(a.valor_original - COALESCE(SUM(p.valor), 0), 0)::NUMERIC(12,2) AS saldo_aberto,
    a.data_lancamento,
    a.data_vencimento,
    a.parcelas_total,
    CASE
        WHEN a.status = 'cancelado' THEN 'cancelado'
        WHEN COALESCE(SUM(p.valor), 0) >= a.valor_original THEN 'quitado'
        WHEN COALESCE(SUM(p.valor), 0) > 0 THEN 'parcial'
        ELSE a.status
    END AS status_calculado,
    a.status,
    a.quitado_em,
    a.observacoes,
    a.created_at,
    a.updated_at
FROM adiantamentos a
JOIN funcionarios f ON f.id = a.funcionario_id
LEFT JOIN pagamentos_adiantamento p ON p.adiantamento_id = a.id
GROUP BY a.id, f.id;

CREATE INDEX IF NOT EXISTS idx_funcionarios_nome_trgm ON funcionarios USING GIN (nome gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_funcionarios_ativo_nome ON funcionarios (ativo, nome);
CREATE INDEX IF NOT EXISTS idx_adiantamentos_funcionario ON adiantamentos (funcionario_id);
CREATE INDEX IF NOT EXISTS idx_adiantamentos_status ON adiantamentos (status);
CREATE INDEX IF NOT EXISTS idx_adiantamentos_tipo ON adiantamentos (tipo);
CREATE INDEX IF NOT EXISTS idx_adiantamentos_vencimento ON adiantamentos (data_vencimento);
CREATE INDEX IF NOT EXISTS idx_adiantamentos_lancamento ON adiantamentos (data_lancamento DESC);
CREATE INDEX IF NOT EXISTS idx_pagamentos_adiantamento ON pagamentos_adiantamento (adiantamento_id, pago_em DESC);

COMMIT;