/**
 * The CSRF token lives in memory for the life of a page. Offline-queued
 * mutations survive reloads, so we also mirror the token to localStorage and
 * restore it on boot — otherwise replayed writes would be rejected when the
 * connection returns.
 */
const KEY = 'vp.mandi.csrf';

export function saveCsrf(token: string | null): void {
  try {
    if (token) localStorage.setItem(KEY, token);
    else localStorage.removeItem(KEY);
  } catch {
    /* storage unavailable (private mode) — ignore */
  }
}

export function loadCsrf(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}
