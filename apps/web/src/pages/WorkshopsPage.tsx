import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Search } from 'lucide-react';
import { api } from '../lib/api';
import type { Workshop } from '../lib/types';
import { WORKSHOP_LEVELS } from '../lib/workshopLevels';
import { WorkshopCard } from '../components/WorkshopCard';
import { ErrorBox, Loading } from '../components/Loading';

export function WorkshopsPage() {
  const query = useQuery({
    queryKey: ['workshops'],
    queryFn: () => api<{ workshops: Workshop[] }>('/public/workshops'),
  });
  const [search, setSearch] = useState('');
  const [level, setLevel] = useState('');

  const workshops = query.data?.workshops || [];

  const levels = useMemo(() => {
    const configured = workshops
      .map((workshop) => workshop.level?.trim())
      .filter((value): value is string => Boolean(value));
    const custom = configured.filter(
      (value) => !(WORKSHOP_LEVELS as readonly string[]).includes(value),
    );
    return [...WORKSHOP_LEVELS, ...new Set(custom)];
  }, [workshops]);

  const items = useMemo(
    () => workshops.filter((workshop) => {
      const matchesSearch = !search || `${workshop.title} ${workshop.location_name} ${workshop.short_description}`
        .toLowerCase()
        .includes(search.toLowerCase());
      const workshopLevel = workshop.level?.trim() || 'פתוח לכל הרמות';
      return matchesSearch && (!level || workshopLevel === level);
    }),
    [workshops, search, level],
  );

  return (
    <div className="page-wrap section-pad">
      <div className="page-hero">
        <span className="eyebrow">WORKSHOPS</span>
        <h1>בחרו את הסדנה שלכם</h1>
        <p>קבוצות מדויקות, יחס אישי וחוויה שממשיכה גם אחרי שהמוזיקה נעצרת.</p>
      </div>

      <div className="filter-bar" role="search" aria-label="סינון סדנאות">
        <label className="search-field">
          <span className="sr-only">חיפוש סדנה</span>
          <Search aria-hidden="true" />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="חיפוש לפי שם או מיקום"
            type="search"
          />
        </label>
        <label className="level-field">
          <span className="sr-only">סינון לפי רמה</span>
          <select
            className="level-filter"
            value={level}
            onChange={(event) => setLevel(event.target.value)}
          >
            <option value="">כל הרמות</option>
            {levels.map((workshopLevel) => (
              <option key={workshopLevel} value={workshopLevel}>{workshopLevel}</option>
            ))}
          </select>
        </label>
      </div>

      {query.isLoading ? (
        <Loading />
      ) : query.error ? (
        <ErrorBox error={query.error} />
      ) : items.length ? (
        <div className="workshop-grid light-grid">
          {items.map((workshop) => <WorkshopCard key={workshop.id} workshop={workshop} />)}
        </div>
      ) : (
        <div className="empty-state light-empty" role="status">
          <Search aria-hidden="true" />
          <h2>לא נמצאו סדנאות מתאימות</h2>
          <p>נסו לשנות את החיפוש או לבחור רמה אחרת.</p>
        </div>
      )}

      <section id="code" className="inline-code">
        <div>
          <h2>יש לך קוד לסדנה פרטית?</h2>
          <p>הזינו את הקוד שקיבלתם כדי לפתוח את פרטי הסדנה והרישום.</p>
        </div>
        <form onSubmit={(event) => {
          event.preventDefault();
          const code = new FormData(event.currentTarget).get('code');
          if (code) location.href = `/w/${String(code).trim().toUpperCase()}`;
        }}>
          <label className="sr-only" htmlFor="private-workshop-code">קוד סדנה</label>
          <input
            id="private-workshop-code"
            name="code"
            placeholder="קוד סדנה"
            autoCapitalize="characters"
            required
          />
          <button type="submit" className="button primary code-open-button">
            פתיחה <ArrowLeft size={18} aria-hidden="true" />
          </button>
        </form>
      </section>
    </div>
  );
}
