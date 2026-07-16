import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import pg from 'pg';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required');

const client = new pg.Client({ connectionString: databaseUrl, ssl: { rejectUnauthorized: false } });
await client.connect();
try {
  await client.query('create table if not exists schema_migrations (filename text primary key, applied_at timestamptz not null default now())');
  const dir = path.resolve('db/migrations');
  const files = (await fs.readdir(dir)).filter((f) => f.endsWith('.sql')).sort();
  for (const filename of files) {
    const exists = await client.query('select 1 from schema_migrations where filename = $1', [filename]);
    if (exists.rowCount) continue;
    const body = await fs.readFile(path.join(dir, filename), 'utf8');
    console.log(`Applying ${filename}`);
    await client.query('begin');
    try {
      await client.query(body);
      await client.query('insert into schema_migrations(filename) values($1)', [filename]);
      await client.query('commit');
    } catch (error) {
      await client.query('rollback');
      throw error;
    }
  }
  console.log('Migrations complete');
} finally {
  await client.end();
}
