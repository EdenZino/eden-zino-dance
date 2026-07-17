import { Hono } from 'hono';
import { secureHeaders } from 'hono/secure-headers';
import { logger } from 'hono/logger';
import publicRoutes from './routes/public';
import adminRoutes from './routes/admin';
import { runMaintenance } from './services/jobs';
import type { Env } from './types';

const app = new Hono<{ Bindings: Env }>();
app.use('*', logger());
app.use('*', secureHeaders());

const developmentBuckets = new Map<string, { count: number; resetAt: number }>();
async function allowed(binding: RateLimit | undefined, key: string, fallbackLimit: number): Promise<boolean> {
  if (binding) return (await binding.limit({ key })).success;
  const now = Date.now();
  const current = developmentBuckets.get(key);
  if (!current || current.resetAt <= now) {
    developmentBuckets.set(key, { count: 1, resetAt: now + 60_000 });
    return true;
  }
  current.count += 1;
  return current.count <= fallbackLimit;
}

app.use('/api/public/*', async (c, next) => {
  if (c.req.path.endsWith('/payments/payme/callback') || c.req.path.endsWith('/payments/tranzila/notify')) { await next(); return; }
  const ip = c.req.header('CF-Connecting-IP') ?? 'unknown';
  const route = c.req.path.replace(/\/[0-9a-f-]{20,}/gi, '/:id');
  if (!(await allowed(c.env.PUBLIC_RATE_LIMITER, `${ip}:${route}`, 120))) return c.json({ error: 'RATE_LIMITED' }, 429);
  await next();
});

const adminAuthRateLimit = async (c: any, next: any) => {
  const ip = c.req.header('CF-Connecting-IP') ?? 'unknown';
  if (!(await allowed(c.env.AUTH_RATE_LIMITER, `${ip}:admin-login`, 10))) return c.json({ error: 'RATE_LIMITED' }, 429);
  await next();
};
app.use('/api/admin/login', adminAuthRateLimit);
app.use('/api/admin/login/*', adminAuthRateLimit);
app.use('/api/admin/bootstrap', adminAuthRateLimit);
app.use('/api/admin/password-reset/*', async (c, next) => {
  const ip = c.req.header('CF-Connecting-IP') ?? 'unknown';
  if (!(await allowed(c.env.AUTH_RATE_LIMITER, `${ip}:admin-reset`, 10))) return c.json({ error: 'RATE_LIMITED' }, 429);
  await next();
});
app.use('/api/public/portal/request-link', async (c, next) => {
  const ip = c.req.header('CF-Connecting-IP') ?? 'unknown';
  if (!(await allowed(c.env.AUTH_RATE_LIMITER, `${ip}:portal-link`, 10))) return c.json({ error: 'RATE_LIMITED' }, 429);
  await next();
});

app.get('/api/health', (c) => c.json({ ok: true, service: 'eden-dance-platform', time: new Date().toISOString() }));
app.route('/api/public', publicRoutes);
app.route('/api/admin', adminRoutes);

app.get('/api/media/*', async (c) => {
  const key = decodeURIComponent(c.req.path.replace('/api/media/', ''));
  const object = await c.env.MEDIA.get(key);
  if (!object) return c.notFound();
  const headers = new Headers(); object.writeHttpMetadata(headers); headers.set('etag', object.httpEtag); headers.set('cache-control', 'public, max-age=31536000, immutable');
  return new Response(object.body, { headers });
});

app.notFound(async (c) => c.env.ASSETS.fetch(c.req.raw));
app.onError((error, c) => {
  console.error(error);
  return c.json({ error: error.message || 'INTERNAL_ERROR' }, 500);
});

export default {
  fetch: app.fetch,
  async scheduled(_controller: ScheduledController, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(runMaintenance(env));
  },
};
