import { Hono } from 'hono';
import { z } from 'zod';
import { db } from '../lib/db';
import { createSession, destroySession, requireAdmin, requireRole } from '../lib/auth';
import { hashPassword, randomToken, sha256, verifyPassword } from '../lib/crypto';
import { verifyTurnstile } from '../lib/turnstile';
import { brandedEmail, sendEmail } from '../services/notifications';
import { cancelRefundAllocation, cancelRegistration, completeManualRefund, refundRegistration, retryRefund } from '../services/refunds';
import type { AdminSession, Env } from '../types';
import { mediaUrlFromKey, normalizeStoredMediaUrl, withRelativeAssetUrl } from '../lib/media';

type Vars = { admin: AdminSession };
const admin = new Hono<{ Bindings: Env; Variables: Vars }>();

admin.post('/bootstrap', async (c) => {
  const input = z.object({ setupToken: z.string(), email: z.string().email(), password: z.string().min(12), displayName: z.string().min(2) }).parse(await c.req.json());
  if (input.setupToken !== c.env.SETUP_TOKEN) return c.json({ error: 'INVALID_SETUP_TOKEN' }, 403);
  const sql = db(c.env);
  const count = await sql`select count(*)::int as count from admins`;
  if (Number((count[0] as any).count) > 0) return c.json({ error: 'ALREADY_BOOTSTRAPPED' }, 409);
  const passwordHash = await hashPassword(input.password);
  const created = await sql`insert into admins(email,password_hash,display_name,role) values(lower(${input.email}),${passwordHash},${input.displayName},'OWNER') returning id,email,display_name,role`;
  await createSession(c, String((created[0] as any).id));
  return c.json({ admin: created[0] }, 201);
});

admin.post('/login', async (c) => {
  const input = z.object({ email: z.string().email(), password: z.string().min(1), turnstileToken: z.string().optional() }).parse(await c.req.json());
  const challenge = await verifyTurnstile(c.env, input.turnstileToken, c.req.header('CF-Connecting-IP'), 'admin_login');
  if (!challenge.success) return c.json({ error: 'HUMAN_VERIFICATION_FAILED' }, 400);
  const sql = db(c.env);
  const found = await sql`select id,email,password_hash,display_name,role,is_active,failed_login_count,locked_until from admins where lower(email)=lower(${input.email}) limit 1`;
  const row = found[0] as any;
  if (row?.locked_until && new Date(row.locked_until).getTime() > Date.now()) return c.json({ error: 'ACCOUNT_TEMPORARILY_LOCKED' }, 423);
  const valid = Boolean(row?.is_active) && await verifyPassword(input.password, String(row?.password_hash ?? ''));
  if (!valid) {
    if (row) await sql`update admins set failed_login_count=failed_login_count+1,
      locked_until=case when failed_login_count+1>=5 then now()+interval '15 minutes' else locked_until end,updated_at=now()
      where id=${row.id}::uuid`;
    return c.json({ error: 'INVALID_CREDENTIALS' }, 401);
  }
  await sql`update admins set failed_login_count=0,locked_until=null where id=${row.id}::uuid`;

  const requireOtp = String(c.env.ADMIN_EMAIL_OTP_REQUIRED ?? 'true').toLowerCase() !== 'false';
  if (requireOtp) {
    const code = String(crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000).padStart(6, '0');
    const codeHash = await sha256(`${code}:${c.env.SESSION_SECRET}:admin-otp`);
    const rows = await sql`insert into admin_login_challenges(admin_id,code_hash,expires_at,ip_address)
      values(${row.id}::uuid,${codeHash},now()+interval '10 minutes',${c.req.header('CF-Connecting-IP') ?? null}) returning id`;
    const delivery = await sendEmail(c.env, { to: row.email, subject: 'קוד כניסה לממשק הניהול — Eden Zino', ...brandedEmail({ language:'he', eyebrow:'ADMIN SECURITY', title:'קוד האימות שלך', intro:'השתמש/י בקוד הבא להשלמת הכניסה לממשק הניהול.', body:`<div style="margin:24px 0;padding:20px;border-radius:16px;background:#F7EEE9;text-align:center;font-size:30px;letter-spacing:6px;font-weight:900">${code}</div><p style="color:#6F5A61;line-height:1.75">הקוד תקף ל-10 דקות. אין להעביר אותו לאדם אחר.</p>`, appUrl:c.env.PUBLIC_APP_URL }) });
    if (delivery.outcome !== 'SENT') {
      await sql`delete from admin_login_challenges where id=${String((rows[0] as any).id)}::uuid`;
      return c.json({ error: delivery.error ?? 'ADMIN_OTP_DELIVERY_FAILED' }, 503);
    }
    return c.json({ mfaRequired: true, challengeId: String((rows[0] as any).id) });
  }

  await sql`update admins set last_login_at=now() where id=${row.id}::uuid`;
  await createSession(c, row.id);
  return c.json({ admin: { id: row.id, email: row.email, displayName: row.display_name, role: row.role } });
});

admin.post('/login/verify', async (c) => {
  const input = z.object({ challengeId: z.string().uuid(), code: z.string().regex(/^\d{6}$/) }).parse(await c.req.json());
  const codeHash = await sha256(`${input.code}:${c.env.SESSION_SECRET}:admin-otp`);
  const sql = db(c.env);
  const rows = await sql`select ch.id,ch.admin_id,ch.code_hash,ch.attempts,a.email,a.display_name,a.role,a.is_active
    from admin_login_challenges ch join admins a on a.id=ch.admin_id
    where ch.id=${input.challengeId}::uuid and ch.used_at is null and ch.expires_at>now() for update`;
  const challenge = rows[0] as any;
  if (!challenge || !challenge.is_active) return c.json({ error: 'INVALID_OR_EXPIRED_CODE' }, 401);
  if (challenge.code_hash !== codeHash) {
    await sql`update admin_login_challenges set attempts=attempts+1,used_at=case when attempts+1>=5 then now() else used_at end where id=${challenge.id}::uuid`;
    return c.json({ error: 'INVALID_OR_EXPIRED_CODE' }, 401);
  }
  await sql`update admin_login_challenges set used_at=now() where id=${challenge.id}::uuid`;
  await sql`update admins set last_login_at=now(),failed_login_count=0,locked_until=null where id=${challenge.admin_id}::uuid`;
  await createSession(c, challenge.admin_id);
  return c.json({ admin: { id: challenge.admin_id, email: challenge.email, displayName: challenge.display_name, role: challenge.role } });
});

admin.post('/password-reset/request', async (c) => {
  const input = z.object({ email: z.string().email(), turnstileToken: z.string().optional() }).parse(await c.req.json());
  const human = await verifyTurnstile(c.env, input.turnstileToken, c.req.header('CF-Connecting-IP'), 'admin_reset');
  if (!human.success) return c.json({ error: 'HUMAN_VERIFICATION_FAILED' }, 400);
  const sql = db(c.env);
  const admins = await sql`select id,email from admins where lower(email)=lower(${input.email}) and is_active=true limit 1`;
  if (admins.length) {
    const row = admins[0] as any; const token = randomToken(36); const tokenHash = await sha256(`${token}:${c.env.SESSION_SECRET}:admin-reset`);
    await sql`delete from admin_password_reset_tokens where admin_id=${row.id}::uuid and used_at is null`;
    await sql`insert into admin_password_reset_tokens(admin_id,token_hash,expires_at,requested_ip) values(${row.id}::uuid,${tokenHash},now()+interval '30 minutes',${c.req.header('CF-Connecting-IP') ?? null})`;
    const url = `${c.env.PUBLIC_APP_URL.replace(/\/$/, '')}/admin?reset=${encodeURIComponent(token)}`;
    const delivery = await sendEmail(c.env, { to: row.email, subject: 'איפוס סיסמה — Eden Zino', ...brandedEmail({ language:'he', eyebrow:'ADMIN SECURITY', title:'איפוס סיסמה', intro:'התקבלה בקשה להחלפת הסיסמה לממשק הניהול.', body:'<p style="color:#6F5A61;line-height:1.75">הקישור תקף ל-30 דקות וניתן לשימוש פעם אחת.</p>', buttonLabel:'בחירת סיסמה חדשה', buttonUrl:url, appUrl:c.env.PUBLIC_APP_URL }) });
    if (delivery.outcome === 'CONFIGURATION_ERROR') return c.json({ error: 'EMAIL_PROVIDER_NOT_CONFIGURED' }, 503);
  }
  return c.json({ ok: true }, 202);
});

admin.post('/password-reset/confirm', async (c) => {
  const input = z.object({ token: z.string().min(20), password: z.string().min(12) }).parse(await c.req.json());
  const tokenHash = await sha256(`${input.token}:${c.env.SESSION_SECRET}:admin-reset`);
  const sql = db(c.env);
  const rows = await sql`update admin_password_reset_tokens set used_at=now() where token_hash=${tokenHash} and used_at is null and expires_at>now() returning admin_id`;
  if (!rows.length) return c.json({ error: 'INVALID_OR_EXPIRED_LINK' }, 401);
  const adminId = String((rows[0] as any).admin_id); const passwordHash = await hashPassword(input.password);
  await sql`update admins set password_hash=${passwordHash},password_changed_at=now(),failed_login_count=0,locked_until=null,updated_at=now() where id=${adminId}::uuid`;
  await sql`delete from admin_sessions where admin_id=${adminId}::uuid`;
  return c.json({ ok: true });
});

admin.post('/logout', async (c) => {
  await destroySession(c);
  return c.json({ ok: true });
});

admin.use('/*', requireAdmin);

admin.get('/me', (c) => c.json({ admin: c.get('admin') }));

