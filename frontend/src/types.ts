export type Status = 'aberto' | 'parcial' | 'quitado' | 'cancelado';
export type Tipo = 'adiantamento' | 'emprestimo' | 'compra' | 'ferramentas' | 'outro';

export type Employee = {
  id: string;
  nome: string;
  cargo: string | null;
  telefone: string | null;
  observacoes: string | null;
  ativo: boolean;
  total_emprestado: string;
  total_pago: string;
  saldo_aberto: string;
  lancamentos_abertos: number;
};

export type Advance = {
  id: string;
  funcionario_id: string;
  funcionario_nome: string;
  funcionario_cargo: string | null;
  tipo: Tipo;
  descricao: string;
  valor_original: string;
  valor_pago: string;
  saldo_aberto: string;
  data_lancamento: string;
  data_vencimento: string | null;
  parcelas_total: number;
  intervalo_cobranca_dias?: number;
  status_calculado: Status;
  status: Status;
  quitado_em: string | null;
  proximo_vencimento?: string | null;
  parcelas_abertas?: number;
  observacoes: string | null;
};

export type ReceivableRange = 'vencida' | 'proximos_7_dias' | 'proximos_30_dias' | 'mes_atual' | 'futura' | 'paga' | 'cancelada';

export type Receivable = {
  id: string;
  adiantamento_id: string;
  numero: number;
  funcionario_id: string;
  funcionario_nome: string;
  funcionario_cargo: string | null;
  tipo: Tipo;
  descricao: string;
  valor_previsto: string;
  valor_pago: string;
  saldo_parcela: string;
  data_vencimento: string;
  status: 'aberta' | 'paga' | 'cancelada';
  faixa_recebimento: ReceivableRange;
  pago_em: string | null;
  observacoes: string | null;
};

export type Dashboard = {
  resumo: {
    total_funcionarios: number;
    total_emprestado: string;
    total_pago: string;
    saldo_aberto: string;
    lancamentos_abertos: number;
    lancamentos_quitados: number;
    parcelas_vencidas: number;
    valor_vencido: string;
    valor_proximos_7_dias: string;
    valor_proximos_30_dias: string;
  };
  porFuncionario: Array<{ funcionario_id: string; funcionario_nome: string; total_emprestado: string; saldo_aberto: string }>;
  porTipo: Array<{ tipo: Tipo; total_emprestado: string; saldo_aberto: string }>;
  recentes: Advance[];
  proximosRecebimentos: Receivable[];
};

export type Payment = {
  id: string;
  adiantamento_id: string;
  valor: string;
  pago_em: string;
  observacoes: string | null;
};