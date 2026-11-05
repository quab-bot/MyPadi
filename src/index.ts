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
import { assertIdentity, TAG, REPO_URL } from './config/identity.js';
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
import { runWatchtower } from './queue/watchtower.js';

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

  // 3. Fastify (landing page + health + registration file for ERC-8004 agentURI).
  const app = Fastify({ logger: false });
  const botUrl = (() => {
    const u = (process.env.TELEGRAM_BOT_USERNAME || '').replace(/^@/, '').trim();
    return u ? `https://t.me/${u}` : undefined;
  })();
  app.get('/', async (_req, reply) => {
    let reg: { name?: string; description?: string; capabilities?: string[] } = {};
    try {
      reg = JSON.parse(await readFile(join(repoRoot, 'agent-registration.json'), 'utf8'));
    } catch {
      /* fall back to defaults below */
    }
    return reply.type('text/html').send(landingHtml(reg, botUrl));
  });
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
  const bot = runBot({ client: tg, repo, watches: repo, proof: repo, onError });
  const worker = runWorker({ repo, coordinator, client: tg, onError });
  const watchtower = runWatchtower({ watches: repo, repo, coordinator, client: tg, onError });
  console.log('Bot polling, worker, and watchtower started. Send your bot a message.');

  const shutdown = async () => {
    console.log('\nShutting down...');
    bot.stop();
    worker.stop();
    watchtower.stop();
    await app.close().catch(() => {});
    await closePool().catch(() => {});
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** A small, static landing page rendered from the registration file so copy stays in one place. */
function landingHtml(
  reg: { name?: string; description?: string; capabilities?: string[] },
  botUrl?: string,
): string {
  const name = escapeHtml(reg.name ?? 'MyPadi');
  const description = escapeHtml(reg.description ?? 'A general-purpose AI assistant on Telegram.');
  const caps = (reg.capabilities ?? []).map((c) => `<li>${escapeHtml(c)}</li>`).join('');
  const cta = botUrl
    ? `<a class="cta" href="${escapeHtml(botUrl)}">Open MyPadi on Telegram</a>`
    : '';
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${name}</title>
<style>
  :root { color-scheme: dark; }
  body { margin: 0; background: #0f1115; color: #e8eaed; font: 16px/1.6 system-ui, sans-serif; }
  main { max-width: 720px; margin: 0 auto; padding: 72px 24px; }
  h1 { font-size: 40px; margin: 0 0 8px; letter-spacing: -0.02em; }
  .lede { color: #b7bcc4; font-size: 18px; margin: 0 0 32px; }
  h2 { font-size: 14px; text-transform: uppercase; letter-spacing: 0.08em; color: #8b93a1; margin: 40px 0 12px; }
  ul { list-style: none; padding: 0; margin: 0; }
  li { padding: 12px 16px; background: #171a21; border: 1px solid #232833; border-radius: 10px; margin-bottom: 10px; }
  .cta { display: inline-block; margin-top: 28px; padding: 12px 22px; background: #35c759; color: #06240f;
         font-weight: 600; text-decoration: none; border-radius: 10px; }
  footer { margin-top: 48px; color: #6b7280; font-size: 14px; }
  a { color: #6ea8fe; }
</style>
</head>
<body>
<main>
  <h1>${name}</h1>
  <p class="lede">${description}</p>
  ${cta}
  <h2>What it can do</h2>
  <ul>${caps}</ul>
  <footer>
    Built for the Agents on Open Rails hackathon (Build with buy). It pays for real services over
    x402 on Celo, so you never touch a wallet.
    <br><a href="${escapeHtml(REPO_URL)}">Source on GitHub</a> ·
    <a href="/agent-registration.json">Agent registration (ERC-8004)</a>
  </footer>
</main>
</body>
</html>`;
}

main().catch((err) => {
  console.error('Fatal:', err instanceof Error ? err.message : err);
  process.exit(1);
});
