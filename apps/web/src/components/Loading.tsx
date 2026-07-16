export function Loading({ label = 'טוען...' }: { label?: string }) { return <div className="loading"><span className="spinner" />{label}</div>; }
export function ErrorBox({ error }: { error: unknown }) { return <div className="error-box">{error instanceof Error ? error.message : 'אירעה שגיאה'}</div>; }
