import type { Env } from '../types';

export interface PaymentRequest {
  paymentId: string;
  referenceCode: string;
  referenceType: 'registration' | 'order';
  amountAgorot: number;
  fullName: string;
  email: string;
  phone: string;
  productName: string;
  accessToken?: string;
}

export interface PaymentSession {
  provider: 'mock' | 'tranzila' | 'payme';
  method: 'redirect';
  url: string;
  providerSessionId?: string;
}

function required(value: string | undefined, name: string): string {
  if (!value?.trim()) throw new Error(`${name} is not configured`);
  return value.trim();
}

export async function buildPaymentSession(env: Env, request: PaymentRequest): Promise<PaymentSession> {
  const appUrl = env.PUBLIC_APP_URL.replace(/\/$/, '');
  const accessPart = request.accessToken ? `&access=${encodeURIComponent(request.accessToken)}` : '';
  const resultPath = request.referenceType === 'registration'
    ? `/payment/result?registration=${encodeURIComponent(request.referenceCode)}${accessPart}`
    : `/products/result?order=${encodeURIComponent(request.referenceCode)}${accessPart}`;

  if (env.PAYMENT_PROVIDER === 'mock') {
    return {
      provider: 'mock',
      method: 'redirect',
      url: `${appUrl}/payment/mock?payment=${encodeURIComponent(request.paymentId)}&type=${request.referenceType}&reference=${encodeURIComponent(request.referenceCode)}${request.accessToken ? `&access=${encodeURIComponent(request.accessToken)}` : ''}`,
    };
  }

  if (env.PAYMENT_PROVIDER === 'payme') {
    const sellerPaymeId = required(env.PAYME_SELLER_ID, 'PAYME_SELLER_ID');
    const clientKey = required(env.PAYME_CLIENT_KEY, 'PAYME_CLIENT_KEY');
    const base = (env.PAYME_API_BASE || 'https://sandbox.payme.io/api').replace(/\/$/, '');
    const callbackSecret = required(env.PAYME_CALLBACK_SECRET, 'PAYME_CALLBACK_SECRET');

    const payload: Record<string, unknown> = {
      payme_client_key: clientKey,
      seller_payme_id: sellerPaymeId,
      sale_price: request.amountAgorot,
      currency: 'ILS',
      product_name: request.productName.slice(0, 250),
      transaction_id: request.paymentId,
      sale_callback_url: `${appUrl}/api/public/payments/payme/callback?token=${encodeURIComponent(callbackSecret)}`,
      sale_return_url: `${appUrl}${resultPath}&result=processing`,
      buyer_name: request.fullName,
      buyer_email: request.email,
      buyer_phone: request.phone,
      language: env.PAYME_LANGUAGE || 'he',
    };

    if (env.PAYME_PAYMENT_METHOD?.trim()) {
      payload.sale_payment_method = env.PAYME_PAYMENT_METHOD.trim();
    }

    const response = await fetch(`${base}/generate-sale`, {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const text = await response.text();
    let data: Record<string, unknown>;
    try {
      data = JSON.parse(text) as Record<string, unknown>;
    } catch {
      throw new Error(`PAYME_INVALID_RESPONSE:${response.status}`);
    }

    const statusCode = Number(data.status_code ?? data.statusCode ?? -1);
    const saleUrl = String(data.sale_url ?? '');
    const paymeSaleId = String(data.payme_sale_id ?? '');
    if (!response.ok || statusCode !== 0 || !saleUrl || !paymeSaleId) {
      const message = String(data.status_error_details ?? data.status_error_code ?? data.message ?? `HTTP_${response.status}`);
      throw new Error(`PAYME_CREATE_SALE_FAILED:${message}`);
    }

    return {
      provider: 'payme',
      method: 'redirect',
      url: saleUrl,
      providerSessionId: paymeSaleId,
    };
  }

  const terminal = required(env.TRANZILA_TERMINAL, 'TRANZILA_TERMINAL');
  const base = (env.TRANZILA_PAYMENT_BASE || 'https://direct.tranzila.com').replace(/\/$/, '');
  const params = new URLSearchParams({
    sum: (request.amountAgorot / 100).toFixed(2),
    currency: '1',
    contact: request.fullName,
    email: request.email,
    phone: request.phone,
    myid: request.paymentId,
    lang: 'il',
    cred_type: '1',
    notify_url_address: `${appUrl}/api/public/payments/tranzila/notify`,
    success_url_address: `${appUrl}${resultPath}&result=success`,
    fail_url_address: `${appUrl}${resultPath}&result=failed`,
  });
  return {
    provider: 'tranzila',
    method: 'redirect',
    url: `${base}/${encodeURIComponent(terminal)}/iframenew.php?${params.toString()}`,
  };
}
