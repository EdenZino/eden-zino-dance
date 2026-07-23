import { Fragment, useState, type ReactNode } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Camera, Mail, Phone, ShieldCheck } from 'lucide-react';
import { useParams } from 'react-router-dom';
import { api } from '../lib/api';
import { useLanguage } from '../lib/language';
import type { SiteData } from '../lib/types';
import { ErrorBox, Loading } from '../components/Loading';

export function ContactPage(){
  const {t}=useLanguage();
  const [done,setDone]=useState(false);
  const site=useQuery({queryKey:['site'],queryFn:()=>api<SiteData>('/public/site')});
  const settings=site.data?.settings||{};
  const mutation=useMutation({mutationFn:(body:any)=>api('/public/contact',{method:'POST',body:JSON.stringify(body)}),onSuccess:()=>setDone(true)});
  return <div className="contact-page section-pad"><div className="page-hero"><span className="eyebrow">LET'S TALK</span><h1>{t('יש שאלה? דברו איתנו','Have a question? Let’s talk')}</h1><p>{t('בנוגע לסדנה, הרשמה פרטית, שיתוף פעולה, אירוע מיוחד או בקשת התאמה לנגישות.','About a workshop, private booking, collaboration, special event or an accessibility accommodation request.')}</p></div><div className="contact-grid"><div className="contact-info"><h2>Eden Zino</h2><a href={`mailto:${settings.contact_email||'hello@example.co.il'}`}><Mail aria-hidden="true"/> {settings.contact_email||'hello@example.co.il'}</a>{settings.accessibility_email&&settings.accessibility_email!==settings.contact_email&&<a href={`mailto:${settings.accessibility_email}`}><ShieldCheck aria-hidden="true"/> {t('נגישות:','Accessibility:')} {settings.accessibility_email}</a>}{settings.contact_phone&&<a href={`tel:${settings.contact_phone}`}><Phone aria-hidden="true"/> {settings.contact_phone}</a>}<a href={settings.instagram_url||'https://www.instagram.com/eden_zinooo/?hl=en'} target="_blank" rel="noreferrer" aria-label={t('פתיחת האינסטגרם של עדן זינו בחלון חדש','Open Eden Zino Instagram in a new window')}><Camera aria-hidden="true"/> @eden_zinooo</a></div><div className="contact-form">{done?<div className="success-box" role="status" aria-live="polite">{t('ההודעה נשלחה. נחזור אליך בהקדם.','Message sent. We’ll get back to you soon.')}</div>:<form onSubmit={e=>{e.preventDefault();mutation.mutate(Object.fromEntries(new FormData(e.currentTarget)))}}><div className="form-grid"><label>{t('שם','Name')}<input name="name" autoComplete="name" required/></label><label>{t('דוא״ל','Email')}<input name="email" type="email" autoComplete="email" required/></label><label>{t('טלפון','Phone')}<input name="phone" type="tel" autoComplete="tel"/></label></div><label>{t('הודעה','Message')}<textarea name="message" rows={6} required/></label>{mutation.error&&<ErrorBox error={mutation.error}/>}<button className="button primary" disabled={mutation.isPending}>{mutation.isPending?t('שולח...','Sending...'):t('שליחת הודעה','Send message')}</button></form>}</div></div></div>;
}

export function LegalPage(){
  const {language,t}=useLanguage();
  const {type='TERMS'}=useParams();
  const query=useQuery({queryKey:['site'],queryFn:()=>api<SiteData>('/public/site')});
  if(query.isLoading)return <Loading/>;
  if(query.error)return <ErrorBox error={query.error}/>;
  const doc=query.data?.legal.find(d=>d.type===type) as any;
  const title=language==='en'?(doc?.title_en||doc?.title):doc?.title;
  const rawContent=language==='en'?(doc?.content_en||doc?.content):doc?.content;
  const content=rawContent?replaceAccessibilityPlaceholders(rawContent,query.data?.settings||{},language):rawContent;
  return <article className="legal-page section-pad"><span className="eyebrow">LEGAL</span><h1>{title||t('מסמך לא נמצא','Document not found')}</h1>{doc&&<small>{t('גרסה','Version')}: {doc.version}</small>}<div className="legal-content">{content?<LegalDocumentContent content={content}/>:t('המסמך טרם פורסם.','This document has not been published yet.')}</div>{type==='PRIVACY'&&<PrivacyRequest/>}</article>;
}

