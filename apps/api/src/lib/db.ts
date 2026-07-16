import { neon } from '@neondatabase/serverless';
import type { Env } from '../types';

export function db(env: Env) {
  if (!env.DATABASE_URL) throw new Error('DATABASE_URL is not configured');
  return neon(env.DATABASE_URL);
}

export function rows<T>(result: unknown): T[] {
  return result as T[];
}
