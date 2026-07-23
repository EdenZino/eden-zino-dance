import { Camera, Languages, Menu, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useQuery } from '@tanstack/react-query';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { api } from '../lib/api';
import type { SiteData } from '../lib/types';
import { useLanguage } from '../lib/language';
import { normalizeClassicPalette, normalizePublicTheme, PublicThemeContext, type ClassicPalette, type PublicTheme } from '../lib/theme';

export function Brand({ onNavigate }: { onNavigate?: () => void } = {}) {
  const { t } = useLanguage();
  return <Link className="brand" to="/" aria-label={t('Eden Zino - דף הבית','Eden Zino - Home')} onClick={onNavigate}><span className="brand-mark" aria-hidden="true">EZ</span><span><b>EDEN ZINO</b></span></Link>;
}

function LanguageSwitch({ compact=false }: { compact?: boolean }) {
  const { language, setLanguage, t } = useLanguage();
  return <div className={`language-switch${compact?' compact':''}`} aria-label={t('בחירת שפה','Language selector')}><Languages size={17} aria-hidden="true"/><button type="button" className={language==='he'?'active':''} onClick={()=>setLanguage('he')} aria-pressed={language==='he'}>HE</button><span>/</span><button type="button" className={language==='en'?'active':''} onClick={()=>setLanguage('en')} aria-pressed={language==='en'}>EN</button></div>;
}

function NavigationLinks({ instagram, onNavigate }: { instagram: string; onNavigate?: () => void }) {
  const { t } = useLanguage();
  return <>
    <NavLink to="/" onClick={onNavigate}>{t('בית','Home')}</NavLink>
    <NavLink to="/workshops" onClick={onNavigate}>{t('סדנאות','Workshops')}</NavLink>
    <NavLink to="/products" onClick={onNavigate}>{t('כרטיסיות ומנויים','Passes & Memberships')}</NavLink>
    <NavLink to="/gallery" onClick={onNavigate}>{t('גלריה','Gallery')}</NavLink>
    <NavLink to="/my-registration" onClick={onNavigate}>{t('האזור שלי','My Area')}</NavLink>
    <NavLink to="/contact" onClick={onNavigate}>{t('יצירת קשר','Contact')}</NavLink>
    <a href={instagram} target="_blank" rel="noreferrer" aria-label={t('פתיחת האינסטגרם של עדן זינו בחלון חדש','Open Eden Zino Instagram in a new window')} onClick={onNavigate}><Camera size={19} aria-hidden="true"/><span className="mobile-only-label">Instagram</span></a>
  </>;
}

function MobileDrawer({ open, theme, palette, instagram, onClose }: { open: boolean; theme: PublicTheme; palette: ClassicPalette; instagram: string; onClose: () => void }) {
  const { t } = useLanguage();
  const drawerRef = useRef<HTMLElement>(null); const closeRef = useRef<HTMLButtonElement>(null); const restoreFocusRef = useRef<HTMLElement | null>(null);
  useEffect(() => { if (!open) return; restoreFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null; const frame=window.requestAnimationFrame(()=>closeRef.current?.focus()); const onKeyDown=(event:KeyboardEvent)=>{if(event.key==='Escape'){event.preventDefault();onClose();return;}if(event.key!=='Tab'||!drawerRef.current)return;const focusable=Array.from(drawerRef.current.querySelectorAll<HTMLElement>('a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])')).filter(node=>!node.hasAttribute('hidden'));if(!focusable.length)return;const first=focusable[0],last=focusable[focusable.length-1];if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}};document.addEventListener('keydown',onKeyDown);document.body.classList.add('menu-open');return()=>{window.cancelAnimationFrame(frame);document.removeEventListener('keydown',onKeyDown);document.body.classList.remove('menu-open');restoreFocusRef.current?.focus();};},[open,onClose]);
  if(!open)return null;
  return createPortal(<div className={`mobile-drawer-layer theme-${theme} palette-${palette}`} role="presentation"><button className="mobile-drawer-scrim" aria-label={t('סגירת התפריט','Close menu')} type="button" onClick={onClose}/><aside ref={drawerRef} id="mobile-navigation" className="mobile-drawer" aria-label={t('תפריט ראשי','Main menu')} aria-modal="true" role="dialog"><div className="mobile-drawer-header"><Brand onNavigate={onClose}/><button ref={closeRef} className="icon-button" type="button" aria-label={t('סגירת התפריט','Close menu')} onClick={onClose}><X aria-hidden="true"/></button></div><LanguageSwitch compact/><nav className="mobile-drawer-nav" aria-label={t('ניווט ראשי','Main navigation')}><NavigationLinks instagram={instagram} onNavigate={onClose}/></nav></aside></div>,document.body);
}

