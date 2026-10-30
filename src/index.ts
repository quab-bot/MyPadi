/**
 * MyPadi entrypoint. Order matters:
 *   1. Assert identity (tag, no CeloDesk identifiers, wallet matches key) BEFORE anything runs.
 *   2. Build the dependency graph (DB, ledger, buy adapter, planner, synthesizer, coordinator).
 *   3. Start Fastify (health + registration file), the Telegram bot, and the queue worker.
 */

import Fastify from 'fastify';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { env, sandbox, budgetCaps } from './config/env.js';
import { assertIdentity, TAG } from './config/identity.js';
import { getPool, closePool } from './db/pool.js';
import { PgBudgetStore } from './db/budget-store.js';
import { PgTaskRepo } from './db/repo.js';
import { Ledger } from './budget/ledger.js';
import { BuyAdapter, createDefaultRunner, type BuyToken } from './buy/adapter.js';
import { GroqClient } from './llm/groq.js';
import { Planner } from './agent/planner.js';
import { Synthesizer } from './agent/synthesize.js';
import { Coordinator } from './agent/coordinator.js';
import { TelegramClient } from './telegram/client.js';
import { runBot } from './telegram/bot.js';
import { runWorker } from './queue/worker.js';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..');

async function deriveAddress(): Promise<string | undefined> {
  if (!env.AGENT_PRIVATE_KEY) return undefined;
  const { privateKeyToAccount } = await import('viem/accounts');
  const key = env.AGENT_PRIVATE_KEY.startsWith('0x')
    ? (env.AGENT_PRIVATE_KEY as `0x${string}`)
    : (`0x${env.AGENT_PRIVATE_KEY}` as `0x${string}`);
  return privateKeyToAccount(key).address;
}

async function main(): Promise<void> {
  // 1. Identity gate.
  const derivedAddress = await deriveAddress();
  assertIdentity({
    derivedAddress,
    scan: [
      { AGENT_WALLET: env.AGENT_WALLET, PUBLIC_BASE_URL: env.PUBLIC_BASE_URL, BUY_MODE: env.BUY_MODE },
    ],
  });
  console.log(`Identity OK. Tag ${TAG}. Mode: ${sandbox ? 'SANDBOX' : 'MAINNET'}.`);

  // Required runtime secrets.
  if (!env.TELEGRAM_BOT_TOKEN) throw new Error('TELEGRAM_BOT_TOKEN is not set.');
  if (!env.GROQ_API_KEY) throw new Error('GROQ_API_KEY is not set.');
  if (!env.DATABASE_URL) throw new Error('DATABASE_URL is not set.');

  // 2. Dependency graph.
  getPool(); // fail fast if DATABASE_URL is bad
  const repo = new PgTaskRepo();
  const ledger = new Ledger(new PgBudgetStore(), budgetCaps);
  const token: BuyToken = env.BUY_TOKEN;
  const adapter = new BuyAdapter({
    sandbox,
    token,
    account: env.BUY_ACCOUNT,
    runner: createDefaultRunner({ entry: env.BUY_ENTRY, bin: env.BUY_BIN }),
  });
  const llm = new GroqClient(env.GROQ_API_KEY, env.GROQ_MODEL);
  const coordinator = new Coordinator(
    { repo, ledger, adapter, planner: new Planner(llm), synthesizer: new Synthesizer(llm) },
    { sandbox, token, maxVideos: 2 },
  );

  const tg = new TelegramClient(env.TELEGRAM_BOT_TOKEN);
  const me = await tg.getMe();
  console.log(`Telegram bot connected: @${me.username}`);

  // 3. Fastify (health + registration file for ERC-8004 agentURI).
  const app = Fastify({ logger: false });
  app.get('/health', async () => ({ ok: true, tag: TAG, mode: sandbox ? 'sandbox' : 'mainnet' }));
  app.get('/agent-registration.json', async (_req, reply) => {
    try {
      const file = await readFile(join(repoRoot, 'agent-registration.json'), 'utf8');
      return reply.type('application/json').send(file);
    } catch {
      return reply.code(404).send({ error: 'agent-registration.json not generated yet' });
    }
  });
  await app.listen({ port: env.PORT, host: '0.0.0.0' });
  console.log(`HTTP listening on :${env.PORT}`);

  const onError = (e: unknown) => console.error('[runtime]', e instanceof Error ? e.message : e);
  const bot = runBot({ client: tg, repo, onError });
  const worker = runWorker({ repo, coordinator, client: tg, onError });
  console.log('Bot polling and worker started. Send your bot a message.');

  const shutdown = async () => {
    console.log('\nShutting down...');
    bot.stop();
    worker.stop();
    await app.close().catch(() => {});
    await closePool().catch(() => {});
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  console.error('Fatal:', err instanceof Error ? err.message : err);
  process.exit(1);
});