admin.get('/dashboard', async (c) => {
  const sql = db(c.env);
  const [stats, upcoming, recent, revenue] = await Promise.all([
    sql`select
      (select count(*) from workshops where status in ('PUBLISHED','FULL') and ends_at>now())::int as active_workshops,
      (select count(*) from registrations where status in ('PAID','CHECKED_IN','PARTIALLY_REFUNDED'))::int as paid_registrations,
      (select count(*) from waitlist_entries where status='WAITING')::int as waitlist_count,
      (select count(*) from registrations where status='PAYMENT_FAILED')::int as failed_payments`,
    sql`select w.id,w.public_code,w.title,w.starts_at,w.capacity,a.occupied,a.available,w.status from workshops w join workshop_availability a on a.id=w.id where w.ends_at>now() order by w.starts_at limit 8`,
    sql`select r.id,r.registration_code,r.first_name,r.last_name,r.email,r.status,r.amount_agorot,r.created_at,w.title from registrations r join workshops w on w.id=r.workshop_id order by r.created_at desc limit 10`,
    sql`select coalesce(sum(amount_agorot),0)::int as gross_agorot, count(*)::int as transactions from payments where status in ('SUCCEEDED','PARTIALLY_REFUNDED')`,
  ]);
  return c.json({ stats: stats[0], upcoming, recent, revenue: revenue[0] });
});

admin.get('/workshops', async (c) => {
  const result = await db(c.env)`select w.*,a.occupied,a.available from workshops w join workshop_availability a on a.id=w.id order by w.starts_at desc`;
  return c.json({ workshops: result });
});

const workshopSchema = z.object({
  publicCode: z.string().min(4).max(20).optional(), slug: z.string().min(3).max(120), title: z.string().min(2), titleEn: z.string().max(200).default(''),
  shortDescription: z.string().default(''), shortDescriptionEn: z.string().default(''), fullDescription: z.string().default(''), fullDescriptionEn: z.string().default(''), imageUrl: z.string().default(''),
  gallery: z.array(z.string()).default([]), locationName: z.string().default(''), locationNameEn: z.string().default(''), locationAddress: z.string().default(''), locationAddressEn: z.string().default(''), mapUrl: z.string().default(''),
  startsAt: z.string(), endsAt: z.string(), registrationOpensAt: z.string().nullable().optional(), registrationClosesAt: z.string().nullable().optional(),
  capacity: z.number().int().positive(), minParticipants: z.number().int().positive().default(1), maxParticipantsPerOrder: z.number().int().min(1).max(10).default(1), maxRegistrationsPerPhone: z.number().int().min(1).max(50).default(2),
  balanceDueDaysBefore: z.number().int().min(0).max(365).default(0), requiredPassCredits: z.number().int().min(1).max(20).default(1), isPrivate: z.boolean().default(false),
  seriesId: z.string().uuid().nullable().optional(), recurrenceLabel: z.string().max(120).default(''), recurrenceLabelEn: z.string().max(120).default(''),
  priceAgorot: z.number().int().min(0), earlyBirdPriceAgorot: z.number().int().min(0).nullable().optional(), earlyBirdEndsAt: z.string().nullable().optional(),
  depositAgorot: z.number().int().min(0).nullable().optional(), level: z.string().default(''), levelEn: z.string().default(''), audience: z.string().default(''), audienceEn: z.string().default(''), minimumAge: z.number().int().min(0).nullable().optional(),
  accessibilityEntrance: z.enum(['UNKNOWN','YES','NO','NOT_APPLICABLE']).default('UNKNOWN'), accessibilityElevator: z.enum(['UNKNOWN','YES','NO','NOT_APPLICABLE']).default('UNKNOWN'),
  accessibilityRestroom: z.enum(['UNKNOWN','YES','NO','NOT_APPLICABLE']).default('UNKNOWN'), accessibilityParking: z.enum(['UNKNOWN','YES','NO','NOT_APPLICABLE']).default('UNKNOWN'),
  accessibilityPassages: z.string().max(1000).default(''), accessibilityPassagesEn: z.string().max(1000).default(''), accessibilityNotes: z.string().max(3000).default(''), accessibilityNotesEn: z.string().max(3000).default(''),
  accessibilityVerifiedAt: z.string().nullable().optional(), accessibilitySource: z.string().max(500).default(''),
  allowWaitlist: z.boolean().default(true), allowCoupons: z.boolean().default(true), allowTransfers: z.boolean().default(true),
  status: z.enum(['DRAFT','PUBLISHED','FULL','CLOSED','CANCELLED','COMPLETED']).default('DRAFT'),
  cancellationPolicyVersion: z.string().default('DRAFT-1'), termsVersion: z.string().default('DRAFT-1'), privacyVersion: z.string().default('DRAFT-1'),
  instructorIds: z.array(z.string().uuid()).default([]), fields: z.array(z.object({ fieldKey: z.string(), fieldType: z.string(), label: z.string(), labelEn: z.string().default(''), helpText: z.string().default(''), helpTextEn: z.string().default(''), required: z.boolean().default(false), options: z.array(z.string()).default([]), optionsEn: z.array(z.string()).default([]), displayOrder: z.number().int().default(0) })).default([]),
});

admin.post('/workshops', requireRole('OWNER','ADMIN'), async (c) => {
  const body = workshopSchema.parse(await c.req.json());
  const sql = db(c.env);
  const code = body.publicCode || `EZ${randomToken(5).slice(0,6).toUpperCase()}`;
  const actor = c.get('admin');
  const inserted = await sql`insert into workshops(public_code,slug,title,title_en,short_description,short_description_en,full_description,full_description_en,image_url,gallery,location_name,location_name_en,location_address,location_address_en,map_url,starts_at,ends_at,registration_opens_at,registration_closes_at,capacity,min_participants,max_participants_per_order,price_agorot,early_bird_price_agorot,early_bird_ends_at,deposit_agorot,level,audience,minimum_age,allow_waitlist,allow_coupons,allow_transfers,status,cancellation_policy_version,terms_version,privacy_version,created_by,max_registrations_per_phone,balance_due_days_before,required_pass_credits,is_private,series_id,recurrence_label,recurrence_label_en,level_en,audience_en,accessibility_entrance,accessibility_elevator,accessibility_restroom,accessibility_parking,accessibility_passages,accessibility_passages_en,accessibility_notes,accessibility_notes_en,accessibility_verified_at,accessibility_source)
    values(${code},${body.slug},${body.title},${body.titleEn || null},${body.shortDescription},${body.shortDescriptionEn || null},${body.fullDescription},${body.fullDescriptionEn || null},${normalizeStoredMediaUrl(body.imageUrl)},${JSON.stringify(body.gallery.map(normalizeStoredMediaUrl))}::jsonb,${body.locationName},${body.locationNameEn || null},${body.locationAddress},${body.locationAddressEn || null},${body.mapUrl},${body.startsAt}::timestamptz,${body.endsAt}::timestamptz,${body.registrationOpensAt ?? null}::timestamptz,${body.registrationClosesAt ?? null}::timestamptz,${body.capacity},${body.minParticipants},${body.maxParticipantsPerOrder},${body.priceAgorot},${body.earlyBirdPriceAgorot ?? null},${body.earlyBirdEndsAt ?? null}::timestamptz,${body.depositAgorot ?? null},${body.level},${body.audience},${body.minimumAge ?? null},${body.allowWaitlist},${body.allowCoupons},${body.allowTransfers},${body.status},${body.cancellationPolicyVersion},${body.termsVersion},${body.privacyVersion},${actor.adminId}::uuid,${body.maxRegistrationsPerPhone},${body.balanceDueDaysBefore},${body.requiredPassCredits},${body.isPrivate},${body.seriesId ?? null}::uuid,${body.recurrenceLabel},${body.recurrenceLabelEn || null},${body.levelEn || null},${body.audienceEn || null},${body.accessibilityEntrance},${body.accessibilityElevator},${body.accessibilityRestroom},${body.accessibilityParking},${body.accessibilityPassages},${body.accessibilityPassagesEn || null},${body.accessibilityNotes},${body.accessibilityNotesEn || null},${body.accessibilityVerifiedAt ?? null}::timestamptz,${body.accessibilitySource}) returning *`;
  const workshop = inserted[0] as any;
  if (body.instructorIds.length) {
    for (const instructorId of body.instructorIds) await sql`insert into workshop_instructors(workshop_id,instructor_id) values(${workshop.id}::uuid,${instructorId}::uuid) on conflict do nothing`;
  } else {
    await sql`insert into workshop_instructors(workshop_id,instructor_id) select ${workshop.id}::uuid,id from instructors where is_active=true order by created_at limit 1 on conflict do nothing`;
  }
  for (const field of body.fields) await sql`insert into workshop_fields(workshop_id,field_key,field_type,label,label_en,help_text,help_text_en,required,options,options_en,display_order) values(${workshop.id}::uuid,${field.fieldKey},${field.fieldType},${field.label},${field.labelEn || null},${field.helpText},${field.helpTextEn || null},${field.required},${JSON.stringify(field.options)}::jsonb,${JSON.stringify(field.optionsEn)}::jsonb,${field.displayOrder})`;
  await sql`insert into audit_logs(admin_id,action,entity_type,entity_id,new_value,ip_address) values(${actor.adminId}::uuid,'CREATE','WORKSHOP',${workshop.id},${JSON.stringify(workshop)}::jsonb,${c.req.header('CF-Connecting-IP') ?? null})`;
  return c.json({ workshop }, 201);
});

admin.get('/workshops/:id', async (c) => {
  const id = c.req.param('id');
  const sql = db(c.env);
  const rows = await sql`select * from workshops where id=${id}::uuid limit 1`;
  if (!rows.length) return c.json({ error: 'NOT_FOUND' }, 404);
  const [fields, instructors] = await Promise.all([
    sql`select * from workshop_fields where workshop_id=${id}::uuid order by display_order`,
    sql`select i.* from instructors i join workshop_instructors wi on wi.instructor_id=i.id where wi.workshop_id=${id}::uuid`,
  ]);
  return c.json({ workshop: rows[0], fields, instructors });
});

