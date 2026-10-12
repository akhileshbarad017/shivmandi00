import { loadCsrf, saveCsrf } from './offline/csrf';

export type ApiSuccess<T> = { success: true } & T;

export interface ApiError {
  success: false;
  error: string;
}

interface ApiOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  signal?: AbortSignal;
  /** Stable key so retries / offline replays never create duplicate rows. */
  idempotencyKey?: string;
}

/**
 * Empty by default so requests stay same-origin (works locally and behind the
 * Netlify /api proxy). Set VITE_API_BASE to call a backend on another origin.
 */
const API_BASE = (import.meta.env.VITE_API_BASE ?? '').replace(/\/+$/, '');

let csrfToken: string | null = loadCsrf();

export function setCsrf(token: string | null): void {
  csrfToken = token;
  saveCsrf(token);
}

export function getCsrf(): string | null {
  return csrfToken;
}

function newIdempotencyKey(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

/** JSON fetch wrapper: cookies included, CSRF + idempotency attached, errors normalised. */
export async function api<T>(path: string, options: ApiOptions = {}): Promise<ApiSuccess<T>> {
  const method = options.method ?? 'GET';
  const headers: Record<string, string> = {};

  if (options.body !== undefined) headers['Content-Type'] = 'application/json';
  if (method !== 'GET') {
    if (csrfToken) headers['X-CSRF-Token'] = csrfToken;
    headers['Idempotency-Key'] = options.idempotencyKey ?? newIdempotencyKey();
  }

  const res = await fetch(`${API_BASE}/api${path}`, {
    method,
    credentials: 'include',
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    signal: options.signal,
  });

  const data = (await res.json().catch(() => null)) as ApiSuccess<T> | ApiError | null;

  if (res.status === 401) {
    csrfToken = null;
    saveCsrf(null);
    window.dispatchEvent(new Event('sb:unauthorized'));
  }

  if (!res.ok || !data || data.success === false) {
    const message =
      data && data.success === false ? data.error : `Request failed (${res.status})`;
    const error = new Error(message) as Error & { status?: number };
    error.status = res.status;
    throw error;
  }

  return data;
}

export const apiGet = <T>(path: string, signal?: AbortSignal) => api<T>(path, { signal });
export const apiPost = <T>(path: string, body?: unknown, idempotencyKey?: string) =>
  api<T>(path, { method: 'POST', body, idempotencyKey });
export const apiPatch = <T>(path: string, body?: unknown, idempotencyKey?: string) =>
  api<T>(path, { method: 'PATCH', body, idempotencyKey });
export const apiDelete = <T>(path: string, body?: unknown, idempotencyKey?: string) =>
  api<T>(path, { method: 'DELETE', body, idempotencyKey });

/** True when a failure looks like a network/offline problem rather than a server response. */
export function isNetworkError(error: unknown): boolean {
  return error instanceof TypeError;
}
