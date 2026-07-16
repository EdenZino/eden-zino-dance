import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Camera, Mail, Phone, ShieldCheck } from 'lucide-react';
import { useParams } from 'react-router-dom';
import { api } from '../lib/api';
import type { SiteData } from '../lib/types';
import { ErrorBox, Loading } from '../components/Loading';

export function ContactPage() {
  const [done,setDone]=useState(false);
  const site=useQuery({queryKey:['site'],queryFn:()=>api<SiteData>('/public/site')});
  const settings=site.data?.settings||{};
  const mutation=useMutation({mutationFn:(body:any)=>api('/public/contact',{method:'POST',body:JSON.stringify(body)}),onSuccess:()=>setDone(true)});
  return <div className="contact-page section-pad"><div className="page-hero"><span className="eyebrow">LET'S TALK</span><h1>יש שאלה? דברו איתנו</h1><p>בנוגע לסדנה, הרשמה פרטית, שיתוף פעולה או אירוע מיוחד.</p></div><div className="contact-grid"><div className="contact-info"><h2>עדן זינו</h2><a href={`mailto:${settings.contact_email||'hello@example.co.il'}`}><Mail/> {settings.contact_email||'hello@example.co.il'}</a>{settings.contact_phone&&<a href={`tel:${settings.contact_phone}`}><Phone/> {settings.contact_phone}</a>}<a href={settings.instagram_url||'https://www.instagram.com/eden_zinooo/?hl=en'} target="_blank" rel="noreferrer"><Camera/> @eden_zinooo</a></div><div className="contact-form">{done?<div className="success-box">ההודעה נשלחה. נחזור אליך בהקדם.</div>:<form onSubmit={e=>{e.preventDefault();mutation.mutate(Object.fromEntries(new FormData(e.currentTarget)))}}><label>שם<input name="name" required/></label><label>דוא״ל<input name="email" type="email" required/></label><label>טלפון<input name="phone"/></label><label>הודעה<textarea name="message" rows={6} required/></label><button className="button primary">שליחת הודעה</button></form>}</div></div></div>;
}

export function LegalPage() {
  const {type='TERMS'}=useParams(); const query=useQuery({queryKey:['site'],queryFn:()=>api<SiteData>('/public/site')});
  if(query.isLoading)return <Loading/>;if(query.error)return <ErrorBox error={query.error}/>;
  const doc=query.data?.legal.find(d=>d.type===type);
  return <article className="legal-page section-pad"><span className="eyebrow">LEGAL</span><h1>{doc?.title||'מסמך לא נמצא'}</h1>{doc&&<small>גרסה: {doc.version}</small>}<div className="legal-content">{doc?.content||'המסמך טרם פורסם.'}</div>{type==='PRIVACY'&&<PrivacyRequest/>}</article>;
}

function PrivacyRequest(){const [done,setDone]=useState(false);const request=useMutation({mutationFn:(body:any)=>api('/public/privacy-requests',{method:'POST',body:JSON.stringify(body)}),onSuccess:()=>setDone(true)});return <section className="privacy-request"><ShieldCheck/><h2>בקשה בנוגע למידע אישי</h2>{done?<div className="success-box">הבקשה התקבלה ותועבר לטיפול.</div>:<form onSubmit={e=>{e.preventDefault();request.mutate(Object.fromEntries(new FormData(e.currentTarget)))}}><label>דוא״ל<input name="email" type="email" required/></label><label>סוג בקשה<select name="requestType"><option value="ACCESS">עיון במידע</option><option value="CORRECTION">תיקון מידע</option><option value="DELETION">מחיקה/אנונימיזציה</option><option value="MARKETING_OPT_OUT">הסרה משיווק</option></select></label><label>פרטים<textarea name="details" rows={4}/></label><button className="button primary">שליחת בקשה</button></form>}</section>}
