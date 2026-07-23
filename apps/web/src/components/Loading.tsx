import { useLanguage } from '../lib/language';

export function Loading({ label }: { label?: string }) {
  const {t}=useLanguage();
  return <div className="loading" role="status" aria-live="polite"><span className="spinner" aria-hidden="true"/><span>{label||t('טוען...','Loading...')}</span></div>;
}

export function ErrorBox({ error }: { error: unknown }) {
  const {t}=useLanguage();
  return <div className="error-box" role="alert" aria-live="assertive">{error instanceof Error ? error.message : t('אירעה שגיאה','Something went wrong')}</div>;
}
