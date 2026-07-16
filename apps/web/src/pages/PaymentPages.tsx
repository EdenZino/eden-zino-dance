import { CheckCircle2, CreditCard, XCircle } from 'lucide-react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import { api, dateTime, money } from '../lib/api';
import { ErrorBox, Loading } from '../components/Loading';

export function PaymentMockPage() {
  const [params] = useSearchParams();
  const paymentId=params.get('payment')||'';const type=params.get('type')||'registration';const reference=params.get('reference')||'';
  const registration=useQuery({queryKey:['registration',reference],queryFn:()=>api<{registration:any}>(`/public/registrations/${encodeURIComponent(reference)}/status`),enabled:type==='registration'&&!!reference});
  const order=useQuery({queryKey:['order',reference],queryFn:()=>api<{order:any}>(`/public/orders/${encodeURIComponent(reference)}/status`),enabled:type==='order'&&!!reference});
  const preview=useQuery({queryKey:['payment-preview',paymentId],queryFn:()=>api<{payment:any}>(`/public/payments/${paymentId}/preview`),enabled:!!paymentId});
  const complete=useMutation({mutationFn:()=>api<any>('/public/payments/mock/complete',{method:'POST',body:JSON.stringify({paymentId})}),onSuccess:()=>location.href=type==='registration'?`/payment/result?registration=${encodeURIComponent(reference)}&result=success`:`/products/result?order=${encodeURIComponent(reference)}&result=success`});
  if(registration.isLoading||order.isLoading||preview.isLoading)return <Loading/>;if(registration.error||order.error||preview.error)return <ErrorBox error={registration.error||order.error||preview.error}/>;
  const r=registration.data?.registration;const o=order.data?.order;
  return <div className="center-page payment-demo"><CreditCard size={56}/><span className="eyebrow">DEMO PAYMENT</span><h1>עמוד תשלום לבדיקות</h1><p>בייצור עמוד זה מוחלף בדף התשלום המאובטח של ספק הסליקה. אין כאן סליקה אמיתית.</p><div className="payment-summary"><b>{preview.data?.payment.title||r?.title||'רכישה'}</b><span>{preview.data?.payment.customer_name||reference}</span><strong>{money(preview.data?.payment.amount_agorot||o?.amount_agorot||0)}</strong></div><button className="button primary" onClick={()=>complete.mutate()} disabled={complete.isPending||!paymentId}>{complete.isPending?'מאשר...':'הדמיית תשלום מוצלח'}</button>{complete.error&&<ErrorBox error={complete.error}/>}</div>;
}

export function PaymentResultPage() {
  const [params]=useSearchParams(); const code=params.get('registration')||''; const result=params.get('result');
  const query=useQuery({queryKey:['registration-result',code],queryFn:()=>api<{registration:any}>(`/public/registrations/${encodeURIComponent(code)}/status`),enabled:!!code,refetchInterval:(q)=>['PAID','DEPOSIT_PAID','CHECKED_IN'].includes((q.state.data as any)?.registration?.status)?false:2000});
  const balance=useMutation({mutationFn:()=>api<{session:{url:string}}>('/public/payments/start',{method:'POST',body:JSON.stringify({registrationCode:code,paymentKind:'BALANCE'})}),onSuccess:r=>location.href=r.session.url});
  if(query.isLoading)return <Loading label="בודקים את התשלום..."/>; if(query.error||!query.data)return <ErrorBox error={query.error||new Error('הרשמה לא נמצאה')}/>;
  const r=query.data.registration; const confirmed=['PAID','DEPOSIT_PAID','CHECKED_IN','PARTIALLY_REFUNDED'].includes(r.status);const fullyPaid=['PAID','CHECKED_IN','PARTIALLY_REFUNDED'].includes(r.status);
  return <div className="center-page result-page">{confirmed?<CheckCircle2 className="success-icon"/>:<XCircle className="error-icon"/>}<span className="eyebrow">{fullyPaid?'REGISTRATION CONFIRMED':r.status==='DEPOSIT_PAID'?'DEPOSIT CONFIRMED':'PAYMENT STATUS'}</span><h1>{fullyPaid?'המקום שלך שמור!':r.status==='DEPOSIT_PAID'?'המקדמה התקבלה והמקום שמור':result==='failed'?'התשלום לא הושלם':'ממתינים לאישור התשלום'}</h1>{confirmed?<><p>שלחנו אישור ל-{r.email}. שמרי את קוד ההרשמה.</p><div className="confirmation-code">{r.registration_code}</div><div className="result-details"><span><b>{r.title}</b></span><span>{dateTime(r.starts_at)}</span><span>{r.location_name}, {r.location_address}</span><span>שולם: {money(r.amount_paid_agorot)} · יתרה: {money(r.balance_agorot)}</span></div>{r.status==='DEPOSIT_PAID'&&<button className="button primary" onClick={()=>balance.mutate()} disabled={balance.isPending}>{balance.isPending?'פותח תשלום...':'תשלום היתרה עכשיו'}</button>}</>:<p>לא סימנו את ההרשמה כמשולמת. ניתן לבדוק שוב או ליצור קשר.</p>}<div className="hero-actions"><Link className="button primary" to="/my-registration">צפייה בהרשמה</Link><Link className="button ghost" to="/">חזרה לבית</Link></div></div>;
}
