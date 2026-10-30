/**
 * Apply the schema. Idempotent: schema.sql uses CREATE ... IF NOT EXISTS, so running this
 * repeatedly is safe. Usage: `npm run migrate`.
 */

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { getPool, closePool } from './pool.js';

const here = dirname(fileURLToPath(import.meta.url));

async function main(): Promise<void> {
  const sql = await readFile(join(here, 'schema.sql'), 'utf8');
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(sql);
    await client.query('COMMIT');
    console.log('Migration applied successfully.');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

main()
  .then(() => closePool())
  .then(() => process.exit(0))
  .catch(async (err) => {
    console.error('Migration failed:', err instanceof Error ? err.message : err);
    await closePool().catch(() => {});
    process.exit(1);
  });