admin.patch('/workshops/:id', requireRole('OWNER','ADMIN'), async (c) => {
  const id = c.req.param('id');
  const body = workshopSchema.partial().parse(await c.req.json());
  const sql = db(c.env);
  const old = await sql`select * from workshops where id=${id}::uuid`;
  if (!old.length) return c.json({ error: 'NOT_FOUND' }, 404);
  const current = old[0] as any;
  const merged: any = { ...current,
    public_code: body.publicCode ?? current.public_code, slug: body.slug ?? current.slug, title: body.title ?? current.title, title_en: body.titleEn ?? current.title_en,
    short_description: body.shortDescription ?? current.short_description, short_description_en: body.shortDescriptionEn ?? current.short_description_en, full_description: body.fullDescription ?? current.full_description, full_description_en: body.fullDescriptionEn ?? current.full_description_en,
    image_url: body.imageUrl === undefined ? current.image_url : normalizeStoredMediaUrl(body.imageUrl), gallery: body.gallery === undefined ? current.gallery : body.gallery.map(normalizeStoredMediaUrl), location_name: body.locationName ?? current.location_name, location_name_en: body.locationNameEn ?? current.location_name_en,
    location_address: body.locationAddress ?? current.location_address, location_address_en: body.locationAddressEn ?? current.location_address_en, map_url: body.mapUrl ?? current.map_url, starts_at: body.startsAt ?? current.starts_at,
    ends_at: body.endsAt ?? current.ends_at, registration_opens_at: body.registrationOpensAt === undefined ? current.registration_opens_at : body.registrationOpensAt,
    registration_closes_at: body.registrationClosesAt === undefined ? current.registration_closes_at : body.registrationClosesAt,
    capacity: body.capacity ?? current.capacity, min_participants: body.minParticipants ?? current.min_participants,
    max_participants_per_order: body.maxParticipantsPerOrder ?? current.max_participants_per_order, price_agorot: body.priceAgorot ?? current.price_agorot,
    early_bird_price_agorot: body.earlyBirdPriceAgorot === undefined ? current.early_bird_price_agorot : body.earlyBirdPriceAgorot,
    early_bird_ends_at: body.earlyBirdEndsAt === undefined ? current.early_bird_ends_at : body.earlyBirdEndsAt,
    deposit_agorot: body.depositAgorot === undefined ? current.deposit_agorot : body.depositAgorot, level: body.level ?? current.level, level_en: body.levelEn ?? current.level_en,
    audience: body.audience ?? current.audience, audience_en: body.audienceEn ?? current.audience_en, minimum_age: body.minimumAge === undefined ? current.minimum_age : body.minimumAge,
    accessibility_entrance: body.accessibilityEntrance ?? current.accessibility_entrance, accessibility_elevator: body.accessibilityElevator ?? current.accessibility_elevator, accessibility_restroom: body.accessibilityRestroom ?? current.accessibility_restroom, accessibility_parking: body.accessibilityParking ?? current.accessibility_parking, accessibility_passages: body.accessibilityPassages ?? current.accessibility_passages, accessibility_passages_en: body.accessibilityPassagesEn ?? current.accessibility_passages_en, accessibility_notes: body.accessibilityNotes ?? current.accessibility_notes, accessibility_notes_en: body.accessibilityNotesEn ?? current.accessibility_notes_en, accessibility_verified_at: body.accessibilityVerifiedAt === undefined ? current.accessibility_verified_at : body.accessibilityVerifiedAt, accessibility_source: body.accessibilitySource ?? current.accessibility_source,
    allow_waitlist: body.allowWaitlist ?? current.allow_waitlist, allow_coupons: body.allowCoupons ?? current.allow_coupons,
    allow_transfers: body.allowTransfers ?? current.allow_transfers, status: body.status ?? current.status,
    cancellation_policy_version: body.cancellationPolicyVersion ?? current.cancellation_policy_version,
    terms_version: body.termsVersion ?? current.terms_version, privacy_version: body.privacyVersion ?? current.privacy_version, max_registrations_per_phone: body.maxRegistrationsPerPhone ?? current.max_registrations_per_phone,
    balance_due_days_before: body.balanceDueDaysBefore ?? current.balance_due_days_before, required_pass_credits: body.requiredPassCredits ?? current.required_pass_credits,
    is_private: body.isPrivate ?? current.is_private, series_id: body.seriesId === undefined ? current.series_id : body.seriesId, recurrence_label: body.recurrenceLabel ?? current.recurrence_label, recurrence_label_en: body.recurrenceLabelEn ?? current.recurrence_label_en,
  };
  const updated = await sql`update workshops set public_code=${merged.public_code},slug=${merged.slug},title=${merged.title},title_en=${merged.title_en},short_description=${merged.short_description},short_description_en=${merged.short_description_en},full_description=${merged.full_description},full_description_en=${merged.full_description_en},image_url=${merged.image_url},gallery=${JSON.stringify(merged.gallery)}::jsonb,location_name=${merged.location_name},location_name_en=${merged.location_name_en},location_address=${merged.location_address},location_address_en=${merged.location_address_en},map_url=${merged.map_url},starts_at=${merged.starts_at}::timestamptz,ends_at=${merged.ends_at}::timestamptz,registration_opens_at=${merged.registration_opens_at}::timestamptz,registration_closes_at=${merged.registration_closes_at}::timestamptz,capacity=${merged.capacity},min_participants=${merged.min_participants},max_participants_per_order=${merged.max_participants_per_order},price_agorot=${merged.price_agorot},early_bird_price_agorot=${merged.early_bird_price_agorot},early_bird_ends_at=${merged.early_bird_ends_at}::timestamptz,deposit_agorot=${merged.deposit_agorot},level=${merged.level},level_en=${merged.level_en},audience=${merged.audience},audience_en=${merged.audience_en},minimum_age=${merged.minimum_age},allow_waitlist=${merged.allow_waitlist},allow_coupons=${merged.allow_coupons},allow_transfers=${merged.allow_transfers},status=${merged.status},cancellation_policy_version=${merged.cancellation_policy_version},terms_version=${merged.terms_version},privacy_version=${merged.privacy_version},max_registrations_per_phone=${merged.max_registrations_per_phone},balance_due_days_before=${merged.balance_due_days_before},required_pass_credits=${merged.required_pass_credits},is_private=${merged.is_private},series_id=${merged.series_id}::uuid,recurrence_label=${merged.recurrence_label},recurrence_label_en=${merged.recurrence_label_en},accessibility_entrance=${merged.accessibility_entrance},accessibility_elevator=${merged.accessibility_elevator},accessibility_restroom=${merged.accessibility_restroom},accessibility_parking=${merged.accessibility_parking},accessibility_passages=${merged.accessibility_passages},accessibility_passages_en=${merged.accessibility_passages_en},accessibility_notes=${merged.accessibility_notes},accessibility_notes_en=${merged.accessibility_notes_en},accessibility_verified_at=${merged.accessibility_verified_at}::timestamptz,accessibility_source=${merged.accessibility_source},updated_at=now() where id=${id}::uuid returning *`;
  if (body.instructorIds) {
    await sql`delete from workshop_instructors where workshop_id=${id}::uuid`;
    for (const instructorId of body.instructorIds) await sql`insert into workshop_instructors(workshop_id,instructor_id) values(${id}::uuid,${instructorId}::uuid)`;
  }
  if (body.fields) {
    await sql`delete from workshop_fields where workshop_id=${id}::uuid`;
    for (const field of body.fields) await sql`insert into workshop_fields(workshop_id,field_key,field_type,label,label_en,help_text,help_text_en,required,options,options_en,display_order) values(${id}::uuid,${field.fieldKey},${field.fieldType},${field.label},${field.labelEn || null},${field.helpText},${field.helpTextEn || null},${field.required},${JSON.stringify(field.options)}::jsonb,${JSON.stringify(field.optionsEn)}::jsonb,${field.displayOrder})`;
  }
  const actor = c.get('admin');
  await sql`insert into audit_logs(admin_id,action,entity_type,entity_id,old_value,new_value) values(${actor.adminId}::uuid,'UPDATE','WORKSHOP',${id},${JSON.stringify(current)}::jsonb,${JSON.stringify(updated[0])}::jsonb)`;
  return c.json({ workshop: updated[0] });
});

admin.post('/workshops/:id/duplicate', requireRole('OWNER','ADMIN'), async (c) => {
  const id = c.req.param('id');
  const sql = db(c.env);
  const source = await sql`select * from workshops where id=${id}::uuid`;
  if (!source.length) return c.json({ error: 'NOT_FOUND' }, 404);
  const w = source[0] as any;
  const code = `EZ${randomToken(5).slice(0,6).toUpperCase()}`;
  const copy = await sql`insert into workshops(
    public_code,slug,title,title_en,short_description,short_description_en,full_description,full_description_en,image_url,gallery,
    location_name,location_name_en,location_address,location_address_en,map_url,starts_at,ends_at,registration_opens_at,registration_closes_at,
    capacity,min_participants,max_participants_per_order,max_registrations_per_phone,price_agorot,early_bird_price_agorot,early_bird_ends_at,
    deposit_agorot,level,level_en,audience,audience_en,minimum_age,allow_waitlist,allow_coupons,allow_transfers,status,
    cancellation_policy_version,terms_version,privacy_version,created_by,balance_due_days_before,required_pass_credits,is_private,series_id,recurrence_label,recurrence_label_en,accessibility_entrance,accessibility_elevator,accessibility_restroom,accessibility_parking,accessibility_passages,accessibility_passages_en,accessibility_notes,accessibility_notes_en,accessibility_verified_at,accessibility_source
  ) values(
    ${code},${`${w.slug}-copy-${Date.now()}`},${`${w.title} — עותק`},${w.title_en},${w.short_description},${w.short_description_en},${w.full_description},${w.full_description_en},${w.image_url},${JSON.stringify(w.gallery)}::jsonb,
    ${w.location_name},${w.location_name_en},${w.location_address},${w.location_address_en},${w.map_url},${w.starts_at}::timestamptz,${w.ends_at}::timestamptz,${w.registration_opens_at}::timestamptz,${w.registration_closes_at}::timestamptz,
    ${w.capacity},${w.min_participants},${w.max_participants_per_order},${w.max_registrations_per_phone},${w.price_agorot},${w.early_bird_price_agorot},${w.early_bird_ends_at}::timestamptz,
    ${w.deposit_agorot},${w.level},${w.level_en},${w.audience},${w.audience_en},${w.minimum_age},${w.allow_waitlist},${w.allow_coupons},${w.allow_transfers},'DRAFT',
    ${w.cancellation_policy_version},${w.terms_version},${w.privacy_version},${c.get('admin').adminId}::uuid,${w.balance_due_days_before},${w.required_pass_credits},${w.is_private},${w.series_id}::uuid,${w.recurrence_label},${w.recurrence_label_en},${w.accessibility_entrance},${w.accessibility_elevator},${w.accessibility_restroom},${w.accessibility_parking},${w.accessibility_passages},${w.accessibility_passages_en},${w.accessibility_notes},${w.accessibility_notes_en},${w.accessibility_verified_at}::timestamptz,${w.accessibility_source}
  ) returning *`;
  return c.json({ workshop: copy[0] }, 201);
});

