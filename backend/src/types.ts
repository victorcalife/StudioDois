import type { Request } from 'express';

export type AuthenticatedRequest = Request & {
  session?: {
    role: 'owner';
  };
};

export type DashboardSummary = {
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