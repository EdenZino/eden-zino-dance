export function mediaUrlFromKey(objectKey: string): string {
  return `/api/media/${objectKey.split('/').map((part) => encodeURIComponent(part)).join('/')}`;
}

export function normalizeStoredMediaUrl(value: unknown): string {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text) return '';
  if (text.startsWith('/api/media/') || text.startsWith('/images/')) return text;
  try {
    const parsed = new URL(text);
    if (parsed.pathname.startsWith('/api/media/')) return parsed.pathname;
  } catch {
    // Not an absolute URL. Keep relative/custom values unchanged.
  }
  return text;
}

export function withRelativeAssetUrl<T extends { object_key?: unknown; public_url?: unknown }>(asset: T): T & { public_url: string } {
  const key = typeof asset.object_key === 'string' ? asset.object_key : '';
  return { ...asset, public_url: key ? mediaUrlFromKey(key) : normalizeStoredMediaUrl(asset.public_url) };
}