admin.get('/registrations', async (c) => {
  const status = c.req.query('status'); const workshopId = c.req.query('workshopId'); const search = c.req.query('search');
  const result = await db(c.env)`select r.*,w.title,w.public_code,w.starts_at from registrations r join workshops w on w.id=r.workshop_id
    where (${status ?? null}::text is null or r.status=${status ?? null})
      and (${workshopId ?? null}::uuid is null or r.workshop_id=${workshopId ?? null}::uuid)
      and (${search ?? null}::text is null or concat_ws(' ',r.first_name,r.last_name,r.email,r.phone,r.registration_code) ilike ${search ? `%${search}%` : null})
    order by r.created_at desc limit 1000`;
  return c.json({ registrations: result });
});

admin.post('/registrations/:id/checkin', requireRole('OWNER','ADMIN','INSTRUCTOR'), async (c) => {
  const id = c.req.param('id'); const actor = c.get('admin'); const sql = db(c.env);
  await sql`insert into checkins(registration_id,checked_in_by) values(${id}::uuid,${actor.adminId}::uuid) on conflict(registration_id) do update set checked_in_at=now(),checked_in_by=excluded.checked_in_by`;
  await sql`update registrations set status='CHECKED_IN',updated_at=now() where id=${id}::uuid and status in ('PAID','PARTIALLY_REFUNDED')`;
  return c.json({ ok: true });
});

admin.post('/registrations/:id/cancel', requireRole('OWNER','ADMIN'), async (c) => {
  const input = z.object({ reason: z.string().min(2) }).parse(await c.req.json());
  const id = c.req.param('id');
  const actor = c.get('admin');
  if (!id || !actor) return c.json({ error: 'UNAUTHORIZED' }, 401);
  try {
    const result = await cancelRegistration(c.env, id, input.reason, actor.adminId);
    return c.json({ ok: true, result });
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : 'CANCELLATION_FAILED' }, 409);
  }
});

admin.post('/registrations/:id/refund', requireRole('OWNER'), async (c) => {
  const input = z.object({ amountAgorot: z.number().int().positive(), reason: z.string().min(2) }).parse(await c.req.json());
  const id = c.req.param('id');
  const actor = c.get('admin');
  if (!id || !actor) return c.json({ error: 'UNAUTHORIZED' }, 401);
  try {
    const result = await refundRegistration(c.env, id, input.amountAgorot, input.reason, actor.adminId, false);
    return c.json({ result }, 201);
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : 'REFUND_FAILED' }, 409);
  }
});

admin.post('/refunds/:id/complete', requireRole('OWNER'), async (c) => {
  const input = z.object({ providerRefundId: z.string().optional() }).parse(await c.req.json());
  const id = c.req.param('id');
  if (!id) return c.json({ error: 'NOT_FOUND' }, 404);
  try { return c.json({ ok: true, state: await completeManualRefund(c.env, id, input.providerRefundId) }); }
  catch (error) { return c.json({ error: error instanceof Error ? error.message : 'REFUND_COMPLETION_FAILED' }, 409); }
});

admin.post('/refunds/:id/retry', requireRole('OWNER'), async (c) => {
  const id = c.req.param('id');
  if (!id) return c.json({ error: 'NOT_FOUND' }, 404);
  try { return c.json({ ok: true, result: await retryRefund(c.env, id) }); }
  catch (error) { return c.json({ error: error instanceof Error ? error.message : 'REFUND_RETRY_FAILED' }, 409); }
});

admin.post('/refunds/:id/cancel-allocation', requireRole('OWNER'), async (c) => {
  const id = c.req.param('id');
  const actor = c.get('admin');
  const input = z.object({ reason: z.string().min(3).max(1000) }).parse(await c.req.json());
  if (!id || !actor) return c.json({ error: 'UNAUTHORIZED' }, 401);
  try { return c.json({ ok: true, result: await cancelRefundAllocation(c.env, id, input.reason, actor.adminId) }); }
  catch (error) { return c.json({ error: error instanceof Error ? error.message : 'REFUND_ALLOCATION_CANCEL_FAILED' }, 409); }
});

admin.post('/registrations/:id/transfer', requireRole('OWNER','ADMIN'), async (c) => {
  const input = z.object({ targetWorkshopId: z.string().uuid() }).parse(await c.req.json());
  const sql = db(c.env);
  try {
    const rows = await sql`select * from transfer_registration_atomic(${c.req.param('id')}::uuid,${input.targetWorkshopId}::uuid,${c.get('admin').adminId}::uuid)`;
    const result = rows[0] as any;
    if (result?.source_workshop_id) await sql`select * from invite_next_waitlist(${result.source_workshop_id}::uuid,${randomToken(32)},24)`;
    return c.json({ ok: true, transfer: result });
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : 'TRANSFER_FAILED' }, 409);
  }
});

admin.get('/waitlist', async (c) => {
  const rows = await db(c.env)`select e.*,w.title,w.public_code,w.starts_at from waitlist_entries e join workshops w on w.id=e.workshop_id order by e.created_at`;
  return c.json({ entries: rows });
});

admin.post('/waitlist/:id/invite', requireRole('OWNER','ADMIN'), async (c) => {
  const id = c.req.param('id'); const token = randomToken(32); const sql = db(c.env);
  const row = await sql`update waitlist_entries set status='INVITED',invite_token=${token},invited_at=now(),invite_expires_at=now()+interval '24 hours' where id=${id}::uuid and status in ('WAITING','EXPIRED') returning *`;
  if (!row.length) return c.json({ error: 'NOT_FOUND_OR_NOT_INVITABLE' }, 404);
  await sql`insert into notification_jobs(waitlist_entry_id,channel,template_key,payload) values(${id}::uuid,'EMAIL','WAITLIST_INVITE',${JSON.stringify({waitlistEntryId:id,inviteToken:token})}::jsonb)`;
  return c.json({ entry: row[0], inviteUrl: `${c.env.PUBLIC_APP_URL}/waitlist/${token}` });
});

admin.get('/coupons', async (c) => c.json({ coupons: await db(c.env)`select c.*,w.title workshop_title from coupons c left join workshops w on w.id=c.workshop_id order by c.created_at desc` }));
admin.post('/coupons', requireRole('OWNER','ADMIN'), async (c) => {
  const input = z.object({ code: z.string().min(2), description: z.string().default(''), discountType: z.enum(['PERCENT','FIXED']), discountValue: z.number().int().positive(), maxRedemptions: z.number().int().positive().nullable().optional(), perEmailLimit: z.number().int().positive().default(1), startsAt: z.string().nullable().optional(), endsAt: z.string().nullable().optional(), minimumAmountAgorot: z.number().int().min(0).default(0), workshopId: z.string().uuid().nullable().optional(), isActive: z.boolean().default(true) }).parse(await c.req.json());
  const row = await db(c.env)`insert into coupons(code,description,discount_type,discount_value,max_redemptions,per_email_limit,starts_at,ends_at,minimum_amount_agorot,workshop_id,is_active) values(upper(${input.code}),${input.description},${input.discountType},${input.discountValue},${input.maxRedemptions ?? null},${input.perEmailLimit},${input.startsAt ?? null}::timestamptz,${input.endsAt ?? null}::timestamptz,${input.minimumAmountAgorot},${input.workshopId ?? null}::uuid,${input.isActive}) returning *`;
  return c.json({ coupon: row[0] }, 201);
});

admin.get('/content', async (c) => c.json({ content: Object.fromEntries((await db(c.env)`select key,value from site_content`).map((r: any) => [r.key,r.value])) }));
admin.put('/content/:key', requireRole('OWNER','ADMIN'), async (c) => {
  const key = c.req.param('key'); const value = await c.req.json() as Record<string, unknown>;
  const normalized = { ...value };
  if (key === 'home' && typeof normalized.heroImage === 'string') normalized.heroImage = normalizeStoredMediaUrl(normalized.heroImage);
  if (key === 'instructor' && typeof normalized.portraitUrl === 'string') normalized.portraitUrl = normalizeStoredMediaUrl(normalized.portraitUrl);
  await db(c.env)`insert into site_content(key,value,updated_at) values(${key},${JSON.stringify(normalized)}::jsonb,now()) on conflict(key) do update set value=excluded.value,updated_at=now()`;
  return c.json({ ok: true });
});

