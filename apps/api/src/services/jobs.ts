import { db } from '../lib/db';
import { randomToken } from '../lib/crypto';
import type { Env } from '../types';
import { callSignedWebhook, sendEmail, brandedEmail, type DeliveryResult, type EmailLanguage } from './notifications';

function languageOf(job: any): EmailLanguage { return job.preferred_language === 'en' ? 'en' : 'he'; }
function formatDate(value: string, language: EmailLanguage) {
  return new Intl.DateTimeFormat(language === 'en' ? 'en-US' : 'he-IL', { dateStyle: 'full', timeStyle: 'short', timeZone: 'Asia/Jerusalem' }).format(new Date(value));
}
function escapeHtml(value: unknown) {
  return String(value ?? '').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;');
}
function moneyFromAgorot(value: unknown, language: EmailLanguage) {
  return new Intl.NumberFormat(language === 'en' ? 'en-US' : 'he-IL', { style:'currency', currency:'ILS' }).format(Number(value || 0) / 100);
}
function emailButton(label: string, href: string) {
  return `<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:26px auto 8px"><tr><td style="border-radius:999px;background:#1C1417"><a href="${escapeHtml(href)}" style="display:inline-block;padding:14px 28px;color:#fff;text-decoration:none;font-family:Arial,sans-serif;font-size:15px;font-weight:700;border-radius:999px">${escapeHtml(label)}</a></td></tr></table>`;
}
function emailDetails(rows: Array<[string, unknown]>) {
  const content = rows.filter(([,value]) => String(value ?? '').trim()).map(([label,value]) => `<tr><td style="padding:10px 0;color:#8A737A;font-size:13px;vertical-align:top;width:34%">${escapeHtml(label)}</td><td style="padding:10px 0;color:#1C1417;font-size:15px;font-weight:700;vertical-align:top">${escapeHtml(value)}</td></tr>`).join('');
  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:20px 0;border-top:1px solid #E7D3D3;border-bottom:1px solid #E7D3D3">${content}</table>`;
}
function localizedWorkshop(job: any, language: EmailLanguage) {
  return {
    title: language === 'en' && job.title_en ? job.title_en : job.title,
    locationName: language === 'en' && job.location_name_en ? job.location_name_en : job.location_name,
    locationAddress: language === 'en' && job.location_address_en ? job.location_address_en : job.location_address,
  };
}

