import { z } from 'zod';

const money = z.coerce.number().positive().max(999999999.99);
const dateValue = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable();
const nullableText = z.string().trim().max(500).optional().nullable();

export const loginSchema = z.object({
  password: z.string().min(1)
});

export const employeeSchema = z.object({
  nome: z.string().trim().min(2).max(120),
  cargo: nullableText,
  telefone: z.string().trim().max(40).optional().nullable(),
  observacoes: nullableText,
  ativo: z.boolean().optional()
});

export const advanceSchema = z.object({
  funcionarioId: z.string().uuid(),
  tipo: z.enum(['adiantamento', 'emprestimo', 'compra', 'ferramentas', 'outro']),
  descricao: z.string().trim().min(2).max(180),
  valorOriginal: money,
  dataLancamento: dateValue,
  dataVencimento: dateValue,
  parcelasTotal: z.coerce.number().int().min(1).max(120).optional(),
  parcelasRecebimento: z.array(z.object({
    numero: z.coerce.number().int().min(1).max(120),
    valorPrevisto: money,
    dataVencimento: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    observacoes: nullableText
  })).min(1).max(120).optional(),
  observacoes: nullableText
});

export const advanceUpdateSchema = advanceSchema.partial().extend({
  status: z.enum(['aberto', 'parcial', 'quitado', 'cancelado']).optional()
});

export const paymentSchema = z.object({
  valor: money,
  pagoEm: dateValue,
  observacoes: nullableText
});

export const installmentPaymentSchema = z.object({
  valor: money.optional(),
  pagoEm: dateValue,
  observacoes: nullableText
});