admin.get('/settings', async (c) => c.json({ settings: (await db(c.env)`select * from business_settings where singleton=true`)[0] }));
admin.put('/settings', requireRole('OWNER'), async (c) => {
  const input = z.object({ businessName: z.string(), legalBusinessName: z.string(), businessNumber: z.string(), contactEmail: z.string(), contactPhone: z.string(), address: z.string(), instagramUrl: z.string(), defaultHoldMinutes: z.number().int().min(3).max(60), retentionMonths: z.number().int().min(1).max(120), publicTheme: z.enum(['CLASSIC','MODERN']).default('CLASSIC'), classicPalette: z.enum(['ROSIN','PLUM','OCEAN','SAGE','MIDNIGHT']).default('ROSIN'), accessibilityContactName: z.string().default(''), accessibilityEmail: z.string().default(''), accessibilityPhone: z.string().default(''), mailingAddress: z.string().default(''), mailingAddressEn: z.string().default(''), accessibilityKnownLimitations: z.string().default(''), accessibilityKnownLimitationsEn: z.string().default('') }).parse(await c.req.json());
  const row = await db(c.env)`update business_settings set business_name=${input.businessName},legal_business_name=${input.legalBusinessName},business_number=${input.businessNumber},contact_email=${input.contactEmail},contact_phone=${input.contactPhone},address=${input.address},instagram_url=${input.instagramUrl},default_hold_minutes=${input.defaultHoldMinutes},retention_months=${input.retentionMonths},public_theme=${input.publicTheme},classic_palette=${input.classicPalette},accessibility_contact_name=${input.accessibilityContactName},accessibility_email=${input.accessibilityEmail},accessibility_phone=${input.accessibilityPhone},mailing_address=${input.mailingAddress},mailing_address_en=${input.mailingAddressEn},accessibility_known_limitations=${input.accessibilityKnownLimitations},accessibility_known_limitations_en=${input.accessibilityKnownLimitationsEn},updated_at=now() where singleton=true returning *`;
  return c.json({ settings: row[0] });
});

admin.get('/instructors', async (c) => c.json({ instructors: await db(c.env)`select * from instructors order by name` }));
admin.post('/instructors', requireRole('OWNER','ADMIN'), async (c) => {
  const input = z.object({ name: z.string(), nameEn: z.string().default(''), bio: z.string().default(''), bioEn: z.string().default(''), imageUrl: z.string().default(''), instagramUrl: z.string().default(''), isActive: z.boolean().default(true) }).parse(await c.req.json());
  const row = await db(c.env)`insert into instructors(name,name_en,bio,bio_en,image_url,instagram_url,is_active) values(${input.name},${input.nameEn || null},${input.bio},${input.bioEn || null},${normalizeStoredMediaUrl(input.imageUrl)},${input.instagramUrl},${input.isActive}) returning *`;
  return c.json({ instructor: row[0] }, 201);
});

admin.get('/products', async (c) => {
  const sql = db(c.env); const [plans, passProducts, memberships, passes] = await Promise.all([sql`select * from membership_plans order by created_at desc`,sql`select * from pass_products order by created_at desc`,sql`select * from memberships order by created_at desc limit 500`,sql`select * from passes order by created_at desc limit 500`]);
  return c.json({ plans, passProducts, memberships, passes });
});
admin.post('/membership-plans', requireRole('OWNER','ADMIN'), async (c) => {
  const input = z.object({ name:z.string(),nameEn:z.string().default(''),description:z.string().default(''),descriptionEn:z.string().default(''),priceAgorot:z.number().int().min(0),billingInterval:z.enum(['MONTHLY','QUARTERLY','YEARLY']),includedCredits:z.number().int().min(0),discountPercent:z.number().int().min(0).max(100),isActive:z.boolean().default(true) }).parse(await c.req.json());
  const row=await db(c.env)`insert into membership_plans(name,name_en,description,description_en,price_agorot,billing_interval,included_credits,discount_percent,is_active) values(${input.name},${input.nameEn || null},${input.description},${input.descriptionEn || null},${input.priceAgorot},${input.billingInterval},${input.includedCredits},${input.discountPercent},${input.isActive}) returning *`; return c.json({plan:row[0]},201);
});
admin.post('/pass-products', requireRole('OWNER','ADMIN'), async (c) => {
  const input=z.object({name:z.string(),nameEn:z.string().default(''),description:z.string().default(''),descriptionEn:z.string().default(''),credits:z.number().int().positive(),priceAgorot:z.number().int().min(0),validityDays:z.number().int().positive(),isActive:z.boolean().default(true)}).parse(await c.req.json());
  const row=await db(c.env)`insert into pass_products(name,name_en,description,description_en,credits,price_agorot,validity_days,is_active) values(${input.name},${input.nameEn || null},${input.description},${input.descriptionEn || null},${input.credits},${input.priceAgorot},${input.validityDays},${input.isActive}) returning *`; return c.json({product:row[0]},201);
});

const imageContentTypes = new Set(['image/jpeg','image/png','image/webp','image/gif','image/avif']);
const videoContentTypes = new Set(['video/mp4','video/webm']);

async function storeAsset(c: any, file: File, folder: string, mode: 'IMAGE_ONLY' | 'GALLERY') {
  const type = String(file.type || '').toLowerCase();
  const isImage = imageContentTypes.has(type);
  const isVideo = videoContentTypes.has(type);
  if (mode === 'IMAGE_ONLY' && !isImage) throw new Error('IMAGE_ONLY');
  if (mode === 'GALLERY' && !isImage && !isVideo) throw new Error('UNSUPPORTED_MEDIA_TYPE');
  const maxBytes = isVideo ? 80 * 1024 * 1024 : 12 * 1024 * 1024;
  if (file.size <= 0) throw new Error('EMPTY_FILE');
  if (file.size > maxBytes) throw new Error(isVideo ? 'VIDEO_TOO_LARGE' : 'IMAGE_TOO_LARGE');
  const safeName = file.name.normalize('NFKD').replace(/[^a-zA-Z0-9._-]/g, '-').replace(/-+/g, '-').slice(-120) || 'media-file';
  const date = new Date().toISOString().slice(0, 10).replaceAll('-', '/');
  const key = `${folder}/${date}/${crypto.randomUUID()}-${safeName}`;
  await c.env.MEDIA.put(key, file.stream(), {
    httpMetadata: { contentType: type, cacheControl: 'public, max-age=31536000, immutable' },
    customMetadata: { originalName: file.name, uploadedAt: new Date().toISOString() },
  });
  const publicUrl = mediaUrlFromKey(key);
  const actor = c.get('admin');
  const rows = await db(c.env)`insert into uploaded_assets(object_key,public_url,file_name,content_type,size_bytes,uploaded_by)
    values(${key},${publicUrl},${file.name},${type},${file.size},${actor.adminId}::uuid) returning *`;
  return { asset: withRelativeAssetUrl(rows[0] as any), mediaType: isVideo ? 'VIDEO' : 'IMAGE' };
}

admin.post('/uploads', requireRole('OWNER','ADMIN'), async (c) => {
  try {
    const form = await c.req.formData(); const file = form.get('file');
    if (!(file instanceof File)) return c.json({ error: 'FILE_REQUIRED' }, 400);
    const stored = await storeAsset(c, file, 'media', 'IMAGE_ONLY');
    return c.json({ asset: stored.asset }, 201);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'UPLOAD_FAILED';
    const status = message.includes('TOO_LARGE') ? 413 : 400;
    return c.json({ error: message }, status);
  }
});

admin.get('/gallery', async (c) => {
  const rows = await db(c.env)`select g.id,g.media_type,g.title,g.title_en,g.caption,g.caption_en,g.alt_text,g.alt_text_en,g.display_order,g.is_published,g.created_at,g.updated_at,
    a.id asset_id,a.object_key,a.public_url,a.file_name,a.content_type,a.size_bytes
    from gallery_items g join uploaded_assets a on a.id=g.asset_id
    order by g.display_order asc,g.created_at desc`;
  return c.json({ items: rows.map((row: any) => withRelativeAssetUrl(row)) });
});

admin.post('/gallery', requireRole('OWNER','ADMIN'), async (c) => {
  try {
    const form = await c.req.formData(); const file = form.get('file');
    if (!(file instanceof File)) return c.json({ error: 'FILE_REQUIRED' }, 400);
    const title = String(form.get('title') ?? '').trim().slice(0, 160);
    const titleEn = String(form.get('titleEn') ?? '').trim().slice(0,160);
    const caption = String(form.get('caption') ?? '').trim().slice(0, 2000);
    const captionEn = String(form.get('captionEn') ?? '').trim().slice(0,2000);
    const altText = String(form.get('altText') ?? '').trim().slice(0, 500);
    const altTextEn = String(form.get('altTextEn') ?? '').trim().slice(0,500);
    const isPublished = String(form.get('isPublished') ?? 'true') !== 'false';
    const displayOrder = Math.max(0, Math.min(100000, Number(form.get('displayOrder') ?? 0) || 0));
    const stored = await storeAsset(c, file, 'gallery', 'GALLERY');
    const actor = c.get('admin');
    const rows = await db(c.env)`insert into gallery_items(asset_id,media_type,title,title_en,caption,caption_en,alt_text,alt_text_en,display_order,is_published,created_by)
      values(${stored.asset.id}::uuid,${stored.mediaType},${title},${titleEn || null},${caption},${captionEn || null},${altText},${altTextEn || null},${displayOrder},${isPublished},${actor.adminId}::uuid)
      returning *`;
    const item = { ...(rows[0] as any), asset_id: stored.asset.id, object_key: stored.asset.object_key, public_url: mediaUrlFromKey(String(stored.asset.object_key)), file_name: stored.asset.file_name, content_type: stored.asset.content_type, size_bytes: stored.asset.size_bytes };
    await db(c.env)`insert into audit_logs(admin_id,action,entity_type,entity_id,new_value,ip_address)
      values(${actor.adminId}::uuid,'CREATE','GALLERY_ITEM',${String((rows[0] as any).id)},${JSON.stringify(item)}::jsonb,${c.req.header('CF-Connecting-IP') ?? null})`;
    return c.json({ item }, 201);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'GALLERY_UPLOAD_FAILED';
    const status = message.includes('TOO_LARGE') ? 413 : 400;
    return c.json({ error: message }, status);
  }
});

