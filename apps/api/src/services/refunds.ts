import { db } from '../lib/db';
import { randomToken } from '../lib/crypto';
import type { Env } from '../types';

type RefundOutcome =
  | { outcome: 'SUCCEEDED'; providerRefundId: string; raw: Record<string, unknown> }
  | { outcome: 'MANUAL_ACTION_REQUIRED'; reason: string; raw?: Record<string, unknown> }
  | { outcome: 'FAILED'; reason: string; raw?: Record<string, unknown> };


function activeRefundEnvironment(env: Env, provider: string) {
  if (provider === 'mock') return 'mock';
  if (provider === 'payme') return String(env.PAYME_API_BASE ?? '').toLowerCase().includes('sandbox') ? 'sandbox' : 'production';
  return 'production';
}

function required(value: string | undefined, name: string): string {
  if (!value?.trim()) throw new Error(`${name} is not configured`);
  return value.trim();
}

async function requestProviderRefund(env: Env, payment: any, amountAgorot: number, reason: string, idempotencyKey: string): Promise<RefundOutcome> {
  if (payment.provider === 'mock') {
    return { outcome: 'SUCCEEDED', providerRefundId: `mock-refund-${crypto.randomUUID()}`, raw: { development: true, amountAgorot } };
  }
  if (payment.provider !== 'payme') {
    return { outcome: 'MANUAL_ACTION_REQUIRED', reason: `AUTOMATIC_REFUND_NOT_IMPLEMENTED_FOR_${String(payment.provider).toUpperCase()}` };
  }

  try {
    const clientKey = required(env.PAYME_CLIENT_KEY, 'PAYME_CLIENT_KEY');
    const sellerId = required(env.PAYME_SELLER_ID, 'PAYME_SELLER_ID');
    const saleId = String(payment.provider_session_id || payment.provider_transaction_id || '');
    if (!saleId) return { outcome: 'MANUAL_ACTION_REQUIRED', reason: 'PAYME_SALE_ID_MISSING' };
    const base = (env.PAYME_API_BASE || 'https://sandbox.payme.io/api').replace(/\/$/, '');
    const path = (env.PAYME_REFUND_PATH || 'refund-sale').replace(/^\//, '');
    const payload = {
      payme_client_key: clientKey,
      seller_payme_id: sellerId,
      payme_sale_id: saleId,
      sale_refund_amount: amountAgorot,
      refund_reason: reason.slice(0, 250),
      transaction_id: idempotencyKey,
    };
    const response = await fetch(`${base}/${path}`, {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'Idempotency-Key': idempotencyKey },
      body: JSON.stringify(payload),
    });
    const text = await response.text();
    let data: Record<string, unknown> = {};
    try { data = JSON.parse(text) as Record<string, unknown>; } catch { data = { response: text }; }
    const statusCode = Number(data.status_code ?? data.statusCode ?? -1);
    if (!response.ok || statusCode !== 0) {
      return { outcome: 'FAILED', reason: String(data.status_error_details ?? data.status_error_code ?? `PAYME_REFUND_HTTP_${response.status}`), raw: data };
    }
    const providerRefundId = String(data.payme_refund_id ?? data.refund_id ?? data.payme_sale_id ?? idempotencyKey);
    return { outcome: 'SUCCEEDED', providerRefundId, raw: data };
  } catch (error) {
    return { outcome: 'FAILED', reason: error instanceof Error ? error.message : 'PAYME_REFUND_FAILED' };
  }
}

async function inviteNext(env: Env, workshopId: string) {
  const rows = await db(env)`select * from invite_next_waitlist(${workshopId}::uuid,${randomToken(32)},24)`;
  return rows[0] ?? null;
}

async function processAllocatedRefund(env: Env, refund: any) {
  const sql = db(env);
  const environment = activeRefundEnvironment(env, String(refund.provider));
  await sql`update refunds set provider_environment=${environment},updated_at=now() where id=${refund.refund_id ?? refund.id}::uuid`;
  const provider = await requestProviderRefund(env, refund, Number(refund.amount_agorot), String(refund.reason), String(refund.idempotency_key));
  if (provider.outcome === 'SUCCEEDED') {
    const completed = await sql`select * from complete_refund_atomic(${refund.refund_id ?? refund.id}::uuid,${provider.providerRefundId},${JSON.stringify(provider.raw)}::jsonb)`;
    return { refundId: refund.refund_id ?? refund.id, outcome: provider.outcome, state: completed[0] };
  }
  if (provider.outcome === 'MANUAL_ACTION_REQUIRED') {
    await sql`update refunds set status='MANUAL_ACTION_REQUIRED',last_error=${provider.reason},raw_response=${JSON.stringify(provider.raw ?? {})}::jsonb,updated_at=now() where id=${refund.refund_id ?? refund.id}::uuid`;
    return { refundId: refund.refund_id ?? refund.id, outcome: provider.outcome, reason: provider.reason };
  }
  await sql`update refunds set status='FAILED',last_error=${provider.reason},raw_response=${JSON.stringify(provider.raw ?? {})}::jsonb,updated_at=now() where id=${refund.refund_id ?? refund.id}::uuid`;
  return { refundId: refund.refund_id ?? refund.id, outcome: provider.outcome, reason: provider.reason };
}

