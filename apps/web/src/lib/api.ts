export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers);
  if (options.body && !(options.body instanceof FormData)) headers.set('Content-Type', 'application/json');
  const response = await fetch(`/api${path}`, { ...options, headers, credentials: 'include' });
  const type = response.headers.get('content-type') ?? '';
  const payload = type.includes('application/json') ? await response.json() : await response.text();
  if (!response.ok) {
    const message = typeof payload === 'object' && payload && 'error' in payload ? String(payload.error) : String(payload);
    throw new Error(message || `Request failed (${response.status})`);
  }
  return payload as T;
}

export const money = (agorot: number, currency = 'ILS') => new Intl.NumberFormat('he-IL', { style: 'currency', currency }).format((agorot || 0) / 100);
export const dateTime = (value: string) => new Intl.DateTimeFormat('he-IL', { dateStyle: 'full', timeStyle: 'short', timeZone: 'Asia/Jerusalem' }).format(new Date(value));
export const shortDate = (value: string) => new Intl.DateTimeFormat('he-IL', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Jerusalem' }).format(new Date(value));
