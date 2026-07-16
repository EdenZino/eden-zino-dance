import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search } from 'lucide-react';
import { api } from '../lib/api';
import type { Workshop } from '../lib/types';
import { WorkshopCard } from '../components/WorkshopCard';
import { ErrorBox, Loading } from '../components/Loading';

export function WorkshopsPage() {
  const query = useQuery({ queryKey: ['workshops'], queryFn: () => api<{ workshops: Workshop[] }>('/public/workshops') });
  const [search, setSearch] = useState(''); const [level, setLevel] = useState('');
  const items = useMemo(() => (query.data?.workshops || []).filter(w => (!search || `${w.title} ${w.location_name} ${w.short_description}`.toLowerCase().includes(search.toLowerCase())) && (!level || w.level === level)), [query.data, search, level]);
  const levels = [...new Set((query.data?.workshops || []).map(w => w.level).filter(Boolean))];
  return <div className="page-wrap section-pad"><div className="page-hero"><span className="eyebrow">WORKSHOPS</span><h1>בחרו את הסדנה שלכם</h1><p>קבוצות מדויקות, יחס אישי וחוויה שממשיכה גם אחרי שהמוזיקה נעצרת.</p></div>
    <div className="filter-bar"><label className="search-field"><Search/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="חיפוש לפי שם או מיקום"/></label><select value={level} onChange={e=>setLevel(e.target.value)}><option value="">כל הרמות</option>{levels.map(l=><option key={l}>{l}</option>)}</select></div>
    {query.isLoading ? <Loading/> : query.error ? <ErrorBox error={query.error}/> : <div className="workshop-grid light-grid">{items.map(w=><WorkshopCard key={w.id} workshop={w}/>)}</div>}
    <section id="code" className="inline-code"><h2>יש לך קוד לסדנה פרטית?</h2><form onSubmit={e=>{e.preventDefault();const code=new FormData(e.currentTarget).get('code');if(code)location.href=`/w/${String(code).trim().toUpperCase()}`}}><input name="code" placeholder="קוד סדנה" required/><button className="button primary">פתיחה</button></form></section>
  </div>;
}
