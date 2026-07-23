import { ArrowLeft, ArrowRight, CalendarDays, MapPin, Users } from 'lucide-react';
import { Link } from 'react-router-dom';
import { dateTime, money } from '../lib/api';
import { useLanguage } from '../lib/language';
import type { Workshop } from '../lib/types';

export function WorkshopCard({ workshop }: { workshop: Workshop }) {
  const { language, t, localize } = useLanguage(); const soldOut=workshop.available<=0; const activePrice=workshop.early_bird_price_agorot&&workshop.early_bird_ends_at&&new Date(workshop.early_bird_ends_at)>new Date()?workshop.early_bird_price_agorot:workshop.price_agorot; const Arrow=language==='he'?ArrowLeft:ArrowRight;
  return <article className="workshop-card"><div className="card-media" style={workshop.image_url?{backgroundImage:`url(${workshop.image_url})`}:undefined}>{!workshop.image_url&&<div className="image-placeholder"><span>EDEN</span><b>ZINO</b></div>}<span className={soldOut?'status-badge sold':'status-badge'}>{soldOut?t('מלאה','Sold out'):t(`${workshop.available} מקומות`,`${workshop.available} spots`)}</span></div><div className="card-body"><div className="micro">{localize(workshop,'level')||t('כל הרמות','All levels')} · {localize(workshop,'audience')||t('סדנה פתוחה','Open workshop')}</div><h3>{localize(workshop,'title')}</h3><p>{localize(workshop,'short_description')}</p><div className="card-facts"><span><CalendarDays/> {dateTime(workshop.starts_at,language)}</span><span><MapPin/> {localize(workshop,'location_name')}</span><span><Users/> {t(`עד ${workshop.capacity} משתתפים`,`Up to ${workshop.capacity} participants`)}</span></div><div className="card-footer"><strong>{money(activePrice,workshop.currency,language)}</strong><Link className="text-link" to={`/w/${workshop.public_code}`}>{soldOut?t('רשימת המתנה','Waitlist'):t('לפרטים והרשמה','Details & registration')} <Arrow size={17}/></Link></div></div></article>;
}
