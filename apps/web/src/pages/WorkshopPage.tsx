import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { CalendarDays, Check, Clock3, MapPin, Minus, Plus, ShieldCheck, Users } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { api, dateTime, money } from '../lib/api';
import type { Workshop } from '../lib/types';
import { ErrorBox, Loading } from '../components/Loading';

type Field = { id:string; field_key:string; field_type:string; label:string; help_text:string; required:boolean; options:string[] };
type Legal = { type:string; version:string; title:string; content:string };

export function WorkshopPage() {
  const { code = '' } = useParams();
  const query = useQuery({ queryKey:['workshop',code], queryFn:()=>api<{workshop:Workshop;fields:Field[];legal:Legal[]}>(`/public/workshops/${encodeURIComponent(code)}`) });
  if (query.isLoading) return <Loading/>;
  if (query.error || !query.data) return <ErrorBox error={query.error || new Error('הסדנה לא נמצאה')}/>;
  return <WorkshopDetails data={query.data}/>;
}

function WorkshopDetails({ data }: { data:{workshop:Workshop;fields:Field[];legal:Legal[]} }) {
  const { workshop, fields, legal } = data;
  const [participants,setParticipants]=useState(1);
  const [showForm,setShowForm]=useState(false);
  const soldOut=workshop.available<=0;
  const price=workshop.early_bird_price_agorot&&workshop.early_bird_ends_at&&new Date(workshop.early_bird_ends_at)>new Date()?workshop.early_bird_price_agorot:workshop.price_agorot;
  const openPrimaryAction = () => {
    if (soldOut) document.getElementById('booking-card')?.scrollIntoView({ behavior:'smooth', block:'center' });
    else setShowForm(true);
  };

  return <div className="workshop-page">
    <section className="workshop-cover" aria-labelledby="workshop-title" style={workshop.image_url?{backgroundImage:`linear-gradient(90deg,rgba(20,17,24,.9),rgba(20,17,24,.2)),url(${workshop.image_url})`}:undefined}>
      <div><span className="eyebrow">{workshop.public_code}</span><h1 id="workshop-title">{workshop.title}</h1><p>{workshop.short_description}</p><div className="cover-facts"><span><CalendarDays aria-hidden="true"/> {dateTime(workshop.starts_at)}</span><span><MapPin aria-hidden="true"/> {workshop.location_name}</span><span aria-live="polite"><Users aria-hidden="true"/> {soldOut?'הסדנה מלאה':`${workshop.available} מקומות נותרו`}</span></div></div>
    </section>
    <div className="workshop-content section-pad">
      <article className="workshop-description"><h2>על הסדנה</h2><div className="prose">{workshop.full_description || 'תיאור מלא של הסדנה יופיע כאן.'}</div><div className="info-grid"><div><Clock3 aria-hidden="true"/><b>מתי?</b><span>{dateTime(workshop.starts_at)}</span></div><div><MapPin aria-hidden="true"/><b>איפה?</b><span>{workshop.location_name}<br/>{workshop.location_address}</span></div><div><Users aria-hidden="true"/><b>למי?</b><span>{workshop.audience || 'לכל מי שרוצה לרקוד'}<br/>{workshop.level}</span></div><div><ShieldCheck aria-hidden="true"/><b>הרשמה</b><span>מקום נשמר לאחר השלמת תשלום</span></div></div>{workshop.instructors?.map(i=><section className="mini-instructor" key={i.id}><div className="avatar" aria-hidden="true">EZ</div><div><small>המדריכה</small><h3>{i.name}</h3><p>{i.bio}</p></div></section>)}</article>
      <aside className="booking-card" id="booking-card" aria-label="פרטי מחיר והרשמה"><span className="micro">מחיר למשתתף</span><strong>{money(price,workshop.currency)}</strong>{workshop.early_bird_price_agorot===price&&<em>מחיר Early Bird</em>}<hr/><div className="booking-row"><span>משתתפים</span><div className="stepper"><button type="button" onClick={()=>setParticipants(Math.max(1,participants-1))} aria-label="הפחתת מספר המשתתפים"><Minus aria-hidden="true"/></button><b aria-live="polite">{participants}</b><button type="button" onClick={()=>setParticipants(Math.min(workshop.max_participants_per_order||1,participants+1))} aria-label="הגדלת מספר המשתתפים"><Plus aria-hidden="true"/></button></div></div><div className="total"><span>סה״כ לפני הנחה</span><b>{money(price*participants,workshop.currency)}</b></div>{soldOut?<WaitlistForm workshopCode={workshop.public_code}/>:<button className="button primary full" type="button" onClick={()=>setShowForm(true)}>שמירת מקום והרשמה</button>}<small className="secure-note"><ShieldCheck aria-hidden="true"/> פרטי הכרטיס אינם נשמרים באתר</small></aside>
    </div>
    <div className="mobile-booking-bar" aria-label="פעולת הרשמה מהירה"><div><small>{participants > 1 ? `${participants} משתתפים` : 'מחיר למשתתף'}</small><strong>{money(price*participants,workshop.currency)}</strong></div><button className="button primary" type="button" onClick={openPrimaryAction}>{soldOut?'רשימת המתנה':'להרשמה'}</button></div>
    {showForm&&<RegistrationModal workshop={workshop} fields={fields} legal={legal} participantCount={participants} onClose={()=>setShowForm(false)}/>} 
  </div>;
}