function emailContent(job: any, appUrl: string): { subject:string; html:string; text?:string } {
  const language = languageOf(job);
  const en = language === 'en';
  const workshop = localizedWorkshop(job, language);
  const name = String(job.first_name || '').trim();
  const greeting = en ? (name ? `Hi ${name},` : 'Hi,') : (name ? `היי ${name},` : 'היי,');
  const details = emailDetails(en ? [
    ['Workshop', workshop.title], ['Date', job.starts_at ? formatDate(job.starts_at, language) : ''], ['Location', [workshop.locationName,workshop.locationAddress].filter(Boolean).join(' · ')], ['Registration code', job.registration_code],
  ] : [
    ['סדנה', workshop.title], ['מועד', job.starts_at ? formatDate(job.starts_at, language) : ''], ['מיקום', [workshop.locationName,workshop.locationAddress].filter(Boolean).join(' · ')], ['קוד הרשמה', job.registration_code],
  ]);
  const shell = (x: Parameters<typeof brandedEmail>[0]) => brandedEmail(x);

  if (job.template_key === 'WORKSHOP_REMINDER') {
    const e = shell({language,eyebrow:'WORKSHOP REMINDER',title:en?'See you on the dance floor tomorrow':'נתראה מחר על הרחבה',intro:en?`${greeting} A quick reminder before your workshop.`:`${greeting} תזכורת קטנה לקראת הסדנה שלך.`,body:`${details}<p style="color:#6F5A61;line-height:1.75">${en?'We recommend arriving a few minutes early and bringing a bottle of water.':'מומלץ להגיע כמה דקות לפני תחילת הסדנה ולהביא בקבוק מים.'}</p>`,appUrl});
    return {subject:en?`Tomorrow we dance ✨ ${workshop.title}`:`מחר רוקדים ✨ ${workshop.title}`,...e};
  }
  if (job.template_key === 'BALANCE_REMINDER') {
    const e=shell({language,eyebrow:'PAYMENT',title:en?'A payment balance remains':'נותרה יתרה לתשלום',intro:en?`${greeting} Your spot is reserved after the deposit.`:`${greeting} המקום שלך בסדנה שמור לאחר תשלום המקדמה.`,body:`${details}${emailButton(en?'Open my personal area':'כניסה לאזור האישי',`${appUrl}/my-registration`)}`,appUrl});
    return {subject:en?`Payment balance: ${workshop.title}`:`יתרת תשלום לסדנה: ${workshop.title}`,...e};
  }
  if (job.template_key === 'DEPOSIT_CONFIRMED') {
    const remaining = Math.max(0, Number(job.total_amount_agorot || 0) - Number(job.amount_paid_agorot || 0));
    const e=shell({language,eyebrow:'DEPOSIT CONFIRMED',title:en?'Your deposit was received':'המקדמה התקבלה',intro:en?`${greeting} Your spot is reserved. A balance remains before the workshop.`:`${greeting} המקום שלך שמור. נותרה יתרה לתשלום לפני הסדנה.`,body:`${details}${emailDetails([[en?'Paid':'שולם',moneyFromAgorot(job.amount_paid_agorot,language)],[en?'Remaining balance':'יתרה לתשלום',moneyFromAgorot(remaining,language)]])}${emailButton(en?'Open my personal area':'כניסה לאזור האישי',`${appUrl}/my-registration`)}`,appUrl});
    return {subject:en?`Deposit confirmed ✨ ${workshop.title}`:`המקדמה אושרה ✨ ${workshop.title}`,...e};
  }
  if (job.template_key === 'PRODUCT_PURCHASE_CONFIRMED') {
    const code=job.payload?.issuedCode ?? job.order_metadata?.issuedCode ?? '';
    const body=`${emailDetails(en?[['Personal code',code],['Order number',job.order_code]]:[['קוד שימוש אישי',code],['מספר הזמנה',job.order_code]])}<div style="padding:18px;border-radius:16px;background:#F7EEE9;text-align:center"><div style="font-size:12px;color:#8A737A">${en?'Your personal code':'הקוד האישי שלך'}</div><div style="margin-top:8px;font-size:25px;font-weight:900;letter-spacing:2px;color:#1C1417">${escapeHtml(code)}</div></div>`;
    const e=shell({language,eyebrow:'PURCHASE CONFIRMED',title:en?'Your purchase is confirmed':'הרכישה שלך אושרה',intro:en?`${greeting} Your purchase was completed successfully.`:`${greeting} איזה כיף! הרכישה הושלמה בהצלחה.`,body,appUrl});
    return {subject:en?'Purchase complete — Eden Zino':'הרכישה הושלמה — Eden Zino',...e};
  }
  if (job.template_key === 'REGISTRATION_CANCELLATION_PENDING') {
    const e=shell({language,eyebrow:'CANCELLATION',title:en?'Your cancellation request was received':'בקשת הביטול נקלטה',intro:en?`${greeting} Your spot was released and the refund request is being processed.`:`${greeting} המקום שלך שוחרר ובקשת ההחזר נמצאת בטיפול.`,body:`${details}${emailDetails([[en?'Refund being processed':'סכום החזר בטיפול',moneyFromAgorot(job.payload?.refundAgorot,language)]])}`,appUrl});
    return {subject:en?`Cancellation received: ${workshop.title}`:`בקשת הביטול נקלטה: ${workshop.title}`,...e};
  }
  if (job.template_key === 'REGISTRATION_CANCELLED') {
    const reason=job.payload?.reason?`<p style="color:#6F5A61;line-height:1.7"><b>${en?'Reason':'סיבה'}:</b> ${escapeHtml(job.payload.reason)}</p>`:'';
    const e=shell({language,eyebrow:'CANCELLED',title:en?'Your registration was cancelled':'ההרשמה בוטלה',intro:en?`${greeting} Your workshop registration has been cancelled.`:`${greeting} הרשמתך לסדנה בוטלה.`,body:`${details}${reason}`,appUrl});
    return {subject:en?`Registration cancelled: ${workshop.title}`:`ביטול הרשמה: ${workshop.title}`,...e};
  }
  if (job.template_key === 'REFUND_CONFIRMED') {
    const e=shell({language,eyebrow:'REFUND CONFIRMED',title:en?'Your refund is complete':'ההחזר הושלם',intro:en?`${greeting} The refund was completed successfully.`:`${greeting} ההחזר הכספי בוצע בהצלחה.`,body:`${details}${emailDetails([[en?'Refunded amount':'סכום שהוחזר',moneyFromAgorot(job.payload?.amountAgorot,language)]])}`,appUrl});
    return {subject:en?`Refund confirmed: ${workshop.title}`:`החזר כספי אושר: ${workshop.title}`,...e};
  }
  if (job.template_key === 'REGISTRATION_TRANSFERRED') {
    const e=shell({language,eyebrow:'TRANSFER CONFIRMED',title:en?'Your transfer is complete':'ההעברה הושלמה',intro:en?`${greeting} Your registration was updated to the new workshop.`:`${greeting} ההרשמה שלך עודכנה לסדנה החדשה.`,body:details,appUrl});
    return {subject:en?'Your registration was transferred':'ההרשמה הועברה לסדנה אחרת',...e};
  }
  if (job.template_key === 'WAITLIST_INVITE') {
    const token=encodeURIComponent(String(job.payload?.inviteToken ?? ''));
    const e=shell({language,eyebrow:'A SPOT OPENED',title:en?'A spot opened for you':'התפנה עבורך מקום',intro:en?`${greeting} Great news — a spot opened in the workshop you wanted.`:`${greeting} יש לנו חדשות טובות — התפנה מקום בסדנה שרצית.`,body:`${details}${emailButton(en?'Reserve my spot and continue to payment':'שמירת המקום והמשך לתשלום',`${appUrl}/waitlist/${token}`)}<p style="color:#8A737A;font-size:13px;text-align:center">${en?'This link is temporary. When it expires, the spot may be offered to the next person in line.':'הקישור זמני. לאחר פקיעתו המקום יוצע לבא/ה בתור.'}</p>`,appUrl});
    return {subject:en?`A spot opened 🎉 ${workshop.title}`:`התפנה מקום 🎉 ${workshop.title}`,...e};
  }
  const note=en?'<div style="margin-top:22px;padding:18px 20px;border-radius:16px;background:#FFF7E9;border:1px solid #F4D7A2;color:#5D4521;line-height:1.7"><b>Keep this email.</b><br>Your registration code can be used to identify your booking if needed.</div>':'<div style="margin-top:22px;padding:18px 20px;border-radius:16px;background:#FFF7E9;border:1px solid #F4D7A2;color:#5D4521;line-height:1.7"><b>מומלץ לשמור את המייל הזה.</b><br>קוד ההרשמה ישמש לזיהוי ההזמנה במקרה הצורך.</div>';
  const e=shell({language,eyebrow:'REGISTRATION CONFIRMED',title:en?'Your spot is reserved!':'איזה כיף, המקום שלך שמור!',intro:en?`${greeting} Your registration was completed successfully. Here is everything you need for the workshop.`:`${greeting} ההרשמה שלך הושלמה בהצלחה. הנה כל מה שצריך לדעת לקראת הסדנה.`,body:`${details}${note}${emailButton(en?'View workshops':'צפייה בסדנאות',`${appUrl}/workshops`)}`,appUrl});
  return {subject:en?`Registration confirmed ✨ ${workshop.title}`:`ההרשמה אושרה ✨ ${workshop.title}`,...e,text:en?`${greeting} Your registration for ${workshop.title} is confirmed. Date: ${job.starts_at?formatDate(job.starts_at,language):''}. Registration code: ${job.registration_code??''}`:`${greeting} ההרשמה שלך לסדנה ${workshop.title} אושרה. מועד: ${job.starts_at?formatDate(job.starts_at,language):''}. קוד הרשמה: ${job.registration_code??''}`};
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
    coalesce(r.preferred_language,o.preferred_language,we.preferred_language,'he') preferred_language,
    coalesce(r.first_name,split_part(o.full_name,' ',1),we.first_name) first_name,
    coalesce(r.last_name,we.last_name) last_name,r.registration_code,r.amount_paid_agorot,r.total_amount_agorot,
    coalesce(w.title,ww.title) title,coalesce(w.title_en,ww.title_en) title_en,coalesce(w.starts_at,ww.starts_at) starts_at,
    coalesce(w.location_name,ww.location_name) location_name,coalesce(w.location_name_en,ww.location_name_en) location_name_en,
    coalesce(w.location_address,ww.location_address) location_address,coalesce(w.location_address_en,ww.location_address_en) location_address_en,
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
