import { Camera, Menu, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import type { SiteData } from '../lib/types';
import { Link, NavLink, Outlet } from 'react-router-dom';

export function Brand() {
  return <Link className="brand" to="/" aria-label="Eden Zino Dance - דף הבית"><span className="brand-mark" aria-hidden="true">EZ</span><span><b>EDEN ZINO</b><small>DANCE</small></span></Link>;
}

export function PublicLayout() {
  const [open, setOpen] = useState(false);
  const site = useQuery({ queryKey: ['site'], queryFn: () => api<SiteData>('/public/site') });
  const settings = site.data?.settings || {};
  const instagram = settings.instagram_url || 'https://www.instagram.com/eden_zinooo/?hl=en';
  const email = settings.contact_email || 'hello@example.co.il';
  const phone = settings.contact_phone || '';
  const address = settings.address || '';

  useEffect(() => {
    const close = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false); };
    document.addEventListener('keydown', close);
    document.body.classList.toggle('menu-open', open);
    return () => { document.removeEventListener('keydown', close); document.body.classList.remove('menu-open'); };
  }, [open]);

  return <div className="site-shell">
    <a className="skip-link" href="#main-content">דילוג לתוכן הראשי</a>
    <header className="site-header">
      <Brand />
      <button className="icon-button mobile-menu" type="button" aria-label={open ? 'סגירת תפריט' : 'פתיחת תפריט'} aria-expanded={open} aria-controls="primary-navigation" onClick={() => setOpen(!open)}>{open ? <X aria-hidden="true" /> : <Menu aria-hidden="true" />}</button>
      <nav id="primary-navigation" aria-label="ניווט ראשי" className={open ? 'main-nav open' : 'main-nav'} onClick={() => setOpen(false)}>
        <NavLink to="/">בית</NavLink><NavLink to="/workshops">סדנאות</NavLink><NavLink to="/products">כרטיסיות ומנויים</NavLink><NavLink to="/my-registration">האזור שלי</NavLink><NavLink to="/contact">יצירת קשר</NavLink>
        <a href={instagram} target="_blank" rel="noreferrer" aria-label="פתיחת האינסטגרם של עדן זינו בחלון חדש"><Camera size={19} aria-hidden="true"/><span className="mobile-only-label">אינסטגרם</span></a>
      </nav>
      {open && <button className="nav-scrim" aria-label="סגירת התפריט" type="button" onClick={() => setOpen(false)} />}
    </header>
    <main id="main-content" tabIndex={-1}><Outlet /></main>
    <footer className="site-footer">
      <div><Brand/><p>סדנאות ריקוד שמחברות טכניקה, ביטחון ואנרגיה.</p>{address && <small>{address}</small>}</div>
      <div><h4>מידע</h4><Link to="/workshops">סדנאות</Link><Link to="/products">כרטיסיות ומנויים</Link><Link to="/legal/TERMS">תנאי שימוש</Link><Link to="/legal/PRIVACY">פרטיות</Link><Link to="/legal/CANCELLATION">ביטולים</Link><Link to="/legal/ACCESSIBILITY">נגישות</Link></div>
      <div><h4>יצירת קשר</h4><a href={`mailto:${email}`}>{email}</a>{phone && <a href={`tel:${phone}`}>{phone}</a>}<Link to="/admin">כניסת מנהלים</Link></div>
      <small>© {new Date().getFullYear()} Eden Zino Dance. כל הזכויות שמורות.</small>
    </footer>
  </div>;
}
