const apiUrl = import.meta.env.VITE_API_URL as string | undefined;

if (!apiUrl) {
  throw new Error('VITE_API_URL precisa estar configurada no serviço frontend da Railway.');
}

export function getToken() {
  return window.localStorage.getItem('studio2_token');
}

export function setToken(token: string) {
  window.localStorage.setItem('studio2_token', token);
}

export function clearToken() {
  window.localStorage.removeItem('studio2_token');
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set('Content-Type', 'application/json');
  const token = getToken();
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const response = await fetch(`${apiUrl}${path}`, { ...init, headers });
  const data = await response.json().catch(() => null);

  if (!response.ok) {
    if (response.status === 401) {
      clearToken();
    }
    throw new Error(data?.message ?? 'Falha ao comunicar com o servidor.');
  }

  return data as T;
}

export async function login(password: string) {
  return api<{ token: string; expiresIn: number }>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ password })
  });
}