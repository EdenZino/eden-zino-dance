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
const rateBuckets = new Map<string, { count: number; resetAt: number }>();
app.use('/api/public/*', async (c, next) => {
  const key = c.req.header('CF-Connecting-IP') ?? 'unknown';
  const now = Date.now();
  const bucket = rateBuckets.get(key);
  if (!bucket || bucket.resetAt <= now) rateBuckets.set(key, { count: 1, resetAt: now + 60_000 });
  else {
    bucket.count += 1;
    if (bucket.count > 120) return c.json({ error: 'RATE_LIMITED' }, 429);
  }
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
