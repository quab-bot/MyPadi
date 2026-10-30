/**
 * Headless end-to-end SANDBOX run of the full task engine (no Telegram, no Fastify).
 *
 *   npm run demo-sandbox                    uses the default intel prompt
 *   npm run demo-sandbox -- "your prompt"   runs any prompt through the coordinator
 *
 * Builds the SAME dependency graph as src/index.ts, creates a task, and runs it through
 * Coordinator.runTask — exercising planner (Groq) -> validator -> ledger (DB) -> buy adapter
 * (real x402 on celo-sepolia, free test USDC, gateway auto-funds the first call) -> evidence
 * -> synthesis. Then it prints the report and every service_call with its settlement tx hash.
 *
 * Refuses to run unless BUY_MODE=sandbox. Phase 1 safe: no mainnet, no real money.
 */

import { env, sandbox, budgetCaps } from '../src/config/env.js';
import { assertIdentity, TAG } from '../src/config/identity.js';
import { getPool, closePool } from '../src/db/pool.js';
import { PgBudgetStore } from '../src/db/budget-store.js';
import { PgTaskRepo } from '../src/db/repo.js';
import { Ledger } from '../src/budget/ledger.js';
import { BuyAdapter, createDefaultRunner, type BuyToken } from '../src/buy/adapter.js';
import { GroqClient } from '../src/llm/groq.js';
import { Planner } from '../src/agent/planner.js';
import { Synthesizer } from '../src/agent/synthesize.js';
import { Coordinator } from '../src/agent/coordinator.js';
import { usdFromMicro } from '../src/budget/money.js';

const DEFAULT_PROMPT = 'What are people saying about the Celo blockchain and its move to an Ethereum L2 this week? Give me a short sourced summary.';

// A fake Telegram user id for sandbox runs. scripts/db-reset-demo.ts clears exactly this id.
const DEMO_USER_ID = '999000001';

async function main(): Promise<void> {
  if (!sandbox) {
    console.error('demo-sandbox refuses to run with BUY_MODE != sandbox. This is a Phase 1 sandbox-only harness.');
    process.exit(2);
  }
  assertIdentity();
  if (!env.GROQ_API_KEY) throw new Error('GROQ_API_KEY is not set.');
  if (!env.DATABASE_URL) throw new Error('DATABASE_URL is not set (is the SSH tunnel up?).');

  const prompt = process.argv.slice(2).join(' ').trim() || DEFAULT_PROMPT;
  console.log(`\n=== MyPadi sandbox run (tag ${TAG}) ===`);
  console.log(`Prompt: ${prompt}\n`);

  const repo = new PgTaskRepo();
  const ledger = new Ledger(new PgBudgetStore(), budgetCaps);
  const token: BuyToken = env.BUY_TOKEN;
  const adapter = new BuyAdapter({
    sandbox: true,
    token,
    account: env.BUY_ACCOUNT,
    runner: createDefaultRunner({ entry: env.BUY_ENTRY, bin: env.BUY_BIN }),
  });
  const llm = new GroqClient(env.GROQ_API_KEY, env.GROQ_MODEL);
  const coordinator = new Coordinator(
    { repo, ledger, adapter, planner: new Planner(llm), synthesizer: new Synthesizer(llm) },
    { sandbox: true, token, maxVideos: 1 },
  );

  // A fake Telegram user id so the FK and per-user budget work exactly as in production.
  const demoUserId = DEMO_USER_ID;
  await repo.upsertUser(demoUserId, 'sandbox_demo');
  const taskId = await repo.createTask(demoUserId, prompt);

  // Atomically claim the task so a running app worker cannot also pick it up and race us
  // (that collides on the steps unique key). If the claim returns nothing, a worker already
  // took it: stop the app before running this harness.
  const claimed = await getPool().query(
    `UPDATE tasks SET status='running', updated_at=now() WHERE id=$1 AND status='queued' RETURNING id`,
    [taskId],
  );
  if (claimed.rowCount === 0) {
    console.error('Task was claimed by a running worker. Stop the app (npm run start) before demo-sandbox.');
    await closePool();
    process.exit(1);
  }

  const task = await repo.getTask(taskId);
  if (!task) throw new Error('task not found after create');

  console.log(`Task ${taskId} created. Running (this makes REAL sandbox x402 calls)...\n`);
  const started = Date.now();
  const report = await coordinator.runTask(task);
  const secs = ((Date.now() - started) / 1000).toFixed(1);

  console.log('----- REPORT -----');
  console.log(report);
  console.log('------------------\n');

  const calls = await getPool().query(
    `SELECT capability, status, network, token, quote_micro, paid_micro, tx_hash
       FROM service_calls WHERE task_id = $1 ORDER BY created_at`,
    [taskId],
  );
  console.log(`Service calls for this task (${calls.rowCount}):`);
  for (const c of calls.rows) {
    const price = c.paid_micro ? `$${usdFromMicro(Number(c.paid_micro))}` : c.quote_micro ? `quote $${usdFromMicro(Number(c.quote_micro))}` : 'free';
    console.log(`  [${c.status}] ${c.capability}  ${price}  ${c.network ?? ''} ${c.token ?? ''}  tx=${c.tx_hash ?? '-'}`);
  }
  console.log(`\nDone in ${secs}s.`);
  await closePool();
}

main().catch(async (err) => {
  console.error('\ndemo-sandbox failed:', err instanceof Error ? err.message : err);
  await closePool().catch(() => {});
  process.exit(1);
});
