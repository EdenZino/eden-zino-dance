import { db } from '../lib/db';
import { randomToken } from '../lib/crypto';
import type { Env } from '../types';
import { callSignedWebhook, sendEmail, type DeliveryResult } from './notifications';

function formatDate(value: string) {
  return new Intl.DateTimeFormat('he-IL', { dateStyle: 'full', timeStyle: 'short', timeZone: 'Asia/Jerusalem' }).format(new Date(value));
}

function emailContent(job: any, appUrl: string): { subject: string; html: string } {
  const name = job.first_name || 'שלום';
  if (job.template_key === 'WORKSHOP_REMINDER') return {
    subject: `תזכורת לסדנה: ${job.title}`,
    html: `<div dir="rtl"><h2>נתראה מחר</h2><p>${name}, הסדנה <b>${job.title}</b> מתקיימת ב-${formatDate(job.starts_at)}.</p><p>${job.location_name ?? ''}<br>${job.location_address ?? ''}</p><p>קוד הרשמה: <b>${job.registration_code}</b></p></div>`,
  };
  if (job.template_key === 'BALANCE_REMINDER') return {
    subject: `יתרת תשלום לסדנה: ${job.title}`,
    html: `<div dir="rtl"><h2>נותרה יתרה לתשלום</h2><p>ההרשמה לסדנה <b>${job.title}</b> שמורה לאחר תשלום מקדמה.</p><p>לתשלום היתרה היכנסי לאזור האישי המאובטח.</p></div>`,
  };
  if (job.template_key === 'PRODUCT_PURCHASE_CONFIRMED') return {
    subject: 'הרכישה הושלמה',
    html: `<div dir="rtl"><h2>הרכישה שלך אושרה</h2><p>קוד השימוש האישי שלך:</p><p style="font-size:24px"><b>${job.payload?.issuedCode ?? job.order_metadata?.issuedCode ?? ''}</b></p><p>מספר הזמנה: ${job.order_code}</p></div>`,
  };
  if (job.template_key === 'REGISTRATION_CANCELLATION_PENDING') return {
    subject: `בקשת הביטול נקלטה: ${job.title}`,
    html: `<div dir="rtl"><h2>ההרשמה בוטלה והמקום שוחרר</h2><p>בקשת הביטול עבור <b>${job.title}</b> נקלטה.</p><p>החזר כספי בסך ${(Number(job.payload?.refundAgorot || 0) / 100).toFixed(2)} ₪ נמצא בטיפול. הודעה נוספת תישלח לאחר אישור ההחזר.</p></div>`,
  };
  if (job.template_key === 'REGISTRATION_CANCELLED') return {
    subject: `ביטול הרשמה: ${job.title}`,
    html: `<div dir="rtl"><h2>ההרשמה בוטלה</h2><p>הרשמתך לסדנה <b>${job.title}</b> בוטלה.</p><p>${job.payload?.reason ? `סיבה: ${job.payload.reason}` : ''}</p></div>`,
  };
  if (job.template_key === 'REFUND_CONFIRMED') return {
    subject: `החזר כספי אושר: ${job.title}`,
    html: `<div dir="rtl"><h2>ההחזר הושלם</h2><p>בוצע החזר בסך ${(Number(job.payload?.amountAgorot || 0) / 100).toFixed(2)} ₪ עבור <b>${job.title}</b>.</p></div>`,
  };
  if (job.template_key === 'REGISTRATION_TRANSFERRED') return {
    subject: 'ההרשמה הועברה לסדנה אחרת',
    html: `<div dir="rtl"><h2>ההעברה הושלמה</h2><p>הרשמתך הועברה ל<b>${job.title}</b>, בתאריך ${formatDate(job.starts_at)}.</p></div>`,
  };
  if (job.template_key === 'WAITLIST_INVITE') {
    const token = encodeURIComponent(String(job.payload?.inviteToken ?? ''));
    return {
      subject: `התפנה מקום: ${job.title}`,
      html: `<div dir="rtl"><h2>התפנה עבורך מקום</h2><p>${name}, ניתן להשלים הרשמה לסדנה <b>${job.title}</b>.</p><p><a href="${appUrl}/waitlist/${token}">לשמירת המקום והתשלום</a></p><p>הקישור זמני; לאחר פקיעתו המקום יוצע לבא/ה בתור.</p></div>`,
    };
  }
  return {
    subject: `ההרשמה אושרה: ${job.title}`,
    html: `<div dir="rtl"><h2>ההרשמה שלך אושרה</h2><p>${name}, הסדנה <b>${job.title}</b> מתקיימת ב-${formatDate(job.starts_at)}.</p><p>${job.location_name ?? ''}<br>${job.location_address ?? ''}</p><p>קוד הרשמה: <b>${job.registration_code}</b></p></div>`,
  };
}

async function recordDelivery(sql: ReturnType<typeof db>, job: any, result: DeliveryResult) {
  const status = result.outcome;
  await sql`update notification_jobs set status=${status},provider_response=${JSON.stringify(result.providerResponse)}::jsonb,
    last_error=${result.error ?? null},sent_at=case when ${status}='SENT' then now() else sent_at end,processed_at=now()
    where id=${job.id}::uuid`;
}

