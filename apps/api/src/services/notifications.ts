import type { Env } from '../types';
import { hmac } from '../lib/crypto';

export type DeliveryOutcome = 'SENT' | 'SKIPPED' | 'CONFIGURATION_ERROR';
export interface DeliveryResult {
  outcome: DeliveryOutcome;
  providerResponse: Record<string, unknown>;
  error?: string;
}

export async function sendEmail(env: Env, input: { to: string; subject: string; html: string; text?: string }): Promise<DeliveryResult> {
  if (!input.to?.trim()) return { outcome: 'SKIPPED', providerResponse: { reason: 'NO_RECIPIENT' } };
  if (!env.RESEND_API_KEY || !env.EMAIL_FROM) {
    return { outcome: 'CONFIGURATION_ERROR', providerResponse: { provider: 'resend' }, error: 'EMAIL_PROVIDER_NOT_CONFIGURED' };
  }
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: env.EMAIL_FROM, to: [input.to], subject: input.subject, html: input.html, text: input.text }),
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`Email provider failed: ${response.status} ${text}`);
  let payload: Record<string, unknown> = {};
  try { payload = JSON.parse(text) as Record<string, unknown>; } catch { payload = { response: text }; }
  return { outcome: 'SENT', providerResponse: payload };
}

export async function callSignedWebhook(url: string | undefined, secret: string | undefined, payload: unknown): Promise<DeliveryResult> {
  if (!url || !secret) return { outcome: 'CONFIGURATION_ERROR', providerResponse: {}, error: !url ? 'WEBHOOK_PROVIDER_NOT_CONFIGURED' : 'WEBHOOK_SECRET_NOT_CONFIGURED' };
  const body = JSON.stringify(payload);
  const signature = await hmac(secret, body);
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Eden-Signature': signature },
    body,
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`Webhook failed: ${response.status} ${text}`);
  return { outcome: 'SENT', providerResponse: { status: response.status, response: text.slice(0, 1000) } };
}
