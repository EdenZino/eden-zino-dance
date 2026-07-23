import { Hono } from 'hono';
import { z } from 'zod';
import { db } from '../lib/db';
import { buildPaymentSession } from '../services/payment';
import { brandedEmail, sendEmail } from '../services/notifications';
import { createCustomerSession, destroyCustomerSession, getCustomerEmail, publicAccessHash, verifyOrderAccess, verifyRegistrationAccess } from '../lib/auth';
import { randomToken, sha256 } from '../lib/crypto';
import { verifyTurnstile } from '../lib/turnstile';
import type { Env } from '../types';
import { withRelativeAssetUrl } from '../lib/media';

const publicRoutes = new Hono<{ Bindings: Env }>();

const participantSchema = z.object({
  firstName: z.string().min(1).max(80),
  lastName: z.string().min(1).max(80),
  birthYear: z.union([z.number().int().min(1900).max(2100), z.string()]).optional(),
  experienceLevel: z.string().max(100).optional(),
  partnerName: z.string().max(160).optional(),
}).passthrough();

const reserveSchema = z.object({
  workshopCode: z.string().min(3).max(20),
  firstName: z.string().min(1).max(80),
  lastName: z.string().min(1).max(80),
  email: z.string().email().max(254),
  phone: z.string().min(7).max(30),
  notes: z.string().max(2000).optional().default(''),
  participants: z.array(participantSchema).min(1).max(10),
  couponCode: z.string().max(50).optional().nullable(),
  passCode: z.string().max(50).optional().nullable(),
  membershipCode: z.string().max(50).optional().nullable(),
  marketingConsent: z.boolean().default(false),
  guardian: z.record(z.unknown()).optional().default({}),
  customAnswers: z.record(z.unknown()).optional().default({}),
  acceptedTermsVersion: z.string().min(1),
  acceptedPrivacyVersion: z.string().min(1),
  acceptedCancellationVersion: z.string().min(1),
  paymentDueType: z.enum(['FULL', 'DEPOSIT']).default('FULL'),
});


function activePaymentEnvironment(env: Env) {
  if (env.PAYMENT_PROVIDER === 'mock') return 'mock';
  if (env.PAYMENT_PROVIDER === 'payme') return String(env.PAYME_API_BASE ?? '').toLowerCase().includes('sandbox') ? 'sandbox' : 'production';
  return 'production';
}

