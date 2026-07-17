import { ArrowLeft, Camera, ShieldCheck, Sparkles, TicketCheck, Users } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import type { SiteData, Workshop } from '../lib/types';
import { WorkshopCard } from '../components/WorkshopCard';
import { ErrorBox, Loading } from '../components/Loading';

export function HomePage() {
  const site = useQuery({ queryKey: ['site'], queryFn: () => api<SiteData>('/public/site') });
  const workshops = useQuery({ queryKey: ['workshops'], queryFn: () => api<{ workshops: Workshop[] }>('/public/workshops') });
  if (site.isLoading || workshops.isLoading) return <Loading label="מכינים את הרחבה..."/>;
  if (site.error || workshops.error) return <ErrorBox error={site.error || workshops.error}/>;
  const home = site.data?.content.home || {};
  const instructor = site.data?.content.instructor || {};
  const heroImg = home.heroImage || '/images/hero.jpg';
  const portraitImg = instructor.portraitUrl || '/images/instructor.jpg';
  return <>
    {home.announcement && <div className="announcement">{home.announcement}</div>}
    <section className="hero section-pad">
      <div className="hero-copy">
        <span className="eyebrow">{home.eyebrow || 'MOVE. FEEL. GROW.'}</span>
        <h1>{home.heroTitle || 'לרקוד בביטחון. להשתחרר באמת.'}</h1>
        <p>{home.heroSubtitle || 'סדנאות ריקוד מקצועיות, אנרגטיות ומדויקות בהנחיית עדן זינו.'}</p>
        <div className="hero-actions"><Link className="button primary" to="/workshops">{home.ctaPrimary || 'לסדנאות הקרובות'} <ArrowLeft/></Link><Link className="button ghost" to="/workshops#code">{home.ctaSecondary || 'יש לי קוד סדנה'}</Link></div>
        <div className="trust-row"><span><ShieldCheck/> תשלום מאובטח</span><span><TicketCheck/> אישור מיידי</span><span><Users/> קבוצות מוגבלות</span></div>
      </div>
      <div className="hero-visual" style={{ backgroundImage: `url(${heroImg})` }}>
        <div className="vertical-copy">EDEN ZINO · DANCE WORKSHOPS</div>
      </div>
    </section>

    <section className="section-pad dark-section">
      <div className="section-heading"><span className="eyebrow">UPCOMING</span><h2>הסדנאות הקרובות</h2><p>בחרו סדנה, שמרו מקום והגיעו לרקוד.</p></div>
      <div className="workshop-grid">{workshops.data?.workshops.slice(0, 3).map(w => <WorkshopCard key={w.id} workshop={w}/>)}</div>
      {!workshops.data?.workshops.length && <div className="empty-state"><Sparkles/><h3>הסדנה הבאה בדרך</h3><p>עדן תפרסם כאן את הסדנאות החדשות דרך ממשק הניהול.</p></div>}
      <div className="center-action"><Link className="button light" to="/workshops">לכל הסדנאות <ArrowLeft/></Link></div>
    </section>

    <section className="section-pad studio-gallery">
      <div className="section-heading"><span className="eyebrow">INSIDE THE STUDIO</span><h2>רגעים מהרחבה</h2><p>קצת מהאנרגיה, מהתנועה ומהקהילה שנוצרת בכל סדנה.</p></div>
      <div className="gallery-grid">
        <figure className="gallery-a" style={{ backgroundImage: 'url(/images/gallery-1.jpg)' }}/>
        <figure className="gallery-b" style={{ backgroundImage: 'url(/images/gallery-2.jpg)' }}/>
        <figure className="gallery-c" style={{ backgroundImage: 'url(/images/gallery-3.jpg)' }}/>
        <figure className="gallery-d" style={{ backgroundImage: 'url(/images/gallery-4.jpg)' }}/>
      </div>
    </section>

    <section className="section-pad instructor-section">
      <div className="portrait-panel" style={{ backgroundImage: `url(${portraitImg})` }}/>
      <div className="instructor-copy"><span className="eyebrow">MEET YOUR INSTRUCTOR</span><h2>{instructor.name || 'עדן זינו'}</h2><h3>{instructor.headline || 'מדריכה, יוצרת ורקדנית'}</h3><p>{instructor.bio || 'הוסיפי כאן דרך ממשק הניהול את הרקע המקצועי והאישי של עדן.'}</p><blockquote>{instructor.teachingApproach || 'הוסיפי כאן את שיטת הלימוד, הערכים והחוויה שהתלמידים מקבלים.'}</blockquote><a className="button outline" href={instructor.instagramUrl || 'https://www.instagram.com/eden_zinooo/?hl=en'} target="_blank" rel="noreferrer"><Camera/> Instagram</a></div>
    </section>

    <section className="section-pad code-banner"><div><span className="eyebrow">PRIVATE WORKSHOP</span><h2>קיבלת קוד סדנה?</h2><p>הזיני אותו וקבלי מיד את כל הפרטים, המחיר וההרשמה.</p></div><CodeBox/></section>
  </>;
}

function CodeBox() {
  return <form className="code-box" onSubmit={(e) => { e.preventDefault(); const code = new FormData(e.currentTarget).get('code'); if (code) location.href = `/w/${String(code).trim().toUpperCase()}`; }}><label htmlFor="home-code">קוד הסדנה</label><div><input id="home-code" name="code" placeholder="לדוגמה: EZ7K4M2" required/><button className="button primary">פתיחת סדנה <ArrowLeft/></button></div></form>;
}
