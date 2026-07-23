import { storedLanguage, type PublicLanguage } from './language';

export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers);
  if (options.body && !(options.body instanceof FormData)) headers.set('Content-Type', 'application/json');
  if (!headers.has('X-Eden-Language')) headers.set('X-Eden-Language', storedLanguage());
  const response = await fetch(`/api${path}`, { ...options, headers, credentials: 'include' });
  const type = response.headers.get('content-type') ?? '';
  const payload = type.includes('application/json') ? await response.json() : await response.text();
  if (!response.ok) {
    const message = typeof payload === 'object' && payload && 'error' in payload ? String(payload.error) : String(payload);
    throw new Error(message || `Request failed (${response.status})`);
  }
  return payload as T;
}

function localeFor(language?: PublicLanguage) {
  const value = language ?? storedLanguage();
  return value === 'he' ? 'he-IL' : 'en-US';
}

export const money = (agorot: number, currency = 'ILS', language?: PublicLanguage) => new Intl.NumberFormat(localeFor(language), { style: 'currency', currency }).format((agorot || 0) / 100);
export const dateTime = (value: string, language?: PublicLanguage) => new Intl.DateTimeFormat(localeFor(language), { dateStyle: 'full', timeStyle: 'short', timeZone: 'Asia/Jerusalem' }).format(new Date(value));
export const shortDate = (value: string, language?: PublicLanguage) => new Intl.DateTimeFormat(localeFor(language), { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Jerusalem' }).format(new Date(value));