function replaceAccessibilityPlaceholders(content:string,settings:Record<string,string>,language:'he'|'en'){
  if(!content)return content;
  const knownLimitations=language==='en'?(settings.accessibility_known_limitations_en||settings.accessibility_known_limitations||''):(settings.accessibility_known_limitations||'');
  const mailingAddress=language==='en'?(settings.mailing_address_en||settings.mailing_address||''):(settings.mailing_address||'');
  const replacements:Record<string,string>={
    '[[שם איש/אשת קשר לנגישות]]':settings.accessibility_contact_name||'[[שם איש/אשת קשר לנגישות]]',
    '[[דוא״ל נגישות]]':settings.accessibility_email||'[[דוא״ל נגישות]]',
    '[[טלפון נגישות]]':settings.accessibility_phone||'[[טלפון נגישות]]',
    '[[יש להשלים כתובת למשלוח דואר]]':mailingAddress||'[[יש להשלים כתובת למשלוח דואר]]',
    '[[יש לפרט כאן מגבלות נגישות ידועות בפועל. אם אין מידע — אין לכתוב "אין מגבלות" לפני בדיקה.]]':knownLimitations||'[[יש לפרט כאן מגבלות נגישות ידועות בפועל. אם אין מידע — אין לכתוב "אין מגבלות" לפני בדיקה.]]',
    '[[accessibility contact name]]':settings.accessibility_contact_name||'[[accessibility contact name]]',
    '[[accessibility email]]':settings.accessibility_email||'[[accessibility email]]',
    '[[accessibility phone]]':settings.accessibility_phone||'[[accessibility phone]]',
    '[[complete mailing address]]':mailingAddress||'[[complete mailing address]]',
    '[[List actual known accessibility limitations here. If no information is available, do not state that there are no limitations before an audit.]]':knownLimitations||'[[List actual known accessibility limitations here. If no information is available, do not state that there are no limitations before an audit.]]',
  };
  return Object.entries(replacements).reduce((result,[key,value])=>result.replaceAll(key,value),content);
}

function inlineMarkup(text:string):ReactNode[]{
  const cleaned=text.replace(/`([^`]+)`/g,'$1');
  const parts=cleaned.split(/(\*\*[^*]+\*\*)/g).filter(Boolean);
  return parts.map((part,index)=>part.startsWith('**')&&part.endsWith('**')?<strong key={index}>{part.slice(2,-2)}</strong>:<Fragment key={index}>{part}</Fragment>);
}

function LegalDocumentContent({content}:{content:string}){
  const lines=content.replace(/\r\n/g,'\n').split('\n');
  const nodes:ReactNode[]=[];
  let bullets:string[]=[];
  const flushBullets=()=>{if(!bullets.length)return;nodes.push(<ul key={`ul-${nodes.length}`}>{bullets.map((x,i)=><li key={i}>{inlineMarkup(x)}</li>)}</ul>);bullets=[];};
  lines.forEach((raw,index)=>{
    const line=raw.trim();
    if(line.startsWith('- ')){bullets.push(line.slice(2));return;}
    flushBullets();
    if(!line){return;}
    if(line.startsWith('### '))nodes.push(<h3 key={index}>{inlineMarkup(line.slice(4))}</h3>);
    else if(line.startsWith('## '))nodes.push(<h2 key={index}>{inlineMarkup(line.slice(3))}</h2>);
    else if(line.startsWith('# '))nodes.push(<h2 key={index}>{inlineMarkup(line.slice(2))}</h2>);
    else nodes.push(<p key={index}>{inlineMarkup(line)}</p>);
  });
  flushBullets();
  return <>{nodes}</>;
}

function PrivacyRequest(){
  const {t}=useLanguage();
  const [done,setDone]=useState(false);
  const request=useMutation({mutationFn:(body:any)=>api('/public/privacy-requests',{method:'POST',body:JSON.stringify(body)}),onSuccess:()=>setDone(true)});
  return <section className="privacy-request" aria-labelledby="privacy-request-title"><ShieldCheck aria-hidden="true"/><h2 id="privacy-request-title">{t('בקשה בנוגע למידע אישי','Personal data request')}</h2>{done?<div className="success-box" role="status" aria-live="polite">{t('הבקשה התקבלה ותועבר לטיפול.','Your request was received and will be reviewed.')}</div>:<form onSubmit={e=>{e.preventDefault();request.mutate(Object.fromEntries(new FormData(e.currentTarget)))}}><div className="form-grid"><label>{t('דוא״ל','Email')}<input name="email" type="email" autoComplete="email" required/></label><label>{t('סוג בקשה','Request type')}<select name="requestType"><option value="ACCESS">{t('עיון במידע','Access')}</option><option value="CORRECTION">{t('תיקון מידע','Correction')}</option><option value="DELETION">{t('מחיקה/אנונימיזציה','Deletion / anonymization')}</option><option value="MARKETING_OPT_OUT">{t('הסרה משיווק','Marketing opt-out')}</option></select></label></div><label>{t('פרטים','Details')}<textarea name="details" rows={4}/></label>{request.error&&<ErrorBox error={request.error}/>}<button className="button primary" disabled={request.isPending}>{request.isPending?t('שולח...','Sending...'):t('שליחת בקשה','Send request')}</button></form>}</section>;
}
