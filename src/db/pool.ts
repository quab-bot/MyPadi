/**
 * Shared Postgres connection pool. Reads DATABASE_URL from the validated env.
 * In Phase 1 the app runs locally and reaches the VPS Postgres over an SSH tunnel
 * (localhost:5432); in Phase 2 the app runs on the VPS and reaches it directly.
 */

import pg from 'pg';
import { requireDatabaseUrl } from '../config/env.js';

let _pool: pg.Pool | undefined;

export function getPool(): pg.Pool {
  if (!_pool) {
    _pool = new pg.Pool({
      connectionString: requireDatabaseUrl(),
      max: 10,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 10_000,
    });
  }
  return _pool;
}

export async function closePool(): Promise<void> {
  if (_pool) {
    await _pool.end();
    _pool = undefined;
  }
}
