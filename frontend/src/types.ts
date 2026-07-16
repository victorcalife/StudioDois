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
  status_calculado: Status;
  status: Status;
  quitado_em: string | null;
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
  };
  porFuncionario: Array<{ funcionario_id: string; funcionario_nome: string; total_emprestado: string; saldo_aberto: string }>;
  porTipo: Array<{ tipo: Tipo; total_emprestado: string; saldo_aberto: string }>;
  recentes: Advance[];
};

export type Payment = {
  id: string;
  adiantamento_id: string;
  valor: string;
  pago_em: string;
  observacoes: string | null;
};