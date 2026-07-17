import type { Env } from '../types';

interface TurnstileResponse {
  success: boolean;
  'error-codes'?: string[];
  action?: string;
  hostname?: string;
}

export async function verifyTurnstile(
  env: Env,
  token: string | undefined,
  remoteIp: string | undefined,
  expectedAction?: string,
): Promise<{ configured: boolean; success: boolean; errors: string[] }> {
  if (!env.TURNSTILE_SECRET_KEY) return { configured: false, success: true, errors: [] };
  if (!token) return { configured: true, success: false, errors: ['MISSING_TURNSTILE_TOKEN'] };

  const body = new URLSearchParams({ secret: env.TURNSTILE_SECRET_KEY, response: token });
  if (remoteIp) body.set('remoteip', remoteIp);
  body.set('idempotency_key', crypto.randomUUID());

  const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!response.ok) return { configured: true, success: false, errors: [`TURNSTILE_HTTP_${response.status}`] };
  const result = await response.json<TurnstileResponse>();
  if (expectedAction && result.action && result.action !== expectedAction) {
    return { configured: true, success: false, errors: ['TURNSTILE_ACTION_MISMATCH'] };
  }
  return { configured: true, success: result.success, errors: result['error-codes'] ?? [] };
}
