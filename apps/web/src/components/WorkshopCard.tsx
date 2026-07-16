import { ArrowLeft, CalendarDays, MapPin, Users } from 'lucide-react';
import { Link } from 'react-router-dom';
import { dateTime, money } from '../lib/api';
import type { Workshop } from '../lib/types';

export function WorkshopCard({ workshop }: { workshop: Workshop }) {
  const soldOut = workshop.available <= 0;
  const activePrice = workshop.early_bird_price_agorot && workshop.early_bird_ends_at && new Date(workshop.early_bird_ends_at) > new Date() ? workshop.early_bird_price_agorot : workshop.price_agorot;
  return <article className="workshop-card">
    <div className="card-media" style={workshop.image_url ? { backgroundImage: `url(${workshop.image_url})` } : undefined}>
      {!workshop.image_url && <div className="image-placeholder"><span>EDEN</span><b>DANCE</b></div>}
      <span className={soldOut ? 'status-badge sold' : 'status-badge'}>{soldOut ? 'מלאה' : `${workshop.available} מקומות`}</span>
    </div>
    <div className="card-body">
      <div className="micro">{workshop.level || 'כל הרמות'} · {workshop.audience || 'סדנה פתוחה'}</div>
      <h3>{workshop.title}</h3><p>{workshop.short_description}</p>
      <div className="card-facts"><span><CalendarDays/> {dateTime(workshop.starts_at)}</span><span><MapPin/> {workshop.location_name}</span><span><Users/> עד {workshop.capacity} משתתפים</span></div>
      <div className="card-footer"><strong>{money(activePrice, workshop.currency)}</strong><Link className="text-link" to={`/w/${workshop.public_code}`}>{soldOut ? 'רשימת המתנה' : 'לפרטים והרשמה'} <ArrowLeft size={17}/></Link></div>
    </div>
  </article>;
}
