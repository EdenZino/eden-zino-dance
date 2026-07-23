import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

export type PublicLanguage = 'he' | 'en';

type LanguageContextValue = {
  language: PublicLanguage;
  locale: 'he-IL' | 'en-US';
  direction: 'rtl' | 'ltr';
  setLanguage: (language: PublicLanguage) => void;
  t: (he: string, en: string) => string;
  localize: <T extends Record<string, any>>(value: T | undefined | null, field: string) => any;
};

const LanguageContext = createContext<LanguageContextValue | null>(null);

function initialLanguage(): PublicLanguage {
  if (typeof window === 'undefined') return 'he';
  const saved = window.localStorage.getItem('eden-public-language');
  if (saved === 'he' || saved === 'en') return saved;
  return navigator.language.toLowerCase().startsWith('he') ? 'he' : 'en';
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<PublicLanguage>(initialLanguage);
  const locale = language === 'he' ? 'he-IL' : 'en-US';
  const direction = language === 'he' ? 'rtl' : 'ltr';

  const setLanguage = (next: PublicLanguage) => {
    window.localStorage.setItem('eden-public-language', next);
    setLanguageState(next);
  };

  useEffect(() => {
    document.documentElement.lang = language;
    document.documentElement.dir = direction;
    document.body.dir = direction;
  }, [language, direction]);

  const value = useMemo<LanguageContextValue>(() => ({
    language,
    locale,
    direction,
    setLanguage,
    t: (he, en) => language === 'he' ? he : en,
    localize: (item, field) => {
      if (!item) return '';
      if (language === 'en') {
        const translated = item[`${field}_en`];
        if (typeof translated === 'string' && translated.trim()) return translated;
        if (Array.isArray(translated) && translated.length) return translated;
      }
      return item[field] ?? '';
    },
  }), [language, locale, direction]);

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) throw new Error('useLanguage must be used inside LanguageProvider');
  return context;
}

export function storedLanguage(): PublicLanguage {
  if (typeof window === 'undefined') return 'he';
  return window.localStorage.getItem('eden-public-language') === 'en' ? 'en' : 'he';
}