function safeText(value: unknown) {
  return String(value ?? '').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

function requestLanguage(c: any): 'he' | 'en' {
  return String(c.req.header('X-Eden-Language') ?? '').toLowerCase() === 'en' ? 'en' : 'he';
}

async function loadPortalData(env: Env, email: string) {
  const sql = db(env);
  const [registrations, entitlements, orders] = await Promise.all([
    sql`select r.registration_code,r.status,r.participant_count,r.total_amount_agorot,r.amount_paid_agorot,
      greatest(0,r.total_amount_agorot-r.amount_paid_agorot)::int balance_agorot,r.balance_due_at,w.public_code,w.title,w.title_en,w.starts_at,w.ends_at,w.location_name,w.location_name_en,w.location_address,w.location_address_en
      from registrations r join workshops w on w.id=r.workshop_id where lower(r.email)=lower(${email}) order by w.starts_at desc`,
    sql`select * from customer_entitlements where lower(email)=lower(${email}) order by valid_until desc`,
    sql`select order_code,order_type,status,amount_agorot,created_at,metadata from commerce_orders where lower(email)=lower(${email}) order by created_at desc`,
  ]);
  return { email, registrations, entitlements, orders };
}

publicRoutes.get('/site', async (c) => {
  const sql = db(c.env);
  const [settings, content, legal] = await Promise.all([
    sql`select business_name, contact_email, contact_phone, address, instagram_url, default_currency, timezone, public_theme, classic_palette,accessibility_contact_name,accessibility_email,accessibility_phone,mailing_address,mailing_address_en,accessibility_known_limitations,accessibility_known_limitations_en from business_settings where singleton = true`,
    sql`select key, value from site_content`,
    sql`select type, version, title, title_en, content, content_en from legal_documents where is_active = true order by published_at desc`,
  ]);
  return c.json({
    settings: settings[0] ?? {},
    content: Object.fromEntries((content as Array<{ key: string; value: unknown }>).map((row) => [row.key, row.value])),
    legal,
    turnstileSiteKey: c.env.TURNSTILE_SITE_KEY ?? '',
  });
});

publicRoutes.get('/gallery', async (c) => {
  const rows = await db(c.env)`select g.id,g.media_type,g.title,g.title_en,g.caption,g.caption_en,g.alt_text,g.alt_text_en,g.display_order,g.created_at,
    a.object_key,a.public_url,a.file_name,a.content_type,a.size_bytes
    from gallery_items g join uploaded_assets a on a.id=g.asset_id
    where g.is_published=true order by g.display_order asc,g.created_at desc`;
  return c.json({ items: rows.map((row: any) => withRelativeAssetUrl(row)) });
});

publicRoutes.get('/workshops', async (c) => {
  const result = await db(c.env)`select w.id, w.public_code, w.slug, w.title, w.title_en, w.short_description, w.short_description_en, w.image_url, w.location_name, w.location_name_en,
    w.location_address, w.location_address_en, w.starts_at, w.ends_at, w.level, w.level_en, w.audience, w.audience_en, w.price_agorot, w.early_bird_price_agorot,
    w.early_bird_ends_at, w.currency, w.capacity, w.status, w.recurrence_label, w.recurrence_label_en, a.available,
    coalesce(json_agg(json_build_object('id',i.id,'name',i.name,'name_en',i.name_en,'imageUrl',i.image_url)) filter (where i.id is not null), '[]') as instructors
    from workshops w join workshop_availability a on a.id = w.id
    left join workshop_instructors wi on wi.workshop_id = w.id left join instructors i on i.id = wi.instructor_id
    where w.status in ('PUBLISHED','FULL') and w.ends_at > now() and not w.is_private
    group by w.id, a.available order by w.starts_at asc`;
  return c.json({ workshops: result });
});

publicRoutes.get('/workshops/:code', async (c) => {
  const code = c.req.param('code');
  const sql = db(c.env);
  const workshops = await sql`select w.*, a.available,
    coalesce(json_agg(distinct jsonb_build_object('id',i.id,'name',i.name,'name_en',i.name_en,'bio',i.bio,'bio_en',i.bio_en,'imageUrl',i.image_url,'instagramUrl',i.instagram_url)) filter (where i.id is not null), '[]') as instructors
    from workshops w join workshop_availability a on a.id = w.id
    left join workshop_instructors wi on wi.workshop_id = w.id left join instructors i on i.id = wi.instructor_id
    where upper(w.public_code) = upper(${code}) or w.slug = ${code}
    group by w.id, a.available limit 1`;
  if (!workshops.length) return c.json({ error: 'WORKSHOP_NOT_FOUND' }, 404);
  const workshop = workshops[0] as { id: string };
  const [fields, legal] = await Promise.all([
    sql`select id, field_key, field_type, label, label_en, help_text, help_text_en, required, options, options_en, display_order from workshop_fields where workshop_id = ${workshop.id}::uuid order by display_order`,
    sql`select type, version, title, title_en, content, content_en from legal_documents where is_active = true and type in ('TERMS','PRIVACY','CANCELLATION') order by type`,
  ]);
  return c.json({ workshop, fields, legal });
});

publicRoutes.post('/registrations/reserve', async (c) => {
  try {
    const body = reserveSchema.parse(await c.req.json());
    if (body.passCode && body.membershipCode) return c.json({ error: 'CHOOSE_PASS_OR_MEMBERSHIP' }, 400);
    const sql = db(c.env);
    const result = await sql`select * from reserve_registration(
      ${body.workshopCode}, ${body.firstName}, ${body.lastName}, ${body.email}, ${body.phone}, ${body.notes},
      ${JSON.stringify(body.participants)}::jsonb, ${body.couponCode ?? null}, ${body.marketingConsent},
      ${JSON.stringify(body.guardian)}::jsonb, ${JSON.stringify(body.customAnswers)}::jsonb,
      ${body.acceptedTermsVersion}, ${body.acceptedPrivacyVersion}, ${body.acceptedCancellationVersion}, ${body.paymentDueType},
      ${body.passCode ?? null}, ${body.membershipCode ?? null}, null
    )`;
    const registration = result[0] as any;
    const accessToken = randomToken(32);
    const accessHash = await publicAccessHash(c.env.SESSION_SECRET, accessToken);
    await sql`update registrations set public_access_token_hash=${accessHash},public_access_expires_at=now()+interval '48 hours',preferred_language=${requestLanguage(c)}
      where id=${registration.registration_id}::uuid`;
    return c.json({ registration, accessToken }, 201);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'REGISTRATION_FAILED';
    const status = message.includes('WORKSHOP_FULL') || message.includes('PHONE_REGISTRATION_LIMIT') ? 409 : 400;
    return c.json({ error: message }, status);
  }
});

publicRoutes.post('/payments/start', async (c) => {
  const input = z.object({ registrationCode: z.string().min(4), paymentKind: z.enum(['INITIAL', 'BALANCE']).optional(), accessToken: z.string().min(20).optional() }).parse(await c.req.json());
  const sql = db(c.env);
  const rows = await sql`select r.id,r.registration_code,r.status,r.amount_agorot,r.total_amount_agorot,r.amount_paid_agorot,
    r.first_name,r.last_name,r.email,r.phone,r.hold_expires_at,r.preferred_language,w.title,w.title_en
    from registrations r join workshops w on w.id=r.workshop_id where r.registration_code=${input.registrationCode} limit 1`;
  const registration = rows[0] as any;
  if (!registration) return c.json({ error: 'REGISTRATION_NOT_FOUND' }, 404);
  if (!(await verifyRegistrationAccess(c, input.registrationCode, input.accessToken))) return c.json({ error: 'UNAUTHORIZED' }, 401);
  const outstanding = Math.max(0, Number(registration.total_amount_agorot) - Number(registration.amount_paid_agorot));
  if (outstanding <= 0 || ['PAID', 'CHECKED_IN'].includes(registration.status)) return c.json({ alreadyPaid: true, registrationCode: registration.registration_code });

  const isBalance = input.paymentKind === 'BALANCE' || registration.status === 'DEPOSIT_PAID';
  if (isBalance && registration.status !== 'DEPOSIT_PAID') return c.json({ error: 'BALANCE_NOT_AVAILABLE' }, 409);
  if (!isBalance && !['SEAT_HELD', 'PENDING_PAYMENT', 'PAYMENT_FAILED'].includes(registration.status)) return c.json({ error: 'REGISTRATION_NOT_PAYABLE' }, 409);
  if (!isBalance && registration.hold_expires_at && new Date(registration.hold_expires_at).getTime() <= Date.now()) return c.json({ error: 'SEAT_HOLD_EXPIRED' }, 409);

  const amount = isBalance ? outstanding : Math.min(Number(registration.amount_agorot), outstanding);
  const payment = await sql`insert into payments(registration_id,provider,provider_environment,status,amount_agorot,checkout_code,purpose)
    values(${registration.id}::uuid,${c.env.PAYMENT_PROVIDER},${activePaymentEnvironment(c.env)},'CREATED',${amount},${crypto.randomUUID()},${isBalance ? 'WORKSHOP_BALANCE' : Number(registration.amount_agorot) < Number(registration.total_amount_agorot) ? 'WORKSHOP_DEPOSIT' : 'WORKSHOP_FULL'}) returning id`;
  if (!isBalance) await sql`update registrations set status='PENDING_PAYMENT',updated_at=now() where id=${registration.id}::uuid`;
  try {
    const session = await buildPaymentSession(c.env, {
      paymentId: String((payment[0] as any).id), referenceCode: registration.registration_code, referenceType: 'registration', amountAgorot: amount,
      fullName: `${registration.first_name} ${registration.last_name}`, email: registration.email, phone: registration.phone,
      productName: `${registration.preferred_language === 'en' && registration.title_en ? registration.title_en : registration.title} — ${registration.preferred_language === 'en' ? (isBalance ? 'Balance payment' : 'Registration') : (isBalance ? 'תשלום יתרה' : 'הרשמה')}`,
      accessToken: input.accessToken,
    });
    await sql`update payments set status='PENDING',provider_session_id=${session.providerSessionId ?? null},updated_at=now() where id=${String((payment[0] as any).id)}::uuid`;
    return c.json({ session, amountAgorot: amount, purpose: isBalance ? 'BALANCE' : 'INITIAL' });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'PAYMENT_SESSION_FAILED';
    await sql`update payments set status='FAILED',raw_response=${JSON.stringify({ error: message })}::jsonb,updated_at=now() where id=${String((payment[0] as any).id)}::uuid`;
    if (!isBalance) await sql`update registrations set status='PAYMENT_FAILED',updated_at=now() where id=${registration.id}::uuid and status='PENDING_PAYMENT'`;
    return c.json({ error: 'PAYMENT_PROVIDER_UNAVAILABLE' }, 502);
  }
});

publicRoutes.get('/payments/:id/preview', async (c) => {
  if (c.env.PAYMENT_PROVIDER !== 'mock') return c.json({ error: 'NOT_AVAILABLE' }, 404);
  const rows=await db(c.env)`select p.id,p.amount_agorot,p.purpose,coalesce(w.title,case when o.order_type='PASS_PURCHASE' then 'רכישת כרטיסייה' else 'רכישת מנוי' end) title,
    coalesce(r.registration_code,o.order_code) reference_code,coalesce(concat_ws(' ',r.first_name,r.last_name),o.full_name) customer_name
    from payments p left join registrations r on r.id=p.registration_id left join workshops w on w.id=r.workshop_id left join commerce_orders o on o.id=p.order_id
    where p.id=${c.req.param('id')}::uuid limit 1`;
  if(!rows.length)return c.json({error:'PAYMENT_NOT_FOUND'},404);return c.json({payment:rows[0]});
});

publicRoutes.post('/payments/mock/complete', async (c) => {
  if (c.env.PAYMENT_PROVIDER !== 'mock') return c.json({ error: 'MOCK_DISABLED' }, 403);
  const input = z.object({ paymentId: z.string().uuid() }).parse(await c.req.json());
  const sql = db(c.env);
  const rows = await sql`select p.id,p.amount_agorot,r.registration_code,o.order_code from payments p
    left join registrations r on r.id=p.registration_id left join commerce_orders o on o.id=p.order_id where p.id=${input.paymentId}::uuid limit 1`;
  const payment = rows[0] as any;
  if (!payment) return c.json({ error: 'PAYMENT_NOT_FOUND' }, 404);
  const confirmed = await sql`select * from confirm_checkout_payment(${payment.id}::uuid,${`mock-${crypto.randomUUID()}`},${payment.amount_agorot},'MOCK-OK','mock',${JSON.stringify({ development: true })}::jsonb)`;
  return c.json({ ok: true, result: confirmed[0], registrationCode: payment.registration_code, orderCode: payment.order_code });
});

publicRoutes.post('/payments/payme/callback', async (c) => {
  if (c.env.PAYMENT_PROVIDER !== 'payme') return c.text('PAYME_DISABLED', 404);
  const expectedToken = c.env.PAYME_CALLBACK_SECRET || '';
  const suppliedToken = c.req.query('token') || '';
  if (!expectedToken || suppliedToken !== expectedToken) return c.text('INVALID_TOKEN', 403);

  let data: Record<string, string> = {};
  try {
    const contentType = c.req.header('content-type') || '';
    if (contentType.includes('application/json')) {
      const parsed = await c.req.json<Record<string, unknown>>();
      data = Object.fromEntries(Object.entries(parsed).map(([key, value]) => [key, String(value ?? '')]));
    } else {
      const parsed = await c.req.parseBody();
      data = Object.fromEntries(Object.entries(parsed).map(([key, value]) => [key, String(value ?? '')]));
    }
  } catch {
    return c.text('INVALID_BODY', 400);
  }

  const paymentId = String(data.transaction_id ?? '');
  const paymeSaleId = String(data.payme_sale_id ?? data.payme_transaction_id ?? '');
  const saleStatus = String(data.sale_status ?? '').toLowerCase();
  const eventType = String(data.notification_type ?? data.event_type ?? data.sale_event ?? '').toLowerCase();
  const sellerId = String(data.seller_payme_id ?? '');
  const amountAgorot = Math.round(Number(data.sale_price ?? data.price ?? 0));
  if (sellerId && c.env.PAYME_SELLER_ID && sellerId !== c.env.PAYME_SELLER_ID) return c.text('INVALID_SELLER', 403);

  const sql = db(c.env);
  if (eventType.includes('refund') || saleStatus.includes('refund')) {
    if (!paymeSaleId) return c.text('INVALID_REFUND', 400);
    const refundAmount = Math.round(Number(data.sale_refund_amount ?? data.refund_amount ?? data.sale_price ?? 0));
    const refunds = await sql`select f.id from refunds f join payments p on p.id=f.payment_id
      where (p.provider_session_id=${paymeSaleId} or p.provider_transaction_id=${paymeSaleId})
        and f.status in ('PROCESSING','MANUAL_ACTION_REQUIRED','FAILED')
        and (${refundAmount}::int<=0 or f.amount_agorot=${refundAmount})
      order by f.requested_at limit 1`;
    if (!refunds.length) return c.text('REFUND_NOT_FOUND', 404);
    await sql`select * from complete_refund_atomic(${String((refunds[0] as any).id)}::uuid,${String(data.payme_refund_id ?? paymeSaleId)},${JSON.stringify(data)}::jsonb)`;
    return c.text('OK');
  }
  if (!paymentId || !paymeSaleId || !Number.isFinite(amountAgorot) || amountAgorot <= 0) return c.text('INVALID', 400);
  if (saleStatus === 'completed') {
    try {
      await sql`select * from confirm_checkout_payment(
        ${paymentId}::uuid,
        ${paymeSaleId},
        ${amountAgorot},
        ${String(data.payme_sale_code ?? data.credit_card_auth_number ?? '')},
        ${String(data.sale_payment_method ?? data.payment_method ?? 'card')},
        ${JSON.stringify(data)}::jsonb
      )`;
    } catch (error) {
      return c.text(error instanceof Error ? error.message : 'ERROR', 409);
    }
  } else if (['failed', 'cancelled', 'canceled', 'declined'].includes(saleStatus)) {
    const paymentStatus = saleStatus === 'cancelled' || saleStatus === 'canceled' ? 'CANCELLED' : 'FAILED';
    await sql`update payments set status=${paymentStatus},provider_session_id=coalesce(provider_session_id,${paymeSaleId}),raw_response=${JSON.stringify(data)}::jsonb,updated_at=now() where id=${paymentId}::uuid and status<>'SUCCEEDED'`;
    await sql`update registrations r set status='PAYMENT_FAILED',updated_at=now() from payments p where p.id=${paymentId}::uuid and p.registration_id=r.id and r.status='PENDING_PAYMENT'`;
    await sql`update commerce_orders o set status='FAILED',updated_at=now() from payments p where p.id=${paymentId}::uuid and p.order_id=o.id and o.status='PENDING_PAYMENT'`;
  }

  return c.text('OK');
});

publicRoutes.post('/payments/tranzila/notify', async (c) => {
  const parsed = await c.req.parseBody();
  const data = Object.fromEntries(Object.entries(parsed).map(([key, value]) => [key, String(value)]));
  const responseCode = String(data.Response ?? '');
  const supplier = String(data.supplier ?? '');
  const paymentId = String(data.myid ?? '');
  const sum = Number.parseFloat(String(data.sum ?? '0'));
  if (!paymentId || !Number.isFinite(sum)) return c.text('INVALID', 400);
  if (c.env.TRANZILA_TERMINAL && supplier && supplier !== c.env.TRANZILA_TERMINAL) return c.text('INVALID_SUPPLIER', 403);
  const sql = db(c.env);
  if (responseCode === '000' || responseCode === '0') {
    const transactionId = String(data.Tempref ?? data.ConfirmationCode ?? data.index ?? crypto.randomUUID());
    try {
      await sql`select * from confirm_checkout_payment(${paymentId}::uuid,${transactionId},${Math.round(sum * 100)},${String(data.ConfirmationCode ?? '')},${String(data.cardtype ?? 'card')},${JSON.stringify(data)}::jsonb)`;
    } catch (error) {
      return c.text(error instanceof Error ? error.message : 'ERROR', 409);
    }
  } else {
    await sql`update payments set status='FAILED',raw_response=${JSON.stringify(data)}::jsonb,updated_at=now() where id=${paymentId}::uuid and status<>'SUCCEEDED'`;
    await sql`update registrations r set status='PAYMENT_FAILED',updated_at=now() from payments p where p.id=${paymentId}::uuid and p.registration_id=r.id and r.status='PENDING_PAYMENT'`;
    await sql`update commerce_orders o set status='FAILED',updated_at=now() from payments p where p.id=${paymentId}::uuid and p.order_id=o.id and o.status='PENDING_PAYMENT'`;
  }
  return c.text('OK');
});

publicRoutes.get('/registrations/:code/status', async (c) => {
  const code = c.req.param('code');
  if (!(await verifyRegistrationAccess(c, code, c.req.query('access')))) return c.json({ error: 'UNAUTHORIZED' }, 401);
  const result = await db(c.env)`select r.registration_code,r.status,r.first_name,r.last_name,r.email,r.participant_count,
    r.amount_agorot,r.total_amount_agorot,r.amount_paid_agorot,greatest(0,r.total_amount_agorot-r.amount_paid_agorot)::int as balance_agorot,
    r.balance_due_at,r.hold_expires_at,w.title,w.title_en,w.starts_at,w.ends_at,w.location_name,w.location_name_en,w.location_address,w.location_address_en
    from registrations r join workshops w on w.id=r.workshop_id where r.registration_code=${code} limit 1`;
  if (!result.length) return c.json({ error: 'REGISTRATION_NOT_FOUND' }, 404);
  return c.json({ registration: result[0] });
});

publicRoutes.post('/waitlist', async (c) => {
  const input = z.object({ workshopCode: z.string(), firstName: z.string().min(1), lastName: z.string().min(1), email: z.string().email(), phone: z.string().min(7), participantCount: z.number().int().min(1).max(10).default(1) }).parse(await c.req.json());
  const sql = db(c.env);
  const workshops = await sql`select id,allow_waitlist from workshops where upper(public_code)=upper(${input.workshopCode}) limit 1`;
  const workshop = workshops[0] as any;
  if (!workshop || !workshop.allow_waitlist) return c.json({ error: 'WAITLIST_NOT_AVAILABLE' }, 409);
  await sql`insert into waitlist_entries(workshop_id,first_name,last_name,email,phone,participant_count,preferred_language)
    values(${workshop.id}::uuid,${input.firstName},${input.lastName},lower(${input.email}),${input.phone},${input.participantCount},${requestLanguage(c)})
    on conflict(workshop_id,email) do update set first_name=excluded.first_name,last_name=excluded.last_name,phone=excluded.phone,participant_count=excluded.participant_count,preferred_language=excluded.preferred_language,status='WAITING'`;
  return c.json({ ok: true }, 201);
});

publicRoutes.get('/waitlist/:token', async (c) => {
  const rows = await db(c.env)`select e.first_name,e.last_name,e.email,e.phone,e.participant_count,e.status,e.invite_expires_at,
    w.public_code,w.title,w.title_en,w.starts_at,w.location_name,w.location_name_en,w.location_address,w.location_address_en,a.available
    from waitlist_entries e join workshops w on w.id=e.workshop_id join workshop_availability a on a.id=w.id
    where e.invite_token=${c.req.param('token')} and e.status='INVITED' and e.invite_expires_at>now() limit 1`;
  if (!rows.length) return c.json({ error: 'INVITE_NOT_FOUND_OR_EXPIRED' }, 404);
  return c.json({ invite: rows[0] });
});

publicRoutes.post('/waitlist/:token/claim', async (c) => {
  const token=c.req.param('token');
  const input=z.object({accepted:z.literal(true)}).parse(await c.req.json());
  const sql=db(c.env);
  const entries=await sql`select e.*,w.public_code,w.terms_version,w.privacy_version,w.cancellation_policy_version
    from waitlist_entries e join workshops w on w.id=e.workshop_id where e.invite_token=${token} and e.status='INVITED' and e.invite_expires_at>now() limit 1`;
  const entry=entries[0] as any;if(!entry)return c.json({error:'INVITE_NOT_FOUND_OR_EXPIRED'},404);
  if(entry.registration_id){const regs=await sql`select registration_code,amount_agorot,total_amount_agorot,status from registrations where id=${entry.registration_id}::uuid`;return c.json({registration:regs[0],accessToken:null});}
  try{
    const participants=Array.from({length:Number(entry.participant_count)},()=>({firstName:entry.first_name,lastName:entry.last_name}));
    const result=await sql`select * from reserve_registration(${entry.public_code},${entry.first_name},${entry.last_name},${entry.email},${entry.phone},'Waitlist invitation',${JSON.stringify(participants)}::jsonb,null,false,'{}'::jsonb,'{}'::jsonb,${entry.terms_version},${entry.privacy_version},${entry.cancellation_policy_version},'FULL',null,null,30)`;
    const registration=result[0] as any;
    const accessToken=randomToken(32);const accessHash=await publicAccessHash(c.env.SESSION_SECRET,accessToken);
    await sql`update registrations set public_access_token_hash=${accessHash},public_access_expires_at=now()+interval '48 hours',preferred_language=${entry.preferred_language ?? 'he'} where id=${registration.registration_id}::uuid`;
    await sql`update waitlist_entries set registration_id=${registration.registration_id}::uuid,status='REGISTERED' where id=${entry.id}::uuid`;
    return c.json({registration,accessToken},201);
  }catch(error){return c.json({error:error instanceof Error?error.message:'CLAIM_FAILED'},409);}
});

publicRoutes.post('/portal/request-link', async (c) => {
  const input = z.object({ email: z.string().email(), turnstileToken: z.string().optional() }).parse(await c.req.json());
  const challenge = await verifyTurnstile(c.env, input.turnstileToken, c.req.header('CF-Connecting-IP'), 'portal_login');
  if (!challenge.success) return c.json({ error: 'HUMAN_VERIFICATION_FAILED' }, 400);
  const sql = db(c.env);
  const email = input.email.trim().toLowerCase();
  const exists = await sql`select 1 from registrations where lower(email)=lower(${email})
    union all select 1 from commerce_orders where lower(email)=lower(${email}) limit 1`;
  if (exists.length) {
    const token = randomToken(36);
    const tokenHash = await sha256(`${token}:${c.env.SESSION_SECRET}:customer-magic`);
    await sql`delete from customer_magic_tokens where lower(email)=lower(${email}) and used_at is null`;
    await sql`insert into customer_magic_tokens(email,token_hash,expires_at,requested_ip)
      values(${email},${tokenHash},now()+interval '15 minutes',${c.req.header('CF-Connecting-IP') ?? null})`;
    const url = `${c.env.PUBLIC_APP_URL.replace(/\/$/, '')}/my-registration?token=${encodeURIComponent(token)}`;
    const language = requestLanguage(c);
    const delivery = await sendEmail(c.env, {
      to: email,
      ...brandedEmail({
        language,
        eyebrow: 'SECURE ACCESS',
        title: language === 'en' ? 'Your secure sign-in link' : 'הקישור המאובטח שלך',
        intro: language === 'en' ? 'Use the button below to open your Eden Zino personal area.' : 'לחצי על הכפתור כדי להיכנס לאזור האישי שלך ב-Eden Zino.',
        body: language === 'en'
          ? '<p style="color:#6F5A61;line-height:1.75">The link is valid for 15 minutes and can be used once.</p>'
          : '<p style="color:#6F5A61;line-height:1.75">הקישור תקף ל-15 דקות וניתן לשימוש פעם אחת.</p>',
        buttonLabel: language === 'en' ? 'Open my personal area' : 'כניסה לאזור האישי',
        buttonUrl: url,
        appUrl: c.env.PUBLIC_APP_URL,
      }),
      subject: language === 'en' ? 'Secure sign-in link — Eden Zino' : 'קישור מאובטח לאזור האישי — Eden Zino',
    });
    if (delivery.outcome === 'CONFIGURATION_ERROR') return c.json({ error: 'EMAIL_PROVIDER_NOT_CONFIGURED' }, 503);
  }
  return c.json({ ok: true, message: 'אם קיימת הרשמה עבור הכתובת, נשלח אליה קישור מאובטח.' }, 202);
});

publicRoutes.post('/portal/session', async (c) => {
  const input = z.object({ token: z.string().min(20) }).parse(await c.req.json());
  const tokenHash = await sha256(`${input.token}:${c.env.SESSION_SECRET}:customer-magic`);
  const rows = await db(c.env)`update customer_magic_tokens set used_at=now()
    where token_hash=${tokenHash} and used_at is null and expires_at>now() returning email`;
  if (!rows.length) return c.json({ error: 'INVALID_OR_EXPIRED_LINK' }, 401);
  await createCustomerSession(c, String((rows[0] as any).email));
  return c.json({ ok: true });
});

publicRoutes.get('/portal/me', async (c) => {
  const email = await getCustomerEmail(c);
  if (!email) return c.json({ error: 'UNAUTHORIZED' }, 401);
  return c.json(await loadPortalData(c.env, email));
});

publicRoutes.post('/portal/logout', async (c) => {
  await destroyCustomerSession(c);
  return c.json({ ok: true });
});

publicRoutes.post('/portal/lookup', (c) => c.json({ error: 'LEGACY_PORTAL_DISABLED' }, 410));

publicRoutes.get('/products', async (c) => {
  const sql = db(c.env);
  const [plans, passes] = await Promise.all([
    sql`select id,name,name_en,description,description_en,price_agorot,billing_interval,included_credits,discount_percent from membership_plans where is_active=true order by price_agorot`,
    sql`select id,name,name_en,description,description_en,credits,price_agorot,validity_days from pass_products where is_active=true order by price_agorot`,
  ]);
  return c.json({ membershipPlans: plans, passProducts: passes });
});

publicRoutes.post('/orders', async (c) => {
  const input = z.object({ productType: z.enum(['PASS', 'MEMBERSHIP']), productId: z.string().uuid(), fullName: z.string().min(2), email: z.string().email(), phone: z.string().min(7) }).parse(await c.req.json());
  const sql = db(c.env);
  const products = input.productType === 'PASS'
    ? await sql`select id,name,name_en,price_agorot from pass_products where id=${input.productId}::uuid and is_active=true`
    : await sql`select id,name,name_en,price_agorot from membership_plans where id=${input.productId}::uuid and is_active=true`;
  const product = products[0] as any;
  if (!product) return c.json({ error: 'PRODUCT_NOT_FOUND' }, 404);
  const orderCode = `ORD-${crypto.randomUUID().replaceAll('-', '').slice(0, 9).toUpperCase()}`;
  const accessToken = randomToken(32);
  const accessHash = await publicAccessHash(c.env.SESSION_SECRET, accessToken);
  const orderRows = await sql`insert into commerce_orders(order_code,order_type,pass_product_id,membership_plan_id,full_name,email,phone,amount_agorot,preferred_language)
    values(${orderCode},${input.productType === 'PASS' ? 'PASS_PURCHASE' : 'MEMBERSHIP_PURCHASE'},${input.productType === 'PASS' ? input.productId : null}::uuid,${input.productType === 'MEMBERSHIP' ? input.productId : null}::uuid,${input.fullName},lower(${input.email}),${input.phone},${product.price_agorot},${requestLanguage(c)}) returning id`;
  const orderId = String((orderRows[0] as any).id);
  await sql`update commerce_orders set public_access_token_hash=${accessHash},public_access_expires_at=now()+interval '48 hours' where id=${orderId}::uuid`;
  const paymentRows = await sql`insert into payments(order_id,provider,provider_environment,status,amount_agorot,checkout_code,purpose)
    values(${orderId}::uuid,${c.env.PAYMENT_PROVIDER},${activePaymentEnvironment(c.env)},'CREATED',${product.price_agorot},${crypto.randomUUID()},${input.productType === 'PASS' ? 'PASS_PURCHASE' : 'MEMBERSHIP_PURCHASE'}) returning id`;
  try {
    const paymentId = String((paymentRows[0] as any).id);
    const session = await buildPaymentSession(c.env, { paymentId, referenceCode: orderCode, referenceType: 'order', amountAgorot: Number(product.price_agorot), fullName: input.fullName, email: input.email, phone: input.phone, productName: requestLanguage(c) === 'en' && product.name_en ? product.name_en : product.name, accessToken });
    await sql`update payments set status='PENDING',provider_session_id=${session.providerSessionId ?? null},updated_at=now() where id=${paymentId}::uuid`;
    return c.json({ order: { orderCode, productName: requestLanguage(c) === 'en' && product.name_en ? product.name_en : product.name }, session, accessToken }, 201);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'PAYMENT_SESSION_FAILED';
    await sql`update payments set status='FAILED',raw_response=${JSON.stringify({ error: message })}::jsonb,updated_at=now() where id=${String((paymentRows[0] as any).id)}::uuid`;
    await sql`update commerce_orders set status='FAILED',updated_at=now() where id=${orderId}::uuid`;
    return c.json({ error: 'PAYMENT_PROVIDER_UNAVAILABLE' }, 502);
  }
});

publicRoutes.post('/memberships/:code/renew', async (c) => {
  const code = c.req.param('code');
  await c.req.json().catch(() => ({}));
  const customerEmail = await getCustomerEmail(c);
  if (!customerEmail) return c.json({ error: 'UNAUTHORIZED' }, 401);
  const sql = db(c.env);
  const rows = await sql`select m.id,m.membership_code,m.full_name,m.email,m.phone,mp.name,mp.name_en,mp.price_agorot
    from memberships m join membership_plans mp on mp.id=m.plan_id where upper(m.membership_code)=upper(${code}) and lower(m.email)=lower(${customerEmail}) limit 1`;
  const membership = rows[0] as any;
  if (!membership) return c.json({ error: 'MEMBERSHIP_NOT_FOUND' }, 404);
  const orderCode = `ORD-${crypto.randomUUID().replaceAll('-', '').slice(0, 9).toUpperCase()}`;
  const accessToken = randomToken(32);
  const accessHash = await publicAccessHash(c.env.SESSION_SECRET, accessToken);
  const order = await sql`insert into commerce_orders(order_code,order_type,membership_id,full_name,email,phone,amount_agorot,preferred_language)
    values(${orderCode},'MEMBERSHIP_RENEWAL',${membership.id}::uuid,${membership.full_name},${membership.email},${membership.phone},${membership.price_agorot},${requestLanguage(c)}) returning id`;
  await sql`update commerce_orders set public_access_token_hash=${accessHash},public_access_expires_at=now()+interval '48 hours' where id=${String((order[0] as any).id)}::uuid`;
  const payment = await sql`insert into payments(order_id,provider,provider_environment,status,amount_agorot,checkout_code,purpose)
    values(${(order[0] as any).id}::uuid,${c.env.PAYMENT_PROVIDER},${activePaymentEnvironment(c.env)},'CREATED',${membership.price_agorot},${crypto.randomUUID()},'MEMBERSHIP_RENEWAL') returning id`;
  try {
    const paymentId = String((payment[0] as any).id);
    const session = await buildPaymentSession(c.env, { paymentId, referenceCode: orderCode, referenceType: 'order', amountAgorot: Number(membership.price_agorot), fullName: membership.full_name, email: membership.email, phone: membership.phone, productName: requestLanguage(c) === 'en' ? `Membership renewal — ${membership.name_en || membership.name}` : `חידוש מנוי — ${membership.name}`, accessToken });
    await sql`update payments set status='PENDING',provider_session_id=${session.providerSessionId ?? null},updated_at=now() where id=${paymentId}::uuid`;
    return c.json({ order: { orderCode }, session, accessToken }, 201);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'PAYMENT_SESSION_FAILED';
    await sql`update payments set status='FAILED',raw_response=${JSON.stringify({ error: message })}::jsonb,updated_at=now() where id=${String((payment[0] as any).id)}::uuid`;
    await sql`update commerce_orders set status='FAILED',updated_at=now() where id=${String((order[0] as any).id)}::uuid`;
    return c.json({ error: 'PAYMENT_PROVIDER_UNAVAILABLE' }, 502);
  }
});

publicRoutes.get('/orders/:code/status', async (c) => {
  const code = c.req.param('code');
  if (!(await verifyOrderAccess(c, code, c.req.query('access')))) return c.json({ error: 'UNAUTHORIZED' }, 401);
  const rows = await db(c.env)`select order_code,order_type,status,amount_agorot,metadata,created_at from commerce_orders where order_code=${code} limit 1`;
  if (!rows.length) return c.json({ error: 'ORDER_NOT_FOUND' }, 404);
  return c.json({ order: rows[0] });
});

publicRoutes.post('/cancellation-requests', async (c) => {
  const input = z.object({ registrationCode: z.string().min(4), reason: z.string().min(3).max(2000) }).parse(await c.req.json());
  const email = await getCustomerEmail(c);
  if (!email) return c.json({ error: 'UNAUTHORIZED' }, 401);
  const sql = db(c.env);
  const regs = await sql`select id from registrations where registration_code=${input.registrationCode} and lower(email)=lower(${email}) limit 1`;
  if (!regs.length) return c.json({ error: 'REGISTRATION_NOT_FOUND' }, 404);
  const existing=await sql`select id,status from cancellation_requests where registration_id=${(regs[0] as any).id}::uuid and status in ('OPEN','APPROVED') limit 1`;
  if(existing.length) return c.json({ error:'CANCELLATION_ALREADY_IN_PROGRESS', request:existing[0] },409);
  await sql`insert into cancellation_requests(registration_id,email,reason) values(${(regs[0] as any).id}::uuid,lower(${email}),${input.reason})`;
  return c.json({ ok: true }, 201);
});

publicRoutes.post('/privacy-requests', async (c) => {
  const input = z.object({ email: z.string().email(), requestType: z.enum(['ACCESS', 'CORRECTION', 'DELETION', 'MARKETING_OPT_OUT']), details: z.string().max(2000).default('') }).parse(await c.req.json());
  await db(c.env)`insert into privacy_requests(email,request_type,details) values(lower(${input.email}),${input.requestType},${input.details})`;
  return c.json({ ok: true }, 201);
});

publicRoutes.post('/contact', async (c) => {
  const input = z.object({ name: z.string().min(1).max(120), email: z.string().email(), phone: z.string().max(30).optional(), message: z.string().min(5).max(3000) }).parse(await c.req.json());
  const settings = await db(c.env)`select contact_email from business_settings where singleton=true`;
  const destination = String((settings[0] as any)?.contact_email ?? '');
  if (destination) await sendEmail(c.env, { to: destination, subject: `פנייה חדשה מהאתר — ${input.name}`, ...brandedEmail({ language:'he', eyebrow:'WEBSITE CONTACT', title:'פנייה חדשה מהאתר', intro:`התקבלה פנייה חדשה מאת ${input.name}.`, body:`<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-top:1px solid #E7D3D3;border-bottom:1px solid #E7D3D3"><tr><td style="padding:9px;color:#8A737A">דוא״ל</td><td style="padding:9px;font-weight:700">${safeText(input.email)}</td></tr><tr><td style="padding:9px;color:#8A737A">טלפון</td><td style="padding:9px;font-weight:700">${safeText(input.phone)}</td></tr></table><div style="margin-top:20px;padding:18px;background:#F7EEE9;border-radius:16px;line-height:1.8">${safeText(input.message).replaceAll('\n','<br>')}</div>`, appUrl:c.env.PUBLIC_APP_URL }) });
  return c.json({ ok: true });
});

export default publicRoutes;
