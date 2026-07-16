import type { Context } from 'hono';

export async function readJson<T>(c: Context): Promise<T> {
  const type = c.req.header('content-type') ?? '';
  if (!type.includes('application/json')) throw new Error('Content-Type must be application/json');
  return c.req.json<T>();
}

export function publicError(c: Context, error: unknown, status = 400) {
  const message = error instanceof Error ? error.message : 'Unexpected error';
  return c.json({ error: message }, status as 400);
}
