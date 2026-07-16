import type { Env } from '../types';
import { hmac } from '../lib/crypto';

export async function sendEmail(env: Env, input: { to: string; subject: string; html: string; text?: string }) {
  if (!env.RESEND_API_KEY || !env.EMAIL_FROM) return { skipped: true };
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: env.EMAIL_FROM, to: [input.to], subject: input.subject, html: input.html, text: input.text }),
  });
  if (!response.ok) throw new Error(`Email provider failed: ${response.status} ${await response.text()}`);
  return response.json();
}

export async function callSignedWebhook(url: string | undefined, secret: string | undefined, payload: unknown) {
  if (!url) return { skipped: true };
  const body = JSON.stringify(payload);
  const signature = secret ? await hmac(secret, body) : '';
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Eden-Signature': signature },
    body,
  });
  if (!response.ok) throw new Error(`Webhook failed: ${response.status} ${await response.text()}`);
  return { ok: true };
}
