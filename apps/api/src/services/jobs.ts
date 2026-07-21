import { db } from '../lib/db';
import { randomToken } from '../lib/crypto';
import type { Env } from '../types';
import { callSignedWebhook, sendEmail, type DeliveryResult } from './notifications';

function formatDate(value: string) {
  return new Intl.DateTimeFormat('he-IL', { dateStyle: 'full', timeStyle: 'short', timeZone: 'Asia/Jerusalem' }).format(new Date(value));
}

function escapeHtml(value: unknown) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function moneyFromAgorot(value: unknown) {
  return new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS' }).format(Number(value || 0) / 100);
}

function emailButton(label: string, href: string) {
  return `<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:26px auto 8px"><tr><td style="border-radius:999px;background:#1C1417"><a href="${escapeHtml(href)}" style="display:inline-block;padding:14px 28px;color:#fff;text-decoration:none;font-family:Arial,sans-serif;font-size:15px;font-weight:700;border-radius:999px">${escapeHtml(label)}</a></td></tr></table>`;
}

function emailDetails(rows: Array<[string, unknown]>) {
  const content = rows.filter(([, value]) => String(value ?? '').trim()).map(([label, value]) => `<tr><td style="padding:10px 0;color:#8A737A;font-size:13px;vertical-align:top;width:34%">${escapeHtml(label)}</td><td style="padding:10px 0;color:#1C1417;font-size:15px;font-weight:700;vertical-align:top">${escapeHtml(value)}</td></tr>`).join('');
  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:20px 0;border-top:1px solid #E7D3D3;border-bottom:1px solid #E7D3D3">${content}</table>`;
}

function emailShell(input: { eyebrow: string; title: string; intro?: string; body: string; appUrl: string }) {
  return `<!doctype html><html dir="rtl" lang="he"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;padding:0;background:#F7EEE9;color:#1C1417;font-family:Arial,'Helvetica Neue',sans-serif"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#F7EEE9;padding:24px 12px"><tr><td align="center"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:620px;background:#fff;border-radius:24px;overflow:hidden;box-shadow:0 20px 55px rgba(28,20,23,.12)"><tr><td style="background:#150F13;padding:28px 34px;text-align:right"><div style="display:inline-block;border:1px dashed #F2A93B;border-radius:999px;padding:9px 12px;color:#F2A93B;font-size:12px;font-weight:700;letter-spacing:1px">EZ</div><div style="margin-top:16px;color:#fff;font-size:18px;font-weight:800;letter-spacing:.5px">EDEN ZINO DANCE</div><div style="margin-top:5px;color:#D8C7CC;font-size:12px">DANCE WORKSHOPS · MOVE · FEEL · GROW</div></td></tr><tr><td style="padding:34px"><div style="color:#E23E57;font-size:11px;font-weight:800;letter-spacing:2px;text-transform:uppercase">${escapeHtml(input.eyebrow)}</div><h1 style="margin:10px 0 14px;font-size:30px;line-height:1.18;color:#1C1417">${escapeHtml(input.title)}</h1>${input.intro ? `<p style="margin:0 0 20px;color:#6F5A61;font-size:16px;line-height:1.75">${escapeHtml(input.intro)}</p>` : ''}${input.body}<p style="margin:30px 0 0;color:#8A737A;font-size:12px;line-height:1.7;text-align:center">נתראה על הרחבה ✨<br><b style="color:#1C1417">Eden Zino Dance</b></p></td></tr><tr><td style="padding:18px 28px;background:#FBF5F2;text-align:center;color:#8A737A;font-size:11px;line-height:1.6">הודעה זו נשלחה בעקבות פעולה שבוצעה באתר Eden Zino Dance.<br><a href="${escapeHtml(input.appUrl)}" style="color:#E23E57;text-decoration:none;font-weight:700">מעבר לאתר</a></td></tr></table></td></tr></table></body></html>`;
}

