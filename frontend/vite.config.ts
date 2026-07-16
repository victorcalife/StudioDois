import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

function hostsFrom(value?: string) {
  return (value ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean)
    .map((origin) => {
    try {
      return new URL(origin).host;
    } catch {
      return origin;
    }
  });
}

const port = process.env.PORT ? Number(process.env.PORT) : undefined;
const allowedHosts = [
  ...hostsFrom(process.env.ALLOWED_ORIGINS),
  ...hostsFrom(process.env.RAILWAY_PUBLIC_DOMAIN)
];

const runtimeServer = {
  host: true,
  ...(port ? { port, strictPort: true } : {}),
  allowedHosts: allowedHosts.length > 0 ? allowedHosts : true
};

export default defineConfig({
  plugins: [react()],
  server: runtimeServer,
  preview: runtimeServer
});