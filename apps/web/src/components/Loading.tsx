import { useLanguage } from '../lib/language';
export function Loading({ label }: { label?: string }) { const {t}=useLanguage(); return <div className="loading"><span className="spinner" />{label||t('טוען...','Loading...')}</div>; }
export function ErrorBox({ error }: { error: unknown }) { const {t}=useLanguage(); return <div className="error-box">{error instanceof Error ? error.message : t('אירעה שגיאה','Something went wrong')}</div>; }
