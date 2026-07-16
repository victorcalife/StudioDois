import type { NextFunction, Response } from 'express';
import jwt from 'jsonwebtoken';
import { config } from './config.js';
import type { AuthenticatedRequest } from './types.js';

export function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  const token = header?.startsWith('Bearer ') ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({ message: 'Acesso não autenticado.' });
  }

  try {
    const payload = jwt.verify(token, config.jwtSecret);
    if (typeof payload !== 'object' || payload.role !== 'owner') {
      return res.status(401).json({ message: 'Sessão inválida.' });
    }
    req.session = { role: 'owner' };
    return next();
  } catch {
    return res.status(401).json({ message: 'Sessão expirada ou inválida.' });
  }
}

export function notFound(_: AuthenticatedRequest, res: Response) {
  return res.status(404).json({ message: 'Rota não encontrada.' });
}

export function errorHandler(error: unknown, _: AuthenticatedRequest, res: Response, __: NextFunction) {
  if (error instanceof Error && error.name === 'ZodError') {
    return res.status(400).json({ message: 'Dados inválidos.' });
  }
  return res.status(500).json({ message: 'Não foi possível concluir a operação.' });
}