export function PublicLayout() {
  const { t } = useLanguage();
  const [open,setOpen]=useState(false); const location=useLocation(); const site=useQuery({queryKey:['site'],queryFn:()=>api<SiteData>('/public/site')}); const settings=site.data?.settings||{};
  const instagram=settings.instagram_url||'https://www.instagram.com/eden_zinooo/?hl=en'; const email=settings.contact_email||'hello@example.co.il'; const phone=settings.contact_phone||''; const address=settings.address||''; const closeMenu=useCallback(()=>setOpen(false),[]);
  const previewTheme=useMemo(()=>{const value=new URLSearchParams(location.search).get('theme');return value==='classic'||value==='modern'?value:null;},[location.search]); const previewPalette=useMemo(()=>normalizeClassicPalette(new URLSearchParams(location.search).get('palette')),[location.search]); const theme=previewTheme??normalizePublicTheme(settings.public_theme); const palette=previewTheme==='classic'?previewPalette:normalizeClassicPalette(settings.classic_palette);
  useEffect(()=>{setOpen(false);},[location.pathname]); useEffect(()=>{const media=window.matchMedia('(min-width: 801px)');const closeOnDesktop=()=>{if(media.matches)setOpen(false);};media.addEventListener('change',closeOnDesktop);return()=>media.removeEventListener('change',closeOnDesktop);},[]);
  return <PublicThemeContext.Provider value={{theme,classicPalette:palette}}><div className={`site-shell theme-${theme} palette-${palette}`} data-public-theme={theme} data-classic-palette={palette}><a className="skip-link" href="#main-content">{t('דילוג לתוכן הראשי','Skip to main content')}</a><header className="site-header"><Brand/><nav aria-label={t('ניווט ראשי','Main navigation')} className="main-nav desktop-nav"><NavigationLinks instagram={instagram}/></nav><div className="header-actions"><LanguageSwitch/><button className="icon-button mobile-menu" type="button" aria-label={open?t('סגירת תפריט','Close menu'):t('פתיחת תפריט','Open menu')} aria-expanded={open} aria-controls="mobile-navigation" onClick={()=>setOpen(value=>!value)}>{open?<X aria-hidden="true"/>:<Menu aria-hidden="true"/>}</button></div></header>{previewTheme&&<div className="theme-preview-banner" role="status"><span>{t('תצוגה מקדימה','Preview')}: {previewTheme==='classic'?`Classic · ${palette}`:'Modern'}</span><Link to="/">{t('סגירת תצוגה מקדימה','Close preview')}</Link></div>}<main id="main-content" tabIndex={-1}><Outlet/></main><footer className="site-footer"><div><Brand/><p>{t('סדנאות ריקוד שמחברות טכניקה, ביטחון ואנרגיה.','Dance workshops that connect technique, confidence and energy.')}</p>{address&&<small>{address}</small>}</div><div><h4>{t('מידע','Information')}</h4><Link to="/workshops">{t('סדנאות','Workshops')}</Link><Link to="/products">{t('כרטיסיות ומנויים','Passes & Memberships')}</Link><Link to="/gallery">{t('גלריה','Gallery')}</Link><Link to="/legal/TERMS">{t('תנאי שימוש','Terms')}</Link><Link to="/legal/PRIVACY">{t('פרטיות','Privacy')}</Link><Link to="/legal/CANCELLATION">{t('ביטולים','Cancellations')}</Link><Link to="/legal/ACCESSIBILITY">{t('נגישות','Accessibility')}</Link></div><div><h4>{t('יצירת קשר','Contact')}</h4><a href={`mailto:${email}`}>{email}</a>{phone&&<a href={`tel:${phone}`}>{phone}</a>}<Link to="/admin">{t('כניסת מנהלים','Admin login')}</Link></div><small>© {new Date().getFullYear()} Eden Zino. {t('כל הזכויות שמורות.','All rights reserved.')}</small></footer></div><MobileDrawer open={open} theme={theme} palette={palette} instagram={instagram} onClose={closeMenu}/></PublicThemeContext.Provider>;
}
