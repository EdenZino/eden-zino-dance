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

export async function createCustomerSession(c: Context<any>, email: string): Promise<void> {
  const token = randomToken(36);
  const tokenHash = await sha256(`${token}:${c.env.SESSION_SECRET}`);
  await db(c.env)`insert into customer_sessions(email,token_hash,expires_at,ip_address,user_agent)
    values(lower(${email}),${tokenHash},now()+interval '30 days',${c.req.header('CF-Connecting-IP') ?? null},${c.req.header('User-Agent') ?? null})`;
  setCookie(c, 'eden_customer_session', token, {
    httpOnly: true,
    secure: new URL(c.req.url).protocol === 'https:',
    sameSite: 'Lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 30,
  });
}

export async function destroyCustomerSession(c: Context<any>): Promise<void> {
  const token = getCookie(c, 'eden_customer_session');
  if (token) {
    const tokenHash = await sha256(`${token}:${c.env.SESSION_SECRET}`);
    await db(c.env)`delete from customer_sessions where token_hash=${tokenHash}`;
  }
  deleteCookie(c, 'eden_customer_session', { path: '/' });
}

export async function getCustomerEmail(c: Context<any>): Promise<string | null> {
  const token = getCookie(c, 'eden_customer_session');
  if (!token) return null;
  const tokenHash = await sha256(`${token}:${c.env.SESSION_SECRET}`);
  const rows = await db(c.env)`update customer_sessions set last_seen_at=now()
    where token_hash=${tokenHash} and expires_at>now()
    returning email`;
  return rows.length ? String((rows[0] as { email: string }).email) : null;
}

export async function publicAccessHash(secret: string, token: string): Promise<string> {
  return sha256(`${token}:${secret}:public-access`);
}

export async function verifyRegistrationAccess(c: Context<any>, registrationCode: string, suppliedToken?: string): Promise<boolean> {
  const customerEmail = await getCustomerEmail(c);
  const tokenHash = suppliedToken ? await publicAccessHash(c.env.SESSION_SECRET, suppliedToken) : null;
  const rows = await db(c.env)`select 1 from registrations
    where registration_code=${registrationCode}
      and ((lower(email)=lower(${customerEmail}) and ${customerEmail}::text is not null)
        or (public_access_token_hash=${tokenHash} and public_access_expires_at>now()))
    limit 1`;
  return rows.length > 0;
}

export async function verifyOrderAccess(c: Context<any>, orderCode: string, suppliedToken?: string): Promise<boolean> {
  const customerEmail = await getCustomerEmail(c);
  const tokenHash = suppliedToken ? await publicAccessHash(c.env.SESSION_SECRET, suppliedToken) : null;
  const rows = await db(c.env)`select 1 from commerce_orders
    where order_code=${orderCode}
      and ((lower(email)=lower(${customerEmail}) and ${customerEmail}::text is not null)
        or (public_access_token_hash=${tokenHash} and public_access_expires_at>now()))
    limit 1`;
  return rows.length > 0;
}
