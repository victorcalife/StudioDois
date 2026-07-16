import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { config } from './config.js';
import { authRouter } from './routes/auth.js';
import { employeesRouter } from './routes/employees.js';
import { advancesRouter } from './routes/advances.js';
import { dashboardRouter } from './routes/dashboard.js';
import { errorHandler, notFound, requireAuth } from './middleware.js';

export const app = express();

app.use(helmet());
app.use(express.json({ limit: '200kb' }));
app.use(cors({
  origin(origin, callback) {
    if (!origin || config.allowedOrigins.includes(origin)) {
      callback(null, true);
      return;
    }
    callback(new Error('Origem não autorizada.'));
  },
  credentials: false
}));

app.get('/health', (_, res) => res.json({ ok: true }));
app.use('/auth', authRouter);
app.use('/dashboard', requireAuth, dashboardRouter);
app.use('/employees', requireAuth, employeesRouter);
app.use('/advances', requireAuth, advancesRouter);
app.use(notFound);
app.use(errorHandler);