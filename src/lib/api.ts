const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api';
const USER_KEY = 'yuque_user';

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

export function applyStoredUserHeader(headers: Headers): Headers {
  try {
    const stored = window.localStorage.getItem(USER_KEY);
    if (stored) {
      const parsed = JSON.parse(stored) as { id?: string } | null;
      if (parsed?.id && !headers.has('X-User-Id')) {
        headers.set('X-User-Id', parsed.id);
      }
    }
  } catch {
    // Ignore malformed local state and let the request proceed unauthenticated.
  }

  return headers;
}

export async function apiRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = applyStoredUserHeader(new Headers(init.headers || {}));

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers,
  });
  const contentType = response.headers.get('content-type') || '';
  const isJson = contentType.includes('application/json');
  const payload = isJson ? await response.json() : await response.text();

  if (!response.ok) {
    const message = isJson && payload && typeof payload === 'object' && 'error' in payload
      ? String(payload.error)
      : `Request failed with status ${response.status}`;
    throw new ApiError(message, response.status);
  }

  return payload as T;
}

export function toJsonRequest(body: unknown, init: RequestInit = {}): RequestInit {
  const headers = new Headers(init.headers || {});
  headers.set('Content-Type', 'application/json');

  return {
    ...init,
    headers,
    body: JSON.stringify(body),
  };
}