admin.patch('/gallery/:id', requireRole('OWNER','ADMIN'), async (c) => {
  const id = c.req.param('id');
  const input = z.object({
    title: z.string().max(160).optional(), titleEn:z.string().max(160).optional(), caption: z.string().max(2000).optional(), captionEn:z.string().max(2000).optional(), altText: z.string().max(500).optional(), altTextEn:z.string().max(500).optional(),
    displayOrder: z.number().int().min(0).max(100000).optional(), isPublished: z.boolean().optional(),
  }).parse(await c.req.json());
  const current = await db(c.env)`select * from gallery_items where id=${id}::uuid`;
  if (!current.length) return c.json({ error: 'NOT_FOUND' }, 404);
  const row = current[0] as any;
  const updated = await db(c.env)`update gallery_items set title=${input.title ?? row.title},title_en=${input.titleEn ?? row.title_en},caption=${input.caption ?? row.caption},caption_en=${input.captionEn ?? row.caption_en},
    alt_text=${input.altText ?? row.alt_text},alt_text_en=${input.altTextEn ?? row.alt_text_en},display_order=${input.displayOrder ?? row.display_order},is_published=${input.isPublished ?? row.is_published},updated_at=now()
    where id=${id}::uuid returning *`;
  const actor = c.get('admin');
  await db(c.env)`insert into audit_logs(admin_id,action,entity_type,entity_id,old_value,new_value,ip_address)
    values(${actor.adminId}::uuid,'UPDATE','GALLERY_ITEM',${id},${JSON.stringify(row)}::jsonb,${JSON.stringify(updated[0])}::jsonb,${c.req.header('CF-Connecting-IP') ?? null})`;
  return c.json({ item: updated[0] });
});

admin.delete('/gallery/:id', requireRole('OWNER','ADMIN'), async (c) => {
  const id = c.req.param('id');
  const sql = db(c.env);
  const rows = await sql`select g.*,a.object_key,a.id asset_id,a.public_url from gallery_items g join uploaded_assets a on a.id=g.asset_id where g.id=${id}::uuid`;
  if (!rows.length) return c.json({ error: 'NOT_FOUND' }, 404);
  const item = rows[0] as any;
  await sql`delete from uploaded_assets where id=${item.asset_id}::uuid`;
  try { await c.env.MEDIA.delete(String(item.object_key)); } catch (error) { console.error('R2 gallery deletion failed', error); }
  const actor = c.get('admin');
  await sql`insert into audit_logs(admin_id,action,entity_type,entity_id,old_value,ip_address)
    values(${actor.adminId}::uuid,'DELETE','GALLERY_ITEM',${id},${JSON.stringify(item)}::jsonb,${c.req.header('CF-Connecting-IP') ?? null})`;
  return c.json({ ok: true });
});


admin.get('/media/library', requireRole('OWNER','ADMIN'), async (c) => {
  const search = String(c.req.query('q') ?? '').trim().slice(0, 120);
  const availableForGallery = c.req.query('availableForGallery') === 'true';
  const pattern = search ? `%${search}%` : null;
  const rows = await db(c.env)`select a.id,a.object_key,a.public_url,a.file_name,a.content_type,a.size_bytes,a.created_at,
      g.id gallery_item_id,g.title,g.title_en,g.alt_text,g.alt_text_en,g.is_published
    from uploaded_assets a
    left join gallery_items g on g.asset_id=a.id
    where a.content_type like 'image/%'
      and (${availableForGallery} = false or g.id is null)
      and (${pattern}::text is null or concat_ws(' ',a.file_name,a.object_key,coalesce(g.title,''),coalesce(g.title_en,''),coalesce(g.alt_text,''),coalesce(g.alt_text_en,'')) ilike ${pattern})
    order by a.created_at desc
    limit 120`;
  return c.json({
    items: rows.map((row: any) => ({ ...withRelativeAssetUrl(row), source: row.gallery_item_id ? 'GALLERY' : 'MEDIA_LIBRARY' })),
    query: search,
  });
});

admin.post('/gallery/from-asset', requireRole('OWNER','ADMIN'), async (c) => {
  const input = z.object({ assetId: z.string().uuid() }).parse(await c.req.json());
  const sql = db(c.env);
  const assets = await sql`select id,object_key,file_name,content_type,size_bytes from uploaded_assets where id=${input.assetId}::uuid and content_type like 'image/%' limit 1`;
  if (!assets.length) return c.json({ error: 'IMAGE_ASSET_NOT_FOUND' }, 404);
  const existing = await sql`select id from gallery_items where asset_id=${input.assetId}::uuid limit 1`;
  if (existing.length) return c.json({ error: 'IMAGE_ALREADY_IN_GALLERY' }, 409);
  const asset = assets[0] as any;
  const actor = c.get('admin');
  const title = String(asset.file_name || '').replace(/\.[^.]+$/, '').slice(0, 160);
  const rows = await sql`insert into gallery_items(asset_id,media_type,title,caption,alt_text,display_order,is_published,created_by)
    values(${input.assetId}::uuid,'IMAGE',${title},'','',0,false,${actor.adminId}::uuid) returning *`;
  const item = { ...(rows[0] as any), object_key: asset.object_key, public_url: mediaUrlFromKey(String(asset.object_key)), file_name: asset.file_name, content_type: asset.content_type, size_bytes: asset.size_bytes };
  await sql`insert into audit_logs(admin_id,action,entity_type,entity_id,new_value,ip_address)
    values(${actor.adminId}::uuid,'CREATE_FROM_EXISTING_ASSET','GALLERY_ITEM',${String((rows[0] as any).id)},${JSON.stringify(item)}::jsonb,${c.req.header('CF-Connecting-IP') ?? null})`;
  return c.json({ item }, 201);
});

admin.get('/media/integrity', requireRole('OWNER','ADMIN'), async (c) => {
  const rows = await db(c.env)`select id,object_key,public_url,file_name,content_type,size_bytes,created_at from uploaded_assets order by created_at desc limit 1000`;
  const missing: any[] = [];
  const present: any[] = [];
  for (const row of rows as any[]) {
    const key = String(row.object_key || '');
    if (!key) { missing.push({ ...row, reason: 'MISSING_OBJECT_KEY' }); continue; }
    const object = await c.env.MEDIA.head(key);
    const item = { ...withRelativeAssetUrl(row), exists: Boolean(object) };
    if (object) present.push(item); else missing.push({ ...item, reason: 'NOT_FOUND_IN_BOUND_R2_BUCKET' });
  }
  return c.json({ checked: rows.length, present: present.length, missingCount: missing.length, missing });
});

admin.get('/reports/summary', async (c) => {
  const from=c.req.query('from')??'2000-01-01'; const to=c.req.query('to')??'2100-01-01'; const sql=db(c.env);
  const [byWorkshop,byMonth,refunds] = await Promise.all([
    sql`select w.title,w.starts_at,count(r.id)::int registrations,coalesce(sum(r.participant_count),0)::int participants,coalesce(sum(r.amount_paid_agorot),0)::int revenue_agorot from workshops w left join registrations r on r.workshop_id=w.id and r.status in ('PAID','CHECKED_IN','PARTIALLY_REFUNDED','REFUNDED') where w.starts_at between ${from}::timestamptz and ${to}::timestamptz group by w.id order by w.starts_at`,
    sql`select date_trunc('month',paid_at) month,coalesce(sum(amount_agorot),0)::int revenue_agorot,count(*)::int transactions from payments where status in ('SUCCEEDED','PARTIALLY_REFUNDED') and paid_at between ${from}::timestamptz and ${to}::timestamptz group by 1 order by 1`,
    sql`select coalesce(sum(amount_agorot) filter(where status='SUCCEEDED'),0)::int refunded_agorot,count(*) filter(where status='SUCCEEDED')::int refund_count from refunds where requested_at between ${from}::timestamptz and ${to}::timestamptz`,
  ]);
  return c.json({ byWorkshop,byMonth,refunds:refunds[0] });
});


admin.get('/users', requireRole('OWNER'), async (c) => {
  const users = await db(c.env)`select id,email,display_name,role,is_active,last_login_at,created_at from admins order by created_at`;
  return c.json({ users });
});

admin.post('/users', requireRole('OWNER'), async (c) => {
  const input = z.object({ email:z.string().email(), displayName:z.string().min(2), password:z.string().min(12), role:z.enum(['OWNER','ADMIN','INSTRUCTOR','VIEW_ONLY']) }).parse(await c.req.json());
  const passwordHash = await hashPassword(input.password);
  const row = await db(c.env)`insert into admins(email,password_hash,display_name,role) values(lower(${input.email}),${passwordHash},${input.displayName},${input.role}) returning id,email,display_name,role,is_active,created_at`;
  return c.json({ user: row[0] }, 201);
});

admin.patch('/users/:id', requireRole('OWNER'), async (c) => {
  const id=c.req.param('id');
  const input=z.object({ role:z.enum(['OWNER','ADMIN','INSTRUCTOR','VIEW_ONLY']).optional(), isActive:z.boolean().optional(), password:z.string().min(12).optional(), displayName:z.string().min(2).optional() }).parse(await c.req.json());
  const current=await db(c.env)`select * from admins where id=${id}::uuid`;
  if(!current.length) return c.json({error:'NOT_FOUND'},404);
  const row=current[0] as any;
  const passwordHash=input.password?await hashPassword(input.password):row.password_hash;
  const updated=await db(c.env)`update admins set role=${input.role??row.role},is_active=${input.isActive??row.is_active},password_hash=${passwordHash},display_name=${input.displayName??row.display_name},updated_at=now() where id=${id}::uuid returning id,email,display_name,role,is_active,last_login_at,created_at`;
  return c.json({user:updated[0]});
});

