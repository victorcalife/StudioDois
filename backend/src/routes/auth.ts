import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { loginSchema } from '../validation.js';

export const authRouter = Router();

authRouter.post('/login', async (req, res, next) => {
  try {
    const body = loginSchema.parse(req.body);
    const valid = await bcrypt.compare(body.password, config.accessPasswordHash);

    if (!valid) {
      return res.status(401).json({ message: 'Senha inválida.' });
    }

    const token = jwt.sign({ role: 'owner' }, config.jwtSecret, { expiresIn: '8h' });
    return res.json({ token, expiresIn: 28800 });
  } catch (error) {
    return next(error);
  }
});