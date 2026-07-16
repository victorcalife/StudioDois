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
};