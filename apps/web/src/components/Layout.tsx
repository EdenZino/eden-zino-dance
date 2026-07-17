import { Camera, Menu, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useQuery } from '@tanstack/react-query';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { api } from '../lib/api';
import type { SiteData } from '../lib/types';
import { normalizeClassicPalette, normalizePublicTheme, PublicThemeContext, type ClassicPalette, type PublicTheme } from '../lib/theme';

export function Brand({ onNavigate }: { onNavigate?: () => void } = {}) {
  return <Link className="brand" to="/" aria-label="Eden Zino Dance - דף הבית" onClick={onNavigate}><span className="brand-mark" aria-hidden="true">EZ</span><span><b>EDEN ZINO</b><small>DANCE</small></span></Link>;
}

function NavigationLinks({ instagram, onNavigate }: { instagram: string; onNavigate?: () => void }) {
  return <>
    <NavLink to="/" onClick={onNavigate}>בית</NavLink>
    <NavLink to="/workshops" onClick={onNavigate}>סדנאות</NavLink>
    <NavLink to="/products" onClick={onNavigate}>כרטיסיות ומנויים</NavLink>
    <NavLink to="/gallery" onClick={onNavigate}>גלריה</NavLink>
    <NavLink to="/my-registration" onClick={onNavigate}>האזור שלי</NavLink>
    <NavLink to="/contact" onClick={onNavigate}>יצירת קשר</NavLink>
    <a href={instagram} target="_blank" rel="noreferrer" aria-label="פתיחת האינסטגרם של עדן זינו בחלון חדש" onClick={onNavigate}><Camera size={19} aria-hidden="true"/><span className="mobile-only-label">אינסטגרם</span></a>
  </>;
}

function MobileDrawer({ open, theme, palette, instagram, onClose }: { open: boolean; theme: PublicTheme; palette: ClassicPalette; instagram: string; onClose: () => void }) {
  const drawerRef = useRef<HTMLElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    restoreFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const frame = window.requestAnimationFrame(() => closeRef.current?.focus());
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== 'Tab' || !drawerRef.current) return;
      const focusable = Array.from(drawerRef.current.querySelectorAll<HTMLElement>('a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])')).filter((node) => !node.hasAttribute('hidden'));
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    document.body.classList.add('menu-open');
    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener('keydown', onKeyDown);
      document.body.classList.remove('menu-open');
      restoreFocusRef.current?.focus();
    };
  }, [open, onClose]);

  if (!open) return null;
  return createPortal(
    <div className={`mobile-drawer-layer theme-${theme} palette-${palette}`} role="presentation">
      <button className="mobile-drawer-scrim" aria-label="סגירת התפריט" type="button" onClick={onClose}/>
      <aside ref={drawerRef} id="mobile-navigation" className="mobile-drawer" aria-label="תפריט ראשי" aria-modal="true" role="dialog">
        <div className="mobile-drawer-header"><Brand onNavigate={onClose}/><button ref={closeRef} className="icon-button" type="button" aria-label="סגירת התפריט" onClick={onClose}><X aria-hidden="true"/></button></div>
        <nav className="mobile-drawer-nav" aria-label="ניווט ראשי"><NavigationLinks instagram={instagram} onNavigate={onClose}/></nav>
      </aside>
    </div>,
    document.body,
  );
}

export function PublicLayout() {
  const [open, setOpen] = useState(false);
  const location = useLocation();
  const site = useQuery({ queryKey: ['site'], queryFn: () => api<SiteData>('/public/site') });
  const settings = site.data?.settings || {};
  const instagram = settings.instagram_url || 'https://www.instagram.com/eden_zinooo/?hl=en';
  const email = settings.contact_email || 'hello@example.co.il';
  const phone = settings.contact_phone || '';
  const address = settings.address || '';
  const closeMenu = useCallback(() => setOpen(false), []);
  const previewTheme = useMemo(() => {
    const value = new URLSearchParams(location.search).get('theme');
    return value === 'classic' || value === 'modern' ? value : null;
  }, [location.search]);
  const previewPalette = useMemo(() => normalizeClassicPalette(new URLSearchParams(location.search).get('palette')), [location.search]);
  const theme = previewTheme ?? normalizePublicTheme(settings.public_theme);
  const palette = previewTheme === 'classic' ? previewPalette : normalizeClassicPalette(settings.classic_palette);

  useEffect(() => { setOpen(false); }, [location.pathname]);
  useEffect(() => {
    const media = window.matchMedia('(min-width: 801px)');
    const closeOnDesktop = () => { if (media.matches) setOpen(false); };
    media.addEventListener('change', closeOnDesktop);
    return () => media.removeEventListener('change', closeOnDesktop);
  }, []);

  return <PublicThemeContext.Provider value={{ theme, classicPalette: palette }}>
    <div className={`site-shell theme-${theme} palette-${palette}`} data-public-theme={theme} data-classic-palette={palette}>
      <a className="skip-link" href="#main-content">דילוג לתוכן הראשי</a>
      <header className="site-header">
        <Brand />
        <nav aria-label="ניווט ראשי" className="main-nav desktop-nav"><NavigationLinks instagram={instagram}/></nav>
        <button className="icon-button mobile-menu" type="button" aria-label={open ? 'סגירת תפריט' : 'פתיחת תפריט'} aria-expanded={open} aria-controls="mobile-navigation" onClick={() => setOpen((value) => !value)}>{open ? <X aria-hidden="true" /> : <Menu aria-hidden="true" />}</button>
      </header>
      {previewTheme && <div className="theme-preview-banner" role="status"><span>תצוגה מקדימה: {previewTheme === 'classic' ? `Classic · ${palette}` : 'Modern'}</span><Link to="/">סגירת תצוגה מקדימה</Link></div>}
      <main id="main-content" tabIndex={-1}><Outlet /></main>
      <footer className="site-footer">
        <div><Brand/><p>סדנאות ריקוד שמחברות טכניקה, ביטחון ואנרגיה.</p>{address && <small>{address}</small>}</div>
        <div><h4>מידע</h4><Link to="/workshops">סדנאות</Link><Link to="/products">כרטיסיות ומנויים</Link><Link to="/gallery">גלריה</Link><Link to="/legal/TERMS">תנאי שימוש</Link><Link to="/legal/PRIVACY">פרטיות</Link><Link to="/legal/CANCELLATION">ביטולים</Link><Link to="/legal/ACCESSIBILITY">נגישות</Link></div>
        <div><h4>יצירת קשר</h4><a href={`mailto:${email}`}>{email}</a>{phone && <a href={`tel:${phone}`}>{phone}</a>}<Link to="/admin">כניסת מנהלים</Link></div>
        <small>© {new Date().getFullYear()} Eden Zino Dance. כל הזכויות שמורות.</small>
      </footer>
    </div>
    <MobileDrawer open={open} theme={theme} palette={palette} instagram={instagram} onClose={closeMenu}/>
  </PublicThemeContext.Provider>;
}
