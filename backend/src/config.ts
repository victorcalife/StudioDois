const required = ['DATABASE_URL', 'JWT_SECRET', 'ALLOWED_ORIGINS', 'ACCESS_PASSWORD_HASH', 'NODE_ENV', 'PORT'] as const;

const values = new Map<string, string>();

for (const key of required) {
  const value = process.env[key];
  if (!value || value.trim().length === 0) {
    throw new Error(`Variável obrigatória ausente: ${key}`);
  }
  values.set(key, value.trim());
}

const nodeEnv = values.get('NODE_ENV') as string;
const port = Number(values.get('PORT'));

function parseAllowedOrigin(value: string) {
  const normalized = value.trim().replace(/\/+$/, '');

  try {
    const url = new URL(normalized);
    return { origin: url.origin, host: url.host };
  } catch {
    try {
      const url = new URL(`https://${normalized}`);
      return { origin: url.origin, host: url.host };
    } catch {
      return { origin: normalized, host: normalized };
    }
  }
}

if (nodeEnv !== 'production') {
  throw new Error('NODE_ENV deve ser production no ambiente Railway.');
}

if (port !== 8080) {
  throw new Error('PORT deve ser 8080 no serviço backend da Railway.');
}

const allowedOriginEntries = (values.get('ALLOWED_ORIGINS') as string)
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean)
  .map(parseAllowedOrigin);

export const config = {
  databaseUrl: values.get('DATABASE_URL') as string,
  jwtSecret: values.get('JWT_SECRET') as string,
  accessPasswordHash: values.get('ACCESS_PASSWORD_HASH') as string,
  allowedOrigins: allowedOriginEntries.map((entry) => entry.origin),
  allowedHosts: allowedOriginEntries.map((entry) => entry.host),
  port
};