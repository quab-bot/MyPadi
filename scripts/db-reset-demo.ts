/**
 * Clear the sandbox demo user's data so usage stats start clean before the Phase 2 demo.
 *
 *   npm run db-reset-demo
 *
 * Deletes ONLY rows belonging to the demo user id used by scripts/demo-sandbox.ts
 * (999000001). Real Telegram users are never touched. Runs in one transaction, FK-safe order.
 */

import { getPool, closePool } from '../src/db/pool.js';

// Must match DEMO_USER_ID in scripts/demo-sandbox.ts.
const DEMO_USER_ID = '999000001';

async function main(): Promise<void> {
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const tasksSub = 'SELECT id FROM tasks WHERE user_id = $1';
    const outputs = await client.query(`DELETE FROM outputs WHERE task_id IN (${tasksSub})`, [DEMO_USER_ID]);
    const calls = await client.query(`DELETE FROM service_calls WHERE task_id IN (${tasksSub})`, [DEMO_USER_ID]);
    const steps = await client.query(`DELETE FROM steps WHERE task_id IN (${tasksSub})`, [DEMO_USER_ID]);
    const resv = await client.query('DELETE FROM budget_reservations WHERE user_id = $1', [DEMO_USER_ID]);
    const tasks = await client.query('DELETE FROM tasks WHERE user_id = $1', [DEMO_USER_ID]);
    const users = await client.query('DELETE FROM users WHERE id = $1', [DEMO_USER_ID]);
    await client.query('COMMIT');
    console.log(`Cleared demo user ${DEMO_USER_ID}:`);
    console.log(`  outputs        ${outputs.rowCount}`);
    console.log(`  service_calls  ${calls.rowCount}`);
    console.log(`  steps          ${steps.rowCount}`);
    console.log(`  reservations   ${resv.rowCount}`);
    console.log(`  tasks          ${tasks.rowCount}`);
    console.log(`  users          ${users.rowCount}`);
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    client.release();
  }
  await closePool();
}

main().catch(async (err) => {
  console.error('db-reset-demo failed:', err instanceof Error ? err.message : err);
  await closePool().catch(() => {});
  process.exit(1);
});