function RegistrationModal({workshop,fields,legal,participantCount,onClose}:{workshop:Workshop;fields:Field[];legal:Legal[];participantCount:number;onClose:()=>void}) {
  const [error,setError]=useState('');
  const dialogRef=useRef<HTMLDivElement>(null);
  const terms=legal.find(x=>x.type==='TERMS');
  const privacy=legal.find(x=>x.type==='PRIVACY');
  const cancellation=legal.find(x=>x.type==='CANCELLATION');
  const reserve=useMutation({mutationFn:(payload:any)=>api<{registration:any}>('/public/registrations/reserve',{method:'POST',body:JSON.stringify(payload)}),onSuccess:async(data)=>{const payment=await api<{session?:{url:string};alreadyPaid?:boolean}>('/public/payments/start',{method:'POST',body:JSON.stringify({registrationCode:data.registration.registration_code})});if(payment.alreadyPaid)location.href=`/payment/result?registration=${data.registration.registration_code}&result=success`;else if(payment.session)location.href=payment.session.url;},onError:e=>setError(e instanceof Error?e.message:'שגיאה')});
  const participantIndexes=useMemo(()=>Array.from({length:participantCount},(_,i)=>i),[participantCount]);

  useEffect(()=>{
    const previous=document.activeElement as HTMLElement | null;
    const close=(event:KeyboardEvent)=>{if(event.key==='Escape')onClose();};
    document.addEventListener('keydown',close);
    document.body.classList.add('modal-open');
    dialogRef.current?.focus();
    return()=>{document.removeEventListener('keydown',close);document.body.classList.remove('modal-open');previous?.focus();};
  },[onClose]);

  return <div className="modal-backdrop" onMouseDown={event=>{if(event.target===event.currentTarget)onClose();}}><div className="modal" ref={dialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="registration-title"><button className="modal-close" type="button" onClick={onClose} aria-label="סגירת טופס ההרשמה">×</button><div className="modal-head"><span className="eyebrow">REGISTRATION</span><h2 id="registration-title">הרשמה ל-{workshop.title}</h2><p>{participantCount} משתתפים · המקום יישמר לזמן מוגבל בזמן התשלום</p></div><form onSubmit={e=>{e.preventDefault();setError('');const f=new FormData(e.currentTarget);const participants=participantIndexes.map(i=>({firstName:String(f.get(`p${i}-firstName`)||''),lastName:String(f.get(`p${i}-lastName`)||''),birthYear:String(f.get(`p${i}-birthYear`)||''),experienceLevel:String(f.get(`p${i}-experience`)||''),partnerName:String(f.get(`p${i}-partner`)||'')}));const answers=Object.fromEntries(fields.map(field=>[field.field_key,f.getAll(`field-${field.field_key}`).length>1?f.getAll(`field-${field.field_key}`):f.get(`field-${field.field_key}`)]));reserve.mutate({workshopCode:workshop.public_code,firstName:f.get('firstName'),lastName:f.get('lastName'),email:f.get('email'),phone:f.get('phone'),notes:f.get('notes'),participants,couponCode:f.get('couponCode'),passCode:f.get('passCode'),membershipCode:f.get('membershipCode'),marketingConsent:f.get('marketing')==='on',guardian:{name:f.get('guardianName'),phone:f.get('guardianPhone')},customAnswers:answers,acceptedTermsVersion:terms?.version||workshop.terms_version,acceptedPrivacyVersion:privacy?.version||workshop.privacy_version,acceptedCancellationVersion:cancellation?.version||workshop.cancellation_policy_version,paymentDueType:f.get('paymentDueType')||'FULL'});}}>
    <div className="form-grid"><label>שם פרטי<input name="firstName" autoComplete="given-name" required/></label><label>שם משפחה<input name="lastName" autoComplete="family-name" required/></label><label>דוא״ל<input name="email" type="email" inputMode="email" autoComplete="email" required/></label><label>טלפון<input name="phone" type="tel" inputMode="tel" autoComplete="tel" required/></label></div>
    <h3>פרטי המשתתפים</h3>{participantIndexes.map(i=><fieldset key={i}><legend>משתתף/ת {i+1}</legend><div className="form-grid"><label>שם פרטי<input name={`p${i}-firstName`} required/></label><label>שם משפחה<input name={`p${i}-lastName`} required/></label><label>שנת לידה<input name={`p${i}-birthYear`} type="number" inputMode="numeric" min="1900" max="2100"/></label><label>רמת ניסיון<input name={`p${i}-experience`}/></label><label>שם בן/בת זוג לריקוד<input name={`p${i}-partner`}/></label></div></fieldset>)}
    {workshop.minimum_age&&<details><summary>פרטי הורה/אפוטרופוס (למשתתפים קטינים)</summary><div className="form-grid"><label>שם<input name="guardianName" autoComplete="name"/></label><label>טלפון<input name="guardianPhone" type="tel" inputMode="tel" autoComplete="tel"/></label></div></details>}
    {fields.length>0&&<><h3>מידע נוסף</h3><div className="form-grid">{fields.map(field=><DynamicField key={field.id} field={field}/>)}</div></>}
    <div className="form-grid"><label>קוד קופון<input name="couponCode" autoCapitalize="characters"/></label><label>קוד כרטיסייה<input name="passCode" placeholder="PASS-..." autoCapitalize="characters"/></label><label>קוד מנוי<input name="membershipCode" placeholder="MEM-..." autoCapitalize="characters"/></label>{workshop.deposit_agorot&&<label>אופן תשלום<select name="paymentDueType"><option value="FULL">תשלום מלא</option><option value="DEPOSIT">מקדמה</option></select></label>}</div><label>הערות<textarea name="notes" rows={3}/></label>
    <div className="consents"><label><input type="checkbox" required/> <span>קראתי ואני מסכים/ה ל<Link to="/legal/TERMS" target="_blank">תנאי ההרשמה</Link>, <Link to="/legal/PRIVACY" target="_blank">מדיניות הפרטיות</Link> ו<Link to="/legal/CANCELLATION" target="_blank">מדיניות הביטולים</Link>.</span></label><label><input name="marketing" type="checkbox"/> <span>אני מעוניין/ת לקבל עדכונים והטבות. ניתן להסיר הסכמה בכל עת.</span></label></div>
    {error&&<div className="error-box" role="alert">{translateError(error)}</div>}<button disabled={reserve.isPending} className="button primary full">{reserve.isPending?'שומר מקום...':'המשך לתשלום'}</button>
  </form></div></div>;
}

function DynamicField({field}:{field:Field}) { const name=`field-${field.field_key}`; if(field.field_type==='TEXTAREA')return <label className="wide">{field.label}<textarea name={name} required={field.required}/><small>{field.help_text}</small></label>;if(field.field_type==='SELECT')return <label>{field.label}<select name={name} required={field.required}><option value="">בחירה</option>{field.options.map(o=><option key={o}>{o}</option>)}</select></label>;if(field.field_type==='CHECKBOX')return <label className="checkbox-field"><input type="checkbox" name={name}/>{field.label}</label>;if(field.field_type==='MULTISELECT')return <fieldset><legend>{field.label}</legend>{field.options.map(o=><label className="checkbox-field" key={o}><input type="checkbox" name={name} value={o}/>{o}</label>)}</fieldset>;return <label>{field.label}<input name={name} type={field.field_type==='NUMBER'?'number':field.field_type==='DATE'?'date':'text'} required={field.required}/><small>{field.help_text}</small></label>; }

function WaitlistForm({workshopCode}:{workshopCode:string}) { const [done,setDone]=useState(false); const mutation=useMutation({mutationFn:(body:any)=>api('/public/waitlist',{method:'POST',body:JSON.stringify(body)}),onSuccess:()=>setDone(true)}); if(done)return <div className="success-box" role="status"><Check aria-hidden="true"/>נוספת לרשימת ההמתנה. ניצור קשר כשיתפנה מקום.</div>;return <form className="waitlist-form" onSubmit={e=>{e.preventDefault();const f=new FormData(e.currentTarget);mutation.mutate({workshopCode,firstName:f.get('firstName'),lastName:f.get('lastName'),email:f.get('email'),phone:f.get('phone'),participantCount:1})}}><h3>הצטרפות לרשימת המתנה</h3><label>שם פרטי<input name="firstName" autoComplete="given-name" required/></label><label>שם משפחה<input name="lastName" autoComplete="family-name" required/></label><label>דוא״ל<input name="email" type="email" inputMode="email" autoComplete="email" required/></label><label>טלפון<input name="phone" type="tel" inputMode="tel" autoComplete="tel" required/></label><button className="button primary full">הצטרפות</button></form> }
const translateError=(e:string)=>({WORKSHOP_FULL:'הסדנה התמלאה ברגע זה. ניתן להצטרף לרשימת ההמתנה.',REGISTRATION_CLOSED:'ההרשמה נסגרה.',REGISTRATION_NOT_OPEN:'ההרשמה טרם נפתחה.',TOO_MANY_PARTICIPANTS:'מספר המשתתפים גבוה מהמותר להזמנה.',PHONE_REGISTRATION_LIMIT:'מספר המקומות המותר לטלפון זה כבר נוצל.',PASS_NOT_VALID:'קוד הכרטיסייה אינו תקף, אינו שייך לדוא״ל או שאין בו מספיק קרדיטים.',MEMBERSHIP_NOT_VALID:'קוד המנוי אינו תקף, אינו שייך לדוא״ל או שאין בו מספיק קרדיטים.',PAYMENT_PROVIDER_UNAVAILABLE:'לא הצלחנו לפתוח את דף התשלום. נסו שוב בעוד רגע או צרו קשר.'}[e]||e);