function emailContent(job: any, appUrl: string): { subject: string; html: string; text?: string } {
  const name = String(job.first_name || '').trim();
  const greeting = name ? `היי ${name},` : 'היי,';
  const workshopDetails = emailDetails([
    ['סדנה', job.title],
    ['מועד', job.starts_at ? formatDate(job.starts_at) : ''],
    ['מיקום', [job.location_name, job.location_address].filter(Boolean).join(' · ')],
    ['קוד הרשמה', job.registration_code],
  ]);

  if (job.template_key === 'WORKSHOP_REMINDER') return {
    subject: `מחר רוקדים ✨ ${job.title}`,
    html: emailShell({ eyebrow: 'WORKSHOP REMINDER', title: 'נתראה מחר על הרחבה', intro: `${greeting} תזכורת קטנה לקראת הסדנה שלך.`, body: `${workshopDetails}<p style="color:#6F5A61;line-height:1.75">מומלץ להגיע כמה דקות לפני תחילת הסדנה ולהביא בקבוק מים.</p>`, appUrl }),
  };
  if (job.template_key === 'BALANCE_REMINDER') return {
    subject: `יתרת תשלום לסדנה: ${job.title}`,
    html: emailShell({ eyebrow: 'PAYMENT', title: 'נותרה יתרה לתשלום', intro: `${greeting} המקום שלך בסדנה שמור לאחר תשלום המקדמה.`, body: `${workshopDetails}${emailButton('כניסה לאזור האישי', `${appUrl}/portal`)}`, appUrl }),
  };
  if (job.template_key === 'PRODUCT_PURCHASE_CONFIRMED') {
    const code = job.payload?.issuedCode ?? job.order_metadata?.issuedCode ?? '';
    return { subject: 'הרכישה הושלמה — Eden Zino Dance', html: emailShell({ eyebrow: 'PURCHASE CONFIRMED', title: 'הרכישה שלך אושרה', intro: `${greeting} איזה כיף! הרכישה הושלמה בהצלחה.`, body: `${emailDetails([['קוד שימוש אישי', code], ['מספר הזמנה', job.order_code]])}<div style="padding:18px;border-radius:16px;background:#F7EEE9;text-align:center"><div style="font-size:12px;color:#8A737A">הקוד האישי שלך</div><div style="margin-top:8px;font-size:25px;font-weight:900;letter-spacing:2px;color:#1C1417">${escapeHtml(code)}</div></div>`, appUrl }) };
  }
  if (job.template_key === 'REGISTRATION_CANCELLATION_PENDING') return {
    subject: `בקשת הביטול נקלטה: ${job.title}`,
    html: emailShell({ eyebrow: 'CANCELLATION', title: 'בקשת הביטול נקלטה', intro: `${greeting} המקום שלך שוחרר ובקשת ההחזר נמצאת בטיפול.`, body: `${workshopDetails}${emailDetails([['סכום החזר בטיפול', moneyFromAgorot(job.payload?.refundAgorot)]])}`, appUrl }),
  };
  if (job.template_key === 'REGISTRATION_CANCELLED') return {
    subject: `ביטול הרשמה: ${job.title}`,
    html: emailShell({ eyebrow: 'CANCELLED', title: 'ההרשמה בוטלה', intro: `${greeting} הרשמתך לסדנה בוטלה.`, body: `${workshopDetails}${job.payload?.reason ? `<p style="color:#6F5A61;line-height:1.7"><b>סיבה:</b> ${escapeHtml(job.payload.reason)}</p>` : ''}`, appUrl }),
  };
  if (job.template_key === 'REFUND_CONFIRMED') return {
    subject: `החזר כספי אושר: ${job.title}`,
    html: emailShell({ eyebrow: 'REFUND CONFIRMED', title: 'ההחזר הושלם', intro: `${greeting} ההחזר הכספי בוצע בהצלחה.`, body: `${workshopDetails}${emailDetails([['סכום שהוחזר', moneyFromAgorot(job.payload?.amountAgorot)]])}`, appUrl }),
  };
  if (job.template_key === 'REGISTRATION_TRANSFERRED') return {
    subject: 'ההרשמה הועברה לסדנה אחרת',
    html: emailShell({ eyebrow: 'TRANSFER CONFIRMED', title: 'ההעברה הושלמה', intro: `${greeting} ההרשמה שלך עודכנה לסדנה החדשה.`, body: workshopDetails, appUrl }),
  };
  if (job.template_key === 'WAITLIST_INVITE') {
    const token = encodeURIComponent(String(job.payload?.inviteToken ?? ''));
    return { subject: `התפנה מקום 🎉 ${job.title}`, html: emailShell({ eyebrow: 'A SPOT OPENED', title: 'התפנה עבורך מקום', intro: `${greeting} יש לנו חדשות טובות — התפנה מקום בסדנה שרצית.`, body: `${workshopDetails}${emailButton('שמירת המקום והמשך לתשלום', `${appUrl}/waitlist/${token}`)}<p style="color:#8A737A;font-size:13px;text-align:center">הקישור זמני. לאחר פקיעתו המקום יוצע לבא/ה בתור.</p>`, appUrl }) };
  }
  return {
    subject: `ההרשמה אושרה ✨ ${job.title}`,
    html: emailShell({ eyebrow: 'REGISTRATION CONFIRMED', title: 'איזה כיף, המקום שלך שמור!', intro: `${greeting} ההרשמה שלך הושלמה בהצלחה. הנה כל מה שצריך לדעת לקראת הסדנה.`, body: `${workshopDetails}<div style="margin-top:22px;padding:18px 20px;border-radius:16px;background:#FFF7E9;border:1px solid #F4D7A2;color:#5D4521;line-height:1.7"><b>מומלץ לשמור את המייל הזה.</b><br>קוד ההרשמה ישמש לזיהוי ההזמנה במקרה הצורך.</div>${emailButton('צפייה בסדנאות', `${appUrl}/workshops`)}`, appUrl }),
    text: `${greeting} ההרשמה שלך לסדנה ${job.title} אושרה. מועד: ${job.starts_at ? formatDate(job.starts_at) : ''}. מיקום: ${job.location_name ?? ''} ${job.location_address ?? ''}. קוד הרשמה: ${job.registration_code ?? ''}`,
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
        if (String(env.WHATSAPP_ENABLED ?? 'false').toLowerCase() !== 'true') {
          result = { outcome: 'SKIPPED', providerResponse: { reason: 'WHATSAPP_DISABLED' } };
        } else {
          result = await callSignedWebhook(env.WHATSAPP_WEBHOOK_URL, env.WHATSAPP_WEBHOOK_SECRET, { event: job.template_key, ...details, payload: job.payload });
        }
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
