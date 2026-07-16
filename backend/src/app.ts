import express from 'express';
import cors, { type CorsOptions } from 'cors';
import helmet from 'helmet';
import { config } from './config.js';
import { authRouter } from './routes/auth.js';
import { employeesRouter } from './routes/employees.js';
import { advancesRouter } from './routes/advances.js';
import { dashboardRouter } from './routes/dashboard.js';
import { errorHandler, notFound, requireAuth } from './middleware.js';

export const app = express();

function isAllowedOrigin(origin: string) {
  try {
    const url = new URL(origin);
    return config.allowedOrigins.includes(url.origin) || config.allowedHosts.includes(url.host);
  } catch {
    const normalized = origin.trim().replace(/\/+$/, '');
    return config.allowedOrigins.includes(normalized) || config.allowedHosts.includes(normalized);
  }
}

const corsOptions: CorsOptions = {
  origin(origin, callback) {
    if (!origin || isAllowedOrigin(origin)) {
      callback(null, true);
      return;
    }
    callback(new Error('Origem não autorizada.'));
  },
  credentials: false,
  methods: ['GET', 'POST', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  optionsSuccessStatus: 204
};

app.use(helmet());
app.use(cors(corsOptions));
app.options('*', cors(corsOptions));
app.use(express.json({ limit: '200kb' }));

app.get('/health', (_, res) => res.json({ ok: true }));
app.use('/auth', authRouter);
app.use('/dashboard', requireAuth, dashboardRouter);
app.use('/employees', requireAuth, employeesRouter);
app.use('/advances', requireAuth, advancesRouter);
app.use(notFound);
app.use(errorHandler);