import type { Context, Next } from 'hono';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import { db } from './db';
import { randomToken, sha256 } from './crypto';
import type { AdminSession, Env } from '../types';

type AppContext = Context<{ Bindings: Env; Variables: { admin: AdminSession } }>;

export async function createSession(c: Context<any>, adminId: string): Promise<void> {
  const token = randomToken(36);
  const tokenHash = await sha256(`${token}:${c.env.SESSION_SECRET}`);
  const sql = db(c.env);
  await sql`insert into admin_sessions (admin_id, token_hash, expires_at, ip_address, user_agent)
            values (${adminId}::uuid, ${tokenHash}, now() + interval '14 days', ${c.req.header('CF-Connecting-IP') ?? null}, ${c.req.header('User-Agent') ?? null})`;
  setCookie(c, 'eden_admin_session', token, {
    httpOnly: true,
    secure: new URL(c.req.url).protocol === 'https:',
    sameSite: 'Lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 14,
  });
}

export async function destroySession(c: Context<any>): Promise<void> {
  const token = getCookie(c, 'eden_admin_session');
  if (token) {
    const tokenHash = await sha256(`${token}:${c.env.SESSION_SECRET}`);
    await db(c.env)`delete from admin_sessions where token_hash = ${tokenHash}`;
  }
  deleteCookie(c, 'eden_admin_session', { path: '/' });
}

export async function requireAdmin(c: AppContext, next: Next): Promise<Response | void> {
  const token = getCookie(c, 'eden_admin_session');
  if (!token) return c.json({ error: 'UNAUTHORIZED' }, 401);
  const tokenHash = await sha256(`${token}:${c.env.SESSION_SECRET}`);
  const result = await db(c.env)`select a.id, a.email, a.display_name, a.role
    from admin_sessions s join admins a on a.id = s.admin_id
    where s.token_hash = ${tokenHash} and s.expires_at > now() and a.is_active = true
    limit 1`;
  const admin = result[0] as { id: string; email: string; display_name: string; role: AdminSession['role'] } | undefined;
  if (!admin) return c.json({ error: 'UNAUTHORIZED' }, 401);
  c.set('admin', { adminId: admin.id, email: admin.email, displayName: admin.display_name, role: admin.role });
  await next();
}

export function requireRole(...roles: AdminSession['role'][]) {
  return async (c: AppContext, next: Next): Promise<Response | void> => {
    const admin = c.get('admin');
    if (!roles.includes(admin.role)) return c.json({ error: 'FORBIDDEN' }, 403);
    await next();
  };
}
