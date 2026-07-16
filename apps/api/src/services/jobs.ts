import { db } from '../lib/db';
import type { Env } from '../types';
import { callSignedWebhook, sendEmail } from './notifications';

function formatDate(value: string) {
  return new Intl.DateTimeFormat('he-IL', { dateStyle: 'full', timeStyle: 'short', timeZone: 'Asia/Jerusalem' }).format(new Date(value));
}

export async function runMaintenance(env: Env) {
  const sql = db(env);
  await sql`select expire_registration_holds()`;
  await sql`select apply_data_retention()`;
  await sql`update passes set status='EXPIRED' where status='ACTIVE' and expires_at<=now()`;
  await sql`update memberships set status='EXPIRED' where status='ACTIVE' and current_period_end<=now()`;

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
    coalesce(r.email,o.email) email,coalesce(r.phone,o.phone) phone,coalesce(r.first_name,split_part(o.full_name,' ',1)) first_name,
    r.last_name,r.registration_code,r.amount_paid_agorot,r.total_amount_agorot,
    w.title,w.starts_at,w.location_name,w.location_address,o.order_code,o.order_type,o.metadata order_metadata
    from notification_jobs j left join registrations r on r.id=j.registration_id left join workshops w on w.id=r.workshop_id
    left join commerce_orders o on o.id=j.order_id
    where j.status='PENDING' and j.scheduled_at<=now() order by j.scheduled_at limit 30`;

  for (const job of jobs as any[]) {
    try {
      await sql`update notification_jobs set status='PROCESSING',attempts=attempts+1 where id=${job.id}::uuid`;
      const details = { registrationCode: job.registration_code, orderCode: job.order_code, name: `${job.first_name ?? ''} ${job.last_name ?? ''}`.trim(), email: job.email, phone: job.phone, workshop: job.title, startsAt: job.starts_at, location: `${job.location_name ?? ''} ${job.location_address ?? ''}`.trim(), amountPaidAgorot: job.amount_paid_agorot, issuedCode: job.payload?.issuedCode ?? job.order_metadata?.issuedCode };
      if (job.channel === 'EMAIL') {
        let subject='עדכון מ-Eden Zino Dance';let html='<div dir="rtl"><p>הפעולה הושלמה.</p></div>';
        if(job.template_key==='WORKSHOP_REMINDER') { subject=`תזכורת לסדנה: ${job.title}`;html=`<div dir="rtl"><h2>נתראה מחר</h2><p>${job.first_name}, הסדנה <b>${job.title}</b> מתקיימת ב-${formatDate(job.starts_at)}.</p><p>${job.location_name}<br>${job.location_address}</p><p>קוד הרשמה: <b>${job.registration_code}</b></p></div>`; }
        else if(job.template_key==='BALANCE_REMINDER') { subject=`יתרת תשלום לסדנה: ${job.title}`;html=`<div dir="rtl"><h2>נותרה יתרה לתשלום</h2><p>ההרשמה שלך לסדנה <b>${job.title}</b> שמורה לאחר תשלום מקדמה.</p><p>לתשלום היתרה היכנסי לאזור האישי עם הקוד <b>${job.registration_code}</b>.</p></div>`; }
        else if(job.template_key==='PRODUCT_PURCHASE_CONFIRMED') { subject='הרכישה הושלמה';html=`<div dir="rtl"><h2>הרכישה שלך אושרה</h2><p>קוד השימוש האישי שלך:</p><p style="font-size:24px"><b>${details.issuedCode ?? ''}</b></p><p>מספר הזמנה: ${job.order_code}</p></div>`; }
        else { subject=`ההרשמה אושרה: ${job.title}`;html=`<div dir="rtl"><h2>ההרשמה שלך אושרה</h2><p>${job.first_name}, הסדנה <b>${job.title}</b> מתקיימת ב-${formatDate(job.starts_at)}.</p><p>${job.location_name}<br>${job.location_address}</p><p>קוד הרשמה: <b>${job.registration_code}</b></p></div>`; }
        await sendEmail(env,{to:job.email,subject,html});
      } else if (job.channel === 'WHATSAPP') await callSignedWebhook(env.WHATSAPP_WEBHOOK_URL, env.WHATSAPP_WEBHOOK_SECRET, { event: job.template_key, ...details });
      else if (job.channel === 'INVOICE') await callSignedWebhook(env.INVOICE_WEBHOOK_URL, env.INVOICE_WEBHOOK_SECRET, { event: job.template_key, ...details });
      await sql`update notification_jobs set status='SENT',sent_at=now() where id=${job.id}::uuid`;
    } catch (error) {
      await sql`update notification_jobs set status=case when attempts>=5 then 'FAILED' else 'PENDING' end,last_error=${error instanceof Error ? error.message : 'Unknown error'},scheduled_at=now()+interval '15 minutes' where id=${job.id}::uuid`;
    }
  }
}
