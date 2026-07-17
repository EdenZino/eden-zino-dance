import { ChevronLeft, ChevronRight, Expand, Film, Images, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import type { GalleryItem } from '../lib/types';
import { ErrorBox, Loading } from '../components/Loading';

export function GalleryPage() {
  const query = useQuery({ queryKey: ['gallery'], queryFn: () => api<{ items: GalleryItem[] }>('/public/gallery') });
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const items = query.data?.items ?? [];
  const selected = selectedIndex === null ? null : items[selectedIndex];

  useEffect(() => {
    if (!selected) return;
    document.body.classList.add('modal-open');
    const close = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setSelectedIndex(null);
      if (event.key === 'ArrowLeft') setSelectedIndex((current) => current === null ? null : (current + 1) % items.length);
      if (event.key === 'ArrowRight') setSelectedIndex((current) => current === null ? null : (current - 1 + items.length) % items.length);
    };
    document.addEventListener('keydown', close);
    return () => {
      document.removeEventListener('keydown', close);
      document.body.classList.remove('modal-open');
    };
  }, [selected, items.length]);

  if (query.isLoading) return <Loading label="טוענים את הגלריה..."/>;
  if (query.error) return <ErrorBox error={query.error}/>;

  return <div className="gallery-page section-pad">
    <header className="page-heading">
      <span className="eyebrow">EDEN ZINO · GALLERY</span>
      <h1>רגעים מהרחבה</h1>
      <p>תמונות וסרטונים מתוך הסדנאות, השיעורים והאנרגיה שנוצרת יחד.</p>
    </header>

    {items.length ? <div className="public-gallery-grid">
      {items.map((item, index) => <article className="public-gallery-card" key={item.id}>
        <div className="public-gallery-media">
          {item.media_type === 'VIDEO'
            ? <video controls playsInline preload="metadata" aria-label={item.alt_text || item.title || 'סרטון מהגלריה'}><source src={item.public_url} type={item.content_type}/></video>
            : <button type="button" className="gallery-image-button" onClick={() => setSelectedIndex(index)} aria-label={`פתיחת ${item.title || 'תמונה'} בתצוגה מוגדלת`}><img src={item.public_url} alt={item.alt_text || item.title || 'תמונה מהגלריה'} loading="lazy"/></button>}
          <span className="gallery-kind" aria-hidden="true">{item.media_type === 'VIDEO' ? <Film/> : <Images/>}</span>
          <button type="button" className="gallery-expand" onClick={() => setSelectedIndex(index)} aria-label={`פתיחת ${item.title || (item.media_type === 'VIDEO' ? 'סרטון' : 'תמונה')} בתצוגה מלאה`}><Expand/></button>
        </div>
        {(item.title || item.caption) && <div className="public-gallery-copy">{item.title && <h2>{item.title}</h2>}{item.caption && <p>{item.caption}</p>}</div>}
      </article>)}
    </div> : <div className="empty-state"><Images/><h2>הגלריה מתמלאת בקרוב</h2><p>תמונות וסרטונים חדשים יופיעו כאן לאחר העלאתם דרך ממשק הניהול.</p></div>}

    {selected && <div className="gallery-lightbox" role="dialog" aria-modal="true" aria-label={selected.title || 'תצוגת גלריה'} onMouseDown={(event) => { if (event.target === event.currentTarget) setSelectedIndex(null); }}>
      <button type="button" className="gallery-lightbox-close" onClick={() => setSelectedIndex(null)} aria-label="סגירת התצוגה"><X/></button>
      {items.length > 1 && <button type="button" className="gallery-lightbox-nav previous" onClick={() => setSelectedIndex((selectedIndex! - 1 + items.length) % items.length)} aria-label="הפריט הקודם"><ChevronRight/></button>}
      <div className="gallery-lightbox-content">
        {selected.media_type === 'VIDEO'
          ? <video controls autoPlay playsInline><source src={selected.public_url} type={selected.content_type}/></video>
          : <img src={selected.public_url} alt={selected.alt_text || selected.title || 'תמונה מהגלריה'}/>} 
        {(selected.title || selected.caption) && <div><h2>{selected.title}</h2><p>{selected.caption}</p></div>}
      </div>
      {items.length > 1 && <button type="button" className="gallery-lightbox-nav next" onClick={() => setSelectedIndex((selectedIndex! + 1) % items.length)} aria-label="הפריט הבא"><ChevronLeft/></button>}
    </div>}
  </div>;
}