export async function cancelRegistration(env: Env, registrationId: string, reason: string, adminId?: string) {
  const sql = db(env);
  const cancelled = await sql`select * from cancel_registration_atomic(${registrationId}::uuid,${reason},${adminId ?? null}::uuid)`;
  if (!cancelled.length) throw new Error('REGISTRATION_NOT_FOUND');
  const state = cancelled[0] as any;
  const refundResults: any[] = [];

  if (Number(state.refundable_agorot) > 0) {
    const result = await refundRegistration(env, registrationId, Number(state.refundable_agorot), reason, adminId, true);
    refundResults.push(...result.refunds);
  }
  const finalRows = await sql`select status from registrations where id=${registrationId}::uuid`;
  const finalStatus = String((finalRows[0] as any)?.status ?? state.registration_status);
  const invitation = await inviteNext(env, String(state.workshop_id));
  return { cancellation: { ...state, finalStatus }, refunds: refundResults, waitlistInvitation: invitation };
}

export async function refundRegistration(
  env: Env,
  registrationId: string,
  amountAgorot: number,
  reason: string,
  adminId?: string,
  cancelRegistrationFlag = false,
) {
  const sql = db(env);
  const allocated = await sql`select * from allocate_registration_refund(
    ${registrationId}::uuid,${amountAgorot},${reason},${adminId ?? null}::uuid,${cancelRegistrationFlag}
  )`;
  if (!allocated.length) throw new Error('REFUND_PAYMENT_ALLOCATION_FAILED');
  const results: any[] = [];
  for (const refund of allocated as any[]) results.push(await processAllocatedRefund(env, { ...refund, reason }));
  return { refunds: results };
}

export async function retryRefund(env: Env, refundId: string) {
  const sql = db(env);
  const rows = await sql`select f.id,f.amount_agorot,f.reason,f.idempotency_key,f.status,
      p.provider,p.provider_session_id,p.provider_transaction_id
    from refunds f join payments p on p.id=f.payment_id
    where f.id=${refundId}::uuid for update of f`;
  const refund = rows[0] as any;
  if (!refund) throw new Error('REFUND_NOT_FOUND');
  if (refund.status === 'SUCCEEDED') return { refundId, outcome: 'SUCCEEDED', alreadyCompleted: true };
  if (refund.status === 'CANCELLED') throw new Error('REFUND_ALLOCATION_CANCELLED');
  await sql`update refunds set status='PROCESSING',last_error=null,updated_at=now() where id=${refundId}::uuid`;
  return processAllocatedRefund(env, { ...refund, refund_id: refund.id });
}

export async function cancelRefundAllocation(env: Env, refundId: string, reason: string, adminId: string) {
  const sql = db(env);
  const rows = await sql`update refunds set status='CANCELLED',last_error=${reason},updated_at=now()
    where id=${refundId}::uuid and status in ('FAILED','MANUAL_ACTION_REQUIRED','REQUESTED') returning registration_id,id`;
  if (!rows.length) throw new Error('REFUND_NOT_CANCELLABLE');
  await sql`insert into audit_logs(admin_id,action,entity_type,entity_id,new_value)
    values(${adminId}::uuid,'CANCEL_REFUND_ALLOCATION','REFUND',${refundId},${JSON.stringify({ reason })}::jsonb)`;
  return rows[0];
}

export async function completeManualRefund(env: Env, refundId: string, providerRefundId?: string) {
  const rows = await db(env)`select * from complete_refund_atomic(${refundId}::uuid,${providerRefundId ?? null},${JSON.stringify({ manual: true })}::jsonb)`;
  if (!rows.length) throw new Error('REFUND_NOT_FOUND');
  const state = rows[0] as any;
  if (state.registration_status === 'CANCELLED' || state.registration_status === 'REFUNDED') {
    await inviteNext(env, String(state.workshop_id));
  }
  return state;
}