admin.get('/legal', async (c) => c.json({ documents: await db(c.env)`select * from legal_documents order by type,created_at desc` }));
admin.post('/legal', requireRole('OWNER','ADMIN'), async (c) => {
  const input=z.object({type:z.enum(['TERMS','PRIVACY','CANCELLATION','ACCESSIBILITY']),version:z.string().min(1),title:z.string().min(2),titleEn:z.string().default(''),content:z.string().min(10),contentEn:z.string().default(''),isActive:z.boolean().default(false)}).parse(await c.req.json());
  const sql=db(c.env);
  if(input.isActive) await sql`update legal_documents set is_active=false where type=${input.type}`;
  const row=await sql`insert into legal_documents(type,version,title,title_en,content,content_en,is_active,published_at,approved_at,approved_by,approval_note) values(${input.type},${input.version},${input.title},${input.titleEn || null},${input.content},${input.contentEn || null},false,null,null,null,'') returning *`;
  return c.json({document:row[0]},201);
});
admin.put('/legal/:id', requireRole('OWNER','ADMIN'), async (c) => {
  const id=c.req.param('id');
  const input=z.object({title:z.string().min(2),titleEn:z.string().default(''),content:z.string().min(10),contentEn:z.string().default(''),isActive:z.boolean()}).parse(await c.req.json());
  const sql=db(c.env);const current=await sql`select type from legal_documents where id=${id}::uuid`;
  if(!current.length)return c.json({error:'NOT_FOUND'},404);
  if(input.isActive) await sql`update legal_documents set is_active=false where type=${(current[0] as any).type}`;
  const row=await sql`update legal_documents set title=${input.title},title_en=${input.titleEn || null},content=${input.content},content_en=${input.contentEn || null},is_active=false,published_at=null,approved_at=null,approved_by=null,approval_note='' where id=${id}::uuid returning *`;
  return c.json({document:row[0]});
});

admin.post('/legal/:id/approve', requireRole('OWNER'), async (c) => {
  const id=c.req.param('id');
  const actor=c.get('admin');
  const input=z.object({ approvalNote:z.string().min(3).max(2000), confirmLegalReview:z.literal(true) }).parse(await c.req.json());
  if(!id||!actor)return c.json({error:'UNAUTHORIZED'},401);
  const sql=db(c.env);const current=await sql`select id,type,version,title,content from legal_documents where id=${id}::uuid`;
  if(!current.length)return c.json({error:'NOT_FOUND'},404);
  const doc=current[0] as any;
  if(String(doc.version).toUpperCase().includes('DRAFT')||String(doc.content).includes('השלימ')) return c.json({error:'DRAFT_DOCUMENT_CANNOT_BE_APPROVED'},409);
  await sql`update legal_documents set is_active=false where type=${doc.type}`;
  const rows=await sql`update legal_documents set is_active=true,published_at=now(),approved_at=now(),approved_by=${actor.adminId}::uuid,approval_note=${input.approvalNote} where id=${id}::uuid returning *`;
  await sql`insert into audit_logs(admin_id,action,entity_type,entity_id,new_value) values(${actor.adminId}::uuid,'APPROVE','LEGAL_DOCUMENT',${id},${JSON.stringify({type:doc.type,version:doc.version,note:input.approvalNote})}::jsonb)`;
  return c.json({document:rows[0]});
});

admin.get('/audit', requireRole('OWNER'), async (c) => c.json({ logs: await db(c.env)`select l.*,a.email admin_email from audit_logs l left join admins a on a.id=l.admin_id order by l.created_at desc limit 500` }));


admin.get('/series', async (c) => c.json({ series: await db(c.env)`select s.*,count(w.id)::int workshop_count from workshop_series s left join workshops w on w.series_id=s.id group by s.id order by s.created_at desc` }));

admin.post('/series', requireRole('OWNER','ADMIN'), async (c) => {
  const input=z.object({name:z.string().min(2),description:z.string().default(''),frequency:z.enum(['WEEKLY','BIWEEKLY','MONTHLY','CUSTOM']).default('CUSTOM')}).parse(await c.req.json());
  const actor=c.get('admin');
  const rows=await db(c.env)`insert into workshop_series(name,description,frequency,created_by) values(${input.name},${input.description},${input.frequency},${actor.adminId}::uuid) returning *`;
  return c.json({series:rows[0]},201);
});

admin.post('/series/:id/generate', requireRole('OWNER','ADMIN'), async (c) => {
  const seriesId=c.req.param('id');
  const input=z.object({templateWorkshopId:z.string().uuid(),occurrences:z.array(z.object({startsAt:z.string(),endsAt:z.string(),recurrenceLabel:z.string().default('')})).min(1).max(52)}).parse(await c.req.json());
  const sql=db(c.env);const source=(await sql`select * from workshops where id=${input.templateWorkshopId}::uuid`)[0] as any;
  if(!source)return c.json({error:'TEMPLATE_NOT_FOUND'},404);
  const created=[];
  for(const occurrence of input.occurrences){
    const code=`EZ${randomToken(5).slice(0,6).toUpperCase()}`;
    const slug=`${source.slug}-${new Date(occurrence.startsAt).toISOString().slice(0,10)}-${randomToken(2)}`.toLowerCase();
    const rows=await sql`insert into workshops(
      public_code,slug,title,title_en,short_description,short_description_en,full_description,full_description_en,image_url,gallery,
      location_name,location_name_en,location_address,location_address_en,map_url,starts_at,ends_at,capacity,min_participants,max_participants_per_order,
      price_agorot,early_bird_price_agorot,deposit_agorot,level,level_en,audience,audience_en,minimum_age,allow_waitlist,allow_coupons,allow_transfers,status,
      cancellation_policy_version,terms_version,privacy_version,created_by,series_id,recurrence_label,recurrence_label_en,max_registrations_per_phone,balance_due_days_before,is_private,required_pass_credits,accessibility_entrance,accessibility_elevator,accessibility_restroom,accessibility_parking,accessibility_passages,accessibility_passages_en,accessibility_notes,accessibility_notes_en,accessibility_verified_at,accessibility_source
    ) values(
      ${code},${slug},${source.title},${source.title_en},${source.short_description},${source.short_description_en},${source.full_description},${source.full_description_en},${source.image_url},${JSON.stringify(source.gallery)}::jsonb,
      ${source.location_name},${source.location_name_en},${source.location_address},${source.location_address_en},${source.map_url},${occurrence.startsAt}::timestamptz,${occurrence.endsAt}::timestamptz,${source.capacity},${source.min_participants},${source.max_participants_per_order},
      ${source.price_agorot},${source.early_bird_price_agorot},${source.deposit_agorot},${source.level},${source.level_en},${source.audience},${source.audience_en},${source.minimum_age},${source.allow_waitlist},${source.allow_coupons},${source.allow_transfers},'DRAFT',
      ${source.cancellation_policy_version},${source.terms_version},${source.privacy_version},${c.get('admin').adminId}::uuid,${seriesId}::uuid,${occurrence.recurrenceLabel},${source.recurrence_label_en},${source.max_registrations_per_phone},${source.balance_due_days_before},${source.is_private},${source.required_pass_credits},${source.accessibility_entrance},${source.accessibility_elevator},${source.accessibility_restroom},${source.accessibility_parking},${source.accessibility_passages},${source.accessibility_passages_en},${source.accessibility_notes},${source.accessibility_notes_en},${source.accessibility_verified_at}::timestamptz,${source.accessibility_source}
    ) returning *`;
    const workshop=rows[0] as any;created.push(workshop);
    await sql`insert into workshop_instructors(workshop_id,instructor_id,revenue_share_percent) select ${workshop.id}::uuid,instructor_id,revenue_share_percent from workshop_instructors where workshop_id=${source.id}::uuid`;
    await sql`insert into workshop_fields(workshop_id,field_key,field_type,label,label_en,help_text,help_text_en,required,options,options_en,display_order) select ${workshop.id}::uuid,field_key,field_type,label,label_en,help_text,help_text_en,required,options,options_en,display_order from workshop_fields where workshop_id=${source.id}::uuid`;
  }
  return c.json({workshops:created},201);
});

admin.get('/operations/requests', requireRole('OWNER','ADMIN'), async (c) => {
  const sql=db(c.env);const [cancellations,privacy,notifications,refunds]=await Promise.all([
    sql`select cr.*,r.registration_code,r.first_name,r.last_name,w.title,w.starts_at from cancellation_requests cr join registrations r on r.id=cr.registration_id join workshops w on w.id=r.workshop_id order by cr.created_at desc`,
    sql`select * from privacy_requests order by created_at desc`,
    sql`select j.id,j.channel,j.template_key,j.status,j.attempts,j.last_error,j.processed_at,j.created_at,r.registration_code,o.order_code
      from notification_jobs j left join registrations r on r.id=j.registration_id left join commerce_orders o on o.id=j.order_id
      where j.status in ('FAILED','CONFIGURATION_ERROR','SKIPPED') order by j.created_at desc limit 200`,
    sql`select f.*,r.registration_code,p.provider,p.provider_session_id from refunds f join registrations r on r.id=f.registration_id left join payments p on p.id=f.payment_id order by f.requested_at desc limit 200`,
  ]);return c.json({cancellations,privacy,notifications,refunds});
});

