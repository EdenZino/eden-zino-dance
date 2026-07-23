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

export type EmailLanguage = 'he' | 'en';

function escapeEmailHtml(value: unknown) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

export function brandedEmail(input: {
  language: EmailLanguage;
  eyebrow: string;
  title: string;
  intro?: string;
  body?: string;
  buttonLabel?: string;
  buttonUrl?: string;
  appUrl: string;
}): { html: string; text: string } {
  const isHe = input.language === 'he';
  const dir = isHe ? 'rtl' : 'ltr';
  const align = isHe ? 'right' : 'left';
  const footerLine = isHe ? 'נתראה על הרחבה ✨' : 'See you on the dance floor ✨';
  const systemLine = isHe ? 'הודעה זו נשלחה בעקבות פעולה שבוצעה באתר Eden Zino.' : 'This message was sent following an action on the Eden Zino website.';
  const siteLabel = isHe ? 'מעבר לאתר' : 'Visit Eden Zino';
  const button = input.buttonLabel && input.buttonUrl
    ? `<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:26px auto 8px"><tr><td style="border-radius:999px;background:#1C1417"><a href="${escapeEmailHtml(input.buttonUrl)}" style="display:inline-block;padding:14px 28px;color:#fff;text-decoration:none;font-family:Arial,sans-serif;font-size:15px;font-weight:700;border-radius:999px">${escapeEmailHtml(input.buttonLabel)}</a></td></tr></table>`
    : '';
  const html = `<!doctype html><html dir="${dir}" lang="${input.language}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;padding:0;background:#F7EEE9;color:#1C1417;font-family:Arial,'Helvetica Neue',sans-serif"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#F7EEE9;padding:24px 12px"><tr><td align="center"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:620px;background:#fff;border-radius:24px;overflow:hidden;box-shadow:0 20px 55px rgba(28,20,23,.12)"><tr><td style="background:#150F13;padding:28px 34px;text-align:${align}"><div style="display:inline-block;border:1px dashed #F2A93B;border-radius:999px;padding:9px 12px;color:#F2A93B;font-size:12px;font-weight:700;letter-spacing:1px">EZ</div><div style="margin-top:16px;color:#fff;font-size:20px;font-weight:800;letter-spacing:.7px">EDEN ZINO</div><div style="margin-top:5px;color:#D8C7CC;font-size:12px">DANCE WORKSHOPS · MOVE · FEEL · GROW</div></td></tr><tr><td style="padding:34px;text-align:${align}"><div style="color:#E23E57;font-size:11px;font-weight:800;letter-spacing:2px;text-transform:uppercase">${escapeEmailHtml(input.eyebrow)}</div><h1 style="margin:10px 0 14px;font-size:30px;line-height:1.18;color:#1C1417">${escapeEmailHtml(input.title)}</h1>${input.intro ? `<p style="margin:0 0 20px;color:#6F5A61;font-size:16px;line-height:1.75">${escapeEmailHtml(input.intro)}</p>` : ''}${input.body ?? ''}${button}<p style="margin:30px 0 0;color:#8A737A;font-size:12px;line-height:1.7;text-align:center">${footerLine}<br><b style="color:#1C1417">Eden Zino</b></p></td></tr><tr><td style="padding:18px 28px;background:#FBF5F2;text-align:center;color:#8A737A;font-size:11px;line-height:1.6">${systemLine}<br><a href="${escapeEmailHtml(input.appUrl)}" style="color:#E23E57;text-decoration:none;font-weight:700">${siteLabel}</a></td></tr></table></td></tr></table></body></html>`;
  const text = [input.title, input.intro, input.buttonUrl].filter(Boolean).join('\n\n');
  return { html, text };
}