export async function runMaintenance(env: Env) {
  const sql = db(env);
  await sql`select expire_registration_holds()`;
  await sql`select expire_security_tokens()`;
  await sql`select apply_data_retention()`;
  await sql`update passes set status='EXPIRED' where status='ACTIVE' and expires_at<=now()`;
  await sql`update memberships set status='EXPIRED' where status='ACTIVE' and current_period_end<=now()`;
  await sql`update waitlist_entries set status='EXPIRED' where status='INVITED' and invite_expires_at<=now()`;
  const waitlistWorkshops = await sql`select distinct workshop_id from waitlist_entries where status='WAITING'`;
  for (const row of waitlistWorkshops as any[]) {
    for (let index=0; index<20; index+=1) {
      const invited = await sql`select * from invite_next_waitlist(${String(row.workshop_id)}::uuid,${randomToken(32)},24)`;
      if (!invited.length) break;
    }
  }

  await sql`insert into notification_jobs(registration_id,channel,template_key,payload,scheduled_at)
    select r.id,'EMAIL','WORKSHOP_REMINDER',jsonb_build_object('registrationId',r.id),w.starts_at-interval '24 hours'
    from registrations r join workshops w on w.id=r.workshop_id
    where r.status in ('DEPOSIT_PAID','PAID','PARTIALLY_REFUNDED') and w.starts_at between now()+interval '23 hours' and now()+interval '25 hours'
      and not exists(select 1 from notification_jobs j where j.registration_id=r.id and j.template_key='WORKSHOP_REMINDER')`;

  await sql`insert into notification_jobs(registration_id,channel,template_key,payload,scheduled_at)
    select r.id,'EMAIL','BALANCE_REMINDER',jsonb_build_object('registrationId',r.id),coalesce(r.balance_due_at,now())
    from registrations r where r.status='DEPOSIT_PAID' and r.total_amount_agorot>r.amount_paid_agorot
      and r.balance_due_at between now()-interval '1 hour' and now()+interval '1 hour'
      and not exists(select 1 from notification_jobs j where j.registration_id=r.id and j.template_key='BALANCE_REMINDER')`;

  const jobs = await sql`select j.*,
    coalesce(r.email,o.email,we.email) email,coalesce(r.phone,o.phone,we.phone) phone,
    coalesce(r.first_name,split_part(o.full_name,' ',1),we.first_name) first_name,
    coalesce(r.last_name,we.last_name) last_name,r.registration_code,r.amount_paid_agorot,r.total_amount_agorot,
    coalesce(w.title,ww.title) title,coalesce(w.starts_at,ww.starts_at) starts_at,
    coalesce(w.location_name,ww.location_name) location_name,coalesce(w.location_address,ww.location_address) location_address,
    o.order_code,o.order_type,o.metadata order_metadata
    from notification_jobs j
    left join registrations r on r.id=j.registration_id left join workshops w on w.id=r.workshop_id
    left join commerce_orders o on o.id=j.order_id
    left join waitlist_entries we on we.id=j.waitlist_entry_id left join workshops ww on ww.id=we.workshop_id
    where j.status='PENDING' and j.scheduled_at<=now() order by j.scheduled_at limit 30`;

  const appUrl = env.PUBLIC_APP_URL.replace(/\/$/, '');
  for (const job of jobs as any[]) {
    try {
      const claimed = await sql`update notification_jobs set status='PROCESSING',attempts=attempts+1 where id=${job.id}::uuid and status='PENDING' returning id`;
      if (!claimed.length) continue;
      const details = { registrationCode: job.registration_code, orderCode: job.order_code, name: `${job.first_name ?? ''} ${job.last_name ?? ''}`.trim(), email: job.email, phone: job.phone, workshop: job.title, startsAt: job.starts_at, location: `${job.location_name ?? ''} ${job.location_address ?? ''}`.trim(), amountPaidAgorot: job.amount_paid_agorot, issuedCode: job.payload?.issuedCode ?? job.order_metadata?.issuedCode };
      let result: DeliveryResult;
      if (job.channel === 'EMAIL') {
        const content = emailContent(job, appUrl);
        result = await sendEmail(env, { to: job.email, ...content });
      } else if (job.channel === 'WHATSAPP') {
        result = await callSignedWebhook(env.WHATSAPP_WEBHOOK_URL, env.WHATSAPP_WEBHOOK_SECRET, { event: job.template_key, ...details, payload: job.payload });
      } else {
        result = await callSignedWebhook(env.INVOICE_WEBHOOK_URL, env.INVOICE_WEBHOOK_SECRET, { event: job.template_key, ...details, payload: job.payload });
      }
      await recordDelivery(sql, job, result);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      await sql`update notification_jobs set status=case when attempts>=5 then 'FAILED' else 'PENDING' end,last_error=${message},processed_at=now(),scheduled_at=now()+interval '15 minutes' where id=${job.id}::uuid`;
    }
  }
}
