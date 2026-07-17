export interface Env {
  DATABASE_URL: string;
  SETUP_TOKEN: string;
  SESSION_SECRET: string;
  PUBLIC_APP_URL: string;
  PAYMENT_PROVIDER: 'mock' | 'tranzila' | 'payme';
  TRANZILA_TERMINAL?: string;
  TRANZILA_PASSWORD?: string;
  TRANZILA_PAYMENT_BASE?: string;
  PAYME_API_BASE?: string;
  PAYME_SELLER_ID?: string;
  PAYME_CLIENT_KEY?: string;
  PAYME_CALLBACK_SECRET?: string;
  PAYME_LANGUAGE?: string;
  PAYME_PAYMENT_METHOD?: string;
  PAYME_REFUND_PATH?: string;
  RESEND_API_KEY?: string;
  EMAIL_FROM?: string;
  INVOICE_WEBHOOK_URL?: string;
  INVOICE_WEBHOOK_SECRET?: string;
  WHATSAPP_WEBHOOK_URL?: string;
  WHATSAPP_WEBHOOK_SECRET?: string;
  CRON_SECRET?: string;
  TURNSTILE_SITE_KEY?: string;
  TURNSTILE_SECRET_KEY?: string;
  ADMIN_EMAIL_OTP_REQUIRED?: string;
  PUBLIC_RATE_LIMITER?: RateLimit;
  AUTH_RATE_LIMITER?: RateLimit;
  MEDIA: R2Bucket;
  ASSETS: Fetcher;
}

export type AdminRole = 'OWNER' | 'ADMIN' | 'INSTRUCTOR' | 'VIEW_ONLY';

export interface AdminSession {
  adminId: string;
  email: string;
  displayName: string;
  role: AdminRole;
}
