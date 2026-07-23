import { useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import type { SiteData } from '../lib/types';
import { useLanguage } from '../lib/language';

declare global {
  interface Window {
    turnstile?: {
      render: (element: HTMLElement, options: Record<string, unknown>) => string;
      remove: (widgetId: string) => void;
    };
  }
}

let scriptPromise: Promise<void> | null = null;
function loadScript() {
  if (window.turnstile) return Promise.resolve();
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[data-eden-turnstile]');
    if (existing) { existing.addEventListener('load', () => resolve(), { once: true }); return; }
    const script = document.createElement('script');
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    script.async = true; script.defer = true; script.dataset.edenTurnstile = 'true';
    script.onload = () => resolve(); script.onerror = () => reject(new Error('TURNSTILE_SCRIPT_FAILED'));
    document.head.appendChild(script);
  });
  return scriptPromise;
}

export function TurnstileField({ action, onToken }: { action: string; onToken: (token: string) => void }) {
  const { language, t } = useLanguage();
  const site = useQuery({ queryKey: ['site'], queryFn: () => api<SiteData>('/public/site') });
  const ref = useRef<HTMLDivElement>(null);
  const key = site.data?.turnstileSiteKey;

  useEffect(() => {
    if (!key || !ref.current) { onToken(''); return; }
    let active = true; let widgetId = '';
    loadScript().then(() => {
      if (!active || !ref.current || !window.turnstile) return;
      widgetId = window.turnstile.render(ref.current, {
        sitekey: key,
        action,
        language,
        callback: (token: string) => onToken(token),
        'expired-callback': () => onToken(''),
        'error-callback': () => onToken(''),
      });
    }).catch(() => onToken(''));
    return () => { active = false; if (widgetId && window.turnstile) window.turnstile.remove(widgetId); };
  }, [action, key, language, onToken]);

  if (!key) return null;
  return <div className="turnstile-wrap" ref={ref} aria-label={t('אימות אבטחה','Security verification')} />;
}
