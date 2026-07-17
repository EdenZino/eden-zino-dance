import { useCallback, useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarDays, CreditCard, KeyRound, LogOut, Mail, MapPin, Ticket } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { api, dateTime, money } from '../lib/api';
import { ErrorBox, Loading } from '../components/Loading';
import { TurnstileField } from '../components/TurnstileField';

export function PortalPage() {
  const [params,setParams]=useSearchParams();
  const qc=useQueryClient();
  const [turnstileToken,setTurnstileToken]=useState('');
  const [linkSent,setLinkSent]=useState(false);
  const onTurnstile=useCallback((token:string)=>setTurnstileToken(token),[]);
  const portal=useQuery({queryKey:['portal-me'],queryFn:()=>api<any>('/public/portal/me'),retry:false});
  const exchange=useMutation({mutationFn:(token:string)=>api('/public/portal/session',{method:'POST',body:JSON.stringify({token})}),onSuccess:()=>{params.delete('token');setParams(params,{replace:true});qc.invalidateQueries({queryKey:['portal-me']});}});
  const requestLink=useMutation({mutationFn:(email:string)=>api<any>('/public/portal/request-link',{method:'POST',body:JSON.stringify({email,turnstileToken:turnstileToken||undefined})}),onSuccess:()=>setLinkSent(true)});
  const payBalance=useMutation({mutationFn:(code:string)=>api<{session:{url:string}}>('/public/payments/start',{method:'POST',body:JSON.stringify({registrationCode:code,paymentKind:'BALANCE'})}),onSuccess:r=>location.href=r.session.url});
  const cancel=useMutation({mutationFn:(body:any)=>api('/public/cancellation-requests',{method:'POST',body:JSON.stringify(body)}),onSuccess:()=>alert('בקשת הביטול התקבלה ותטופל בהתאם למדיניות ולדין.')});
  const logout=useMutation({mutationFn:()=>api('/public/portal/logout',{method:'POST'}),onSuccess:()=>qc.setQueryData(['portal-me'],null)});

  useEffect(()=>{const token=params.get('token');if(token&&!exchange.isPending&&!exchange.isSuccess)exchange.mutate(token);},[params,exchange]);
  if(exchange.isPending)return <Loading label="מאמתים את הקישור המאובטח..."/>;

  const data=portal.data;
  return <div className="portal-page section-pad"><div className="page-hero"><span className="eyebrow">MY DANCE SPACE</span><h1>האזור שלי</h1><p>הכניסה מתבצעת בקישור חד־פעמי שנשלח לדוא״ל. אין יותר חשיפה של היסטוריית הלקוח באמצעות קוד הרשמה בלבד.</p></div>
    {!data&&<div className="portal-card">{linkSent?<div className="success-box"><Mail/> אם קיימת הרשמה עבור הכתובת, נשלח אליה קישור מאובטח. הקישור תקף ל־15 דקות.</div>:<form onSubmit={e=>{e.preventDefault();requestLink.mutate(String(new FormData(e.currentTarget).get('email')||''))}}><label>דוא״ל<input name="email" type="email" inputMode="email" autoComplete="email" required/></label><TurnstileField action="portal_login" onToken={onTurnstile}/>{requestLink.error&&<ErrorBox error={requestLink.error}/>}<button className="button primary full" disabled={requestLink.isPending}>{requestLink.isPending?'שולחים...':'שליחת קישור מאובטח'}</button></form>}{exchange.error&&<ErrorBox error={exchange.error}/>}</div>}
    {data&&<><div className="portal-toolbar"><span>מחובר/ת כ־<b>{data.email}</b></span><button className="button outline small" onClick={()=>logout.mutate()}><LogOut/> יציאה</button></div><section className="portal-section"><h2>הסדנאות שלי</h2><div className="portal-list">{data.registrations.map((r:any)=><article className="portal-result" key={r.registration_code}><span className={`status-chip ${r.status.toLowerCase()}`}>{statusText(r.status)}</span><h3>{r.title}</h3><div><CalendarDays/> {dateTime(r.starts_at)}</div><div><MapPin/> {r.location_name}, {r.location_address}</div><div><Ticket/> {r.participant_count} משתתפים · שולם {money(r.amount_paid_agorot)}</div><strong>קוד: {r.registration_code}</strong>{r.balance_agorot>0&&r.status==='DEPOSIT_PAID'&&<button className="button primary small" onClick={()=>payBalance.mutate(r.registration_code)}><CreditCard/> תשלום יתרה {money(r.balance_agorot)}</button>} {!['CANCELLED','REFUNDED','EXPIRED'].includes(r.status)&&<details><summary>בקשת ביטול</summary><form onSubmit={e=>{e.preventDefault();const f=new FormData(e.currentTarget);cancel.mutate({registrationCode:r.registration_code,reason:f.get('reason')})}}><textarea name="reason" placeholder="סיבת הביטול" required/><button className="button outline small">שליחת בקשה</button></form></details>}</article>)}</div></section>
    <section className="portal-section"><h2>כרטיסיות ומנויים</h2><div className="portal-list">{data.entitlements.length?data.entitlements.map((e:any)=><article className="portal-result" key={e.id}><KeyRound/><h3>{e.type==='PASS'?'כרטיסייה':'מנוי'}</h3><div className="confirmation-code small-code">{e.code}</div><span>{e.credits_remaining} קרדיטים נותרו</span><span>בתוקף עד {dateTime(e.valid_until)}</span><span className={`status-chip ${e.status.toLowerCase()}`}>{statusText(e.status)}</span></article>):<p>אין כרטיסיות או מנויים פעילים.</p>}</div></section></>}
  </div>;
}

const statusText=(value:string)=>({PAID:'שולם',DEPOSIT_PAID:'מקדמה שולמה',CHECKED_IN:'נכח/ה',PARTIALLY_REFUNDED:'הוחזר חלקית',REFUND_PENDING:'החזר בטיפול',REFUNDED:'הוחזר',CANCELLED:'בוטל',PENDING_PAYMENT:'ממתין לתשלום',PAYMENT_FAILED:'התשלום נכשל',ACTIVE:'פעיל',EXPIRED:'פג תוקף',EXHAUSTED:'נוצל'}[value]||value);