admin.patch('/operations/cancellations/:id', requireRole('OWNER','ADMIN'), async (c) => {
  const input=z.object({status:z.enum(['OPEN','APPROVED','REJECTED','COMPLETED']),adminNotes:z.string().max(3000).default('')}).parse(await c.req.json());
  const sql=db(c.env);
  const requests=await sql`select * from cancellation_requests where id=${c.req.param('id')}::uuid`;
  const request=requests[0] as any;if(!request)return c.json({error:'NOT_FOUND'},404);
  if(input.status==='APPROVED'){
    try{
      const result=await cancelRegistration(c.env,String(request.registration_id),request.reason,c.get('admin').adminId);
      const completed=['CANCELLED','REFUNDED'].includes(String(result.cancellation.finalStatus));
      const nextStatus=completed?'COMPLETED':'APPROVED';
      const note=completed?input.adminNotes:`${input.adminNotes} — ההחזר עדיין דורש השלמה או אימות מול ספק הסליקה`;
      const rows=await sql`update cancellation_requests set status=${nextStatus},admin_notes=${note},resolved_at=case when ${completed} then now() else null end where id=${request.id}::uuid returning *`;
      return c.json({request:rows[0],result});
    }catch(error){return c.json({error:error instanceof Error?error.message:'CANCELLATION_FAILED'},409);}
  }
  const rows=await sql`update cancellation_requests set status=${input.status},admin_notes=${input.adminNotes},resolved_at=case when ${input.status} in ('REJECTED','COMPLETED') then now() else null end where id=${request.id}::uuid returning *`;
  return c.json({request:rows[0]});
});

admin.post('/operations/notifications/:id/retry', requireRole('OWNER','ADMIN'), async (c) => {
  const rows=await db(c.env)`update notification_jobs set status='PENDING',attempts=0,last_error=null,provider_response='{}'::jsonb,scheduled_at=now(),processed_at=null where id=${c.req.param('id')}::uuid returning id`;
  if(!rows.length)return c.json({error:'NOT_FOUND'},404);return c.json({ok:true});
});

admin.get('/production-readiness', requireRole('OWNER'), async (c) => {
  const sql=db(c.env);
  const activeProviderEnvironment=c.env.PAYMENT_PROVIDER==='mock'?'mock':c.env.PAYMENT_PROVIDER==='payme'&&String(c.env.PAYME_API_BASE??'').toLowerCase().includes('sandbox')?'sandbox':'production';
  const [settings,legal,paymeChecks]=await Promise.all([
    sql`select * from business_settings where singleton=true`,
    sql`select type,version,title,content,approved_at,approved_by,approval_note from legal_documents where is_active=true`,
    sql`select
      count(distinct p.id) filter(where p.provider='payme' and p.provider_environment=${activeProviderEnvironment} and p.status in ('SUCCEEDED','PARTIALLY_REFUNDED','REFUNDED'))::int successful_payments,
      count(distinct f.id) filter(where p.provider='payme' and p.provider_environment=${activeProviderEnvironment} and f.provider_environment=${activeProviderEnvironment} and f.status='SUCCEEDED')::int successful_refunds
      from payments p left join refunds f on f.payment_id=p.id`,
  ]);
  const business=(settings[0]??{}) as any;const docs=legal as any[];const providerChecks=(paymeChecks[0]??{}) as any;
  const blockers:string[]=[];const warnings:string[]=[];
  if(!business.legal_business_name||!business.business_number||!business.contact_email||!business.contact_phone) blockers.push('BUSINESS_DETAILS_INCOMPLETE');
  for(const type of ['TERMS','PRIVACY','CANCELLATION','ACCESSIBILITY']){
    const doc=docs.find((d:any)=>d.type===type);
    const incompleteTemplate=type!=='ACCESSIBILITY'&&String(doc?.content??'').includes('השלימ');
    if(!doc||!doc.approved_at||String(doc.version).includes('DRAFT')||incompleteTemplate) blockers.push(`LEGAL_${type}_NOT_APPROVED`);
  }
  if(!business.accessibility_contact_name||!business.accessibility_email||!business.accessibility_phone||!business.mailing_address) blockers.push('ACCESSIBILITY_CONTACT_DETAILS_INCOMPLETE');
  if(!business.accessibility_known_limitations) blockers.push('ACCESSIBILITY_LIMITATIONS_NOT_REVIEWED');
  if(!business.mailing_address_en||!business.accessibility_known_limitations_en) warnings.push('ACCESSIBILITY_ENGLISH_DETAILS_INCOMPLETE');
  if(c.env.PAYMENT_PROVIDER==='payme'){
    if(!c.env.PAYME_SELLER_ID||!c.env.PAYME_CLIENT_KEY||!c.env.PAYME_CALLBACK_SECRET) blockers.push('PAYME_CONFIGURATION_INCOMPLETE');
    if(String(c.env.PAYME_API_BASE??'').toLowerCase().includes('sandbox')) blockers.push('PAYME_SANDBOX_MODE_ACTIVE');
    if(Number(providerChecks.successful_payments)<1) blockers.push('PAYME_PAYMENT_FLOW_NOT_VERIFIED');
    if(Number(providerChecks.successful_refunds)<1) blockers.push('PAYME_REFUND_FLOW_NOT_VERIFIED');
  }
  if(!c.env.RESEND_API_KEY||!c.env.EMAIL_FROM) blockers.push('EMAIL_CONFIGURATION_INCOMPLETE');
  if(!c.env.PUBLIC_RATE_LIMITER||!c.env.AUTH_RATE_LIMITER) blockers.push('CLOUDFLARE_RATE_LIMIT_BINDINGS_MISSING');
  if(!c.env.TURNSTILE_SECRET_KEY||!c.env.TURNSTILE_SITE_KEY) blockers.push('TURNSTILE_NOT_CONFIGURED');
  if(String(c.env.ADMIN_EMAIL_OTP_REQUIRED??'true').toLowerCase()==='false') blockers.push('ADMIN_MFA_DISABLED');
  if(!c.env.INVOICE_WEBHOOK_URL) warnings.push('INVOICE_PROVIDER_NOT_CONFIGURED');
  if(String(c.env.WHATSAPP_ENABLED??'false').toLowerCase()==='true'&&!c.env.WHATSAPP_WEBHOOK_URL) warnings.push('WHATSAPP_PROVIDER_NOT_CONFIGURED');
  return c.json({ready:blockers.length===0,blockers,warnings,checks:{paymentProvider:c.env.PAYMENT_PROVIDER,refundPath:c.env.PAYME_REFUND_PATH??'refund-sale',activeLegalDocuments:docs.map((d:any)=>({type:d.type,version:d.version,approvedAt:d.approved_at})),paymeVerification:{environment:activeProviderEnvironment,successfulPayments:Number(providerChecks.successful_payments||0),successfulRefunds:Number(providerChecks.successful_refunds||0),sandbox:String(c.env.PAYME_API_BASE??'').toLowerCase().includes('sandbox')}}});
});

admin.patch('/operations/privacy/:id', requireRole('OWNER'), async (c) => {
  const input=z.object({status:z.enum(['OPEN','IN_PROGRESS','COMPLETED','REJECTED']),adminNotes:z.string().max(3000).default(''),anonymize:z.boolean().default(false)}).parse(await c.req.json());
  const sql=db(c.env);const requests=await sql`select * from privacy_requests where id=${c.req.param('id')}::uuid`;const req=requests[0] as any;
  if(!req)return c.json({error:'NOT_FOUND'},404);
  if(input.anonymize){
    const marker=`deleted-${String(req.id).slice(0,8)}@example.invalid`;
    await sql`update registration_participants p set first_name='Deleted',last_name='User',experience_level='',partner_name='',metadata='{}'::jsonb from registrations r where p.registration_id=r.id and lower(r.email)=lower(${req.email})`;
    await sql`update registrations set first_name='Deleted',last_name='User',email=${marker},phone='',phone_normalized='',notes='',guardian='{}'::jsonb,custom_answers='{}'::jsonb,marketing_consent=false,marketing_consent_at=null where lower(email)=lower(${req.email})`;
    await sql`delete from waitlist_entries where lower(email)=lower(${req.email})`;
    await sql`update passes set email=${marker},full_name='Deleted User' where lower(email)=lower(${req.email})`;
    await sql`update memberships set email=${marker},full_name='Deleted User',phone='' where lower(email)=lower(${req.email})`;
    await sql`update commerce_orders set email=${marker},full_name='Deleted User',phone='',metadata=metadata-'personalData' where lower(email)=lower(${req.email})`;
  }
  const rows=await sql`update privacy_requests set status=${input.status},admin_notes=${input.adminNotes},completed_at=case when ${input.status}='COMPLETED' then now() else null end where id=${req.id}::uuid returning *`;
  return c.json({request:rows[0]});
});

admin.get('/exports/registrations.csv', async (c) => {
  const rows=await db(c.env)`select r.registration_code,w.title,w.starts_at,r.status,r.first_name,r.last_name,r.email,r.phone,r.participant_count,r.total_amount_agorot,r.amount_paid_agorot,r.created_at from registrations r join workshops w on w.id=r.workshop_id order by w.starts_at,r.created_at` as any[];
  const quote=(v:unknown)=>`"${String(v??'').replaceAll('"','""')}"`;
  const columns=['registration_code','title','starts_at','status','first_name','last_name','email','phone','participant_count','total_amount_agorot','amount_paid_agorot','created_at'];
  const csv='\uFEFF'+columns.join(',')+'\n'+rows.map(r=>columns.map(k=>quote(r[k])).join(',')).join('\n');
  return new Response(csv,{headers:{'content-type':'text/csv; charset=utf-8','content-disposition':'attachment; filename="eden-registrations.csv"'}});
});

admin.get('/reports/instructor-revenue', async (c) => {
  const rows=await db(c.env)`select i.name,w.title,w.starts_at,wi.revenue_share_percent,coalesce(sum(r.amount_paid_agorot),0)::int gross_agorot,round(coalesce(sum(r.amount_paid_agorot),0)*wi.revenue_share_percent/100)::int instructor_share_agorot
    from workshop_instructors wi join instructors i on i.id=wi.instructor_id join workshops w on w.id=wi.workshop_id left join registrations r on r.workshop_id=w.id and r.status in ('DEPOSIT_PAID','PAID','CHECKED_IN','PARTIALLY_REFUNDED') group by i.id,w.id,wi.revenue_share_percent order by w.starts_at desc`;
  return c.json({rows});
});

export default admin;
