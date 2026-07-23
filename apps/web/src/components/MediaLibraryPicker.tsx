import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Check, Image as ImageIcon, Search, X } from 'lucide-react';
import { api } from '../lib/api';
import { useDialogFocusTrap } from '../lib/accessibility';
import { ErrorBox, Loading } from './Loading';

export type MediaLibraryItem = {
  id: string;
  object_key: string;
  public_url: string;
  file_name: string;
  content_type: string;
  created_at: string;
  gallery_item_id?: string | null;
  title?: string | null;
  title_en?: string | null;
  alt_text?: string | null;
  alt_text_en?: string | null;
  is_published?: boolean | null;
  source: 'GALLERY' | 'MEDIA_LIBRARY';
};

export function MediaLibraryPicker({ open, onClose, onSelect, currentValue = '', availableForGallery = false }: {
  open: boolean;
  onClose: () => void;
  onSelect: (item: MediaLibraryItem) => void;
  currentValue?: string;
  availableForGallery?: boolean;
}) {
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const dialogRef = useRef<HTMLDivElement>(null);
  useDialogFocusTrap(open, dialogRef, onClose);
  useEffect(() => {
    const id = window.setTimeout(() => setDebouncedSearch(search.trim()), 250);
    return () => window.clearTimeout(id);
  }, [search]);
  const params = new URLSearchParams();
  if (debouncedSearch) params.set('q', debouncedSearch);
  if (availableForGallery) params.set('availableForGallery', 'true');
  const queryString = params.toString();
  const query = useQuery({
    queryKey: ['admin-media-library', debouncedSearch, availableForGallery],
    queryFn: () => api<{ items: MediaLibraryItem[] }>(`/admin/media/library${queryString ? `?${queryString}` : ''}`),
    enabled: open,
    staleTime: 20_000,
  });
  if (!open) return null;
  const items = query.data?.items ?? [];
  return <div className="modal-backdrop media-library-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <div ref={dialogRef} tabIndex={-1} className="modal media-library-modal" role="dialog" aria-modal="true" aria-labelledby="media-library-title">
      <button type="button" className="modal-close" onClick={onClose} aria-label="סגירת ספריית התמונות"><X aria-hidden="true"/></button>
      <div className="modal-head media-library-head">
        <span className="eyebrow">MEDIA LIBRARY</span>
        <h2 id="media-library-title">בחירה מתמונות קיימות</h2>
        <p>{availableForGallery ? 'מוצגות תמונות שכבר הועלו לשרת ועדיין אינן חלק מהגלריה.' : 'החיפוש כולל תמונות מהגלריה ותמונות אחרות שכבר הועלו לשרת דרך המערכת.'}</p>
      </div>
      <label className="media-library-search" htmlFor="media-library-search-input"><span>חיפוש תמונה</span><div><Search aria-hidden="true"/><input id="media-library-search-input" value={search} onChange={e => setSearch(e.target.value)} placeholder="שם קובץ, כותרת, תיאור או object key" autoComplete="off"/></div></label>
      {query.isLoading ? <Loading label="טוען את ספריית התמונות..."/> : query.error ? <ErrorBox error={query.error}/> : items.length ? <div className="media-library-grid" aria-label="תוצאות חיפוש תמונות">
        {items.map(item => {
          const selected = currentValue === item.public_url;
          const label = item.title || item.title_en || item.file_name;
          return <button type="button" className={`media-library-card${selected ? ' selected' : ''}`} key={item.id} onClick={() => onSelect(item)} aria-label={`בחירת התמונה ${label}`}>
            <span className="media-library-thumb"><img src={item.public_url} alt={item.alt_text || item.alt_text_en || ''} loading="lazy"/>{selected && <span className="media-selected-mark" aria-hidden="true"><Check/></span>}</span>
            <span className="media-library-copy"><b>{label}</b><small>{item.source === 'GALLERY' ? 'גלריה' : 'ספריית מדיה'}{item.gallery_item_id && item.is_published === false ? ' · לא פורסם' : ''}</small><code title={item.object_key}>{item.object_key}</code></span>
          </button>;
        })}
      </div> : <div className="empty-state media-library-empty"><ImageIcon aria-hidden="true"/><h3>לא נמצאו תמונות</h3><p>{search ? 'נסי מונח חיפוש אחר.' : availableForGallery ? 'כל התמונות הקיימות כבר משויכות לגלריה, או שעדיין לא הועלו תמונות נוספות.' : 'עדיין לא הועלו תמונות לספריית המדיה.'}</p></div>}
      <div className="media-library-footer"><small role="status">{query.isFetching && !query.isLoading ? 'מעדכן תוצאות…' : `נמצאו ${items.length} תמונות. מוצגות עד 120 תוצאות.`}</small><button type="button" className="button outline" onClick={onClose}>סגירה</button></div>
    </div>
  </div>;
}
