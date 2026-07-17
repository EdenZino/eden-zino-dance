import { useMutation, useQuery } from '@tanstack/react-query';
import { CalendarDays, MapPin, TicketCheck } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { api, dateTime } from '../lib/api';
import { ErrorBox, Loading } from '../components/Loading';

export function WaitlistInvitePage(){
  const {token=''}=useParams();
  const q=useQuery({queryKey:['waitlist-invite',token],queryFn:()=>api<{invite:any}>(`/public/waitlist/${encodeURIComponent(token)}`)});
  const claim=useMutation({mutationFn:()=>api<any>(`/public/waitlist/${encodeURIComponent(token)}/claim`,{method:'POST',body:JSON.stringify({accepted:true})}),onSuccess:async r=>{const access=r.accessToken||'';if(r.registration.status==='PAID')location.href=`/payment/result?registration=${encodeURIComponent(r.registration.registration_code)}&access=${encodeURIComponent(access)}&result=success`;else{const payment=await api<{session:{url:string}}>('/public/payments/start',{method:'POST',body:JSON.stringify({registrationCode:r.registration.registration_code,accessToken:access})});location.href=payment.session.url;}}});
  if(q.isLoading)return <Loading/>;if(q.error||!q.data)return <ErrorBox error={q.error||new Error('ההזמנה אינה זמינה')}/>;
  const i=q.data.invite;
  return <div className="center-page result-page"><TicketCheck className="success-icon" size={58}/><span className="eyebrow">WAITLIST INVITATION</span><h1>התפנה מקום בסדנה</h1><p>{i.first_name}, ההזמנה שלך זמינה עד {dateTime(i.invite_expires_at)}. בלחיצה על הכפתור המקום יינעל עבורך ל-30 דקות לצורך תשלום.</p><div className="result-details"><b>{i.title}</b><span><CalendarDays/> {dateTime(i.starts_at)}</span><span><MapPin/> {i.location_name}, {i.location_address}</span><span>{i.available} מקומות זמינים כרגע</span></div><label className="checkbox-field"><input id="waitlist-consent" type="checkbox" required/> קראתי ואני מסכים/ה ל<Link to="/legal/TERMS" target="_blank">תנאים</Link>, ל<Link to="/legal/PRIVACY" target="_blank">פרטיות</Link> ול<Link to="/legal/CANCELLATION" target="_blank">מדיניות הביטולים</Link>.</label><button className="button primary" disabled={claim.isPending} onClick={()=>{const el=document.getElementById('waitlist-consent') as HTMLInputElement;if(!el?.checked){alert('יש לאשר את התנאים לפני שמירת המקום.');return;}claim.mutate()}}>{claim.isPending?'שומר מקום...':'שמירת מקום ומעבר לתשלום'}</button>{claim.error&&<ErrorBox error={claim.error}/>}</div>;
}
