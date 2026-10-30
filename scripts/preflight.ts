/**
 * One command that checks everything before go-live and prints a green/red table.
 *
 *   npm run preflight            Phase 1: go-live-only checks (mainnet balances, live agentURI,
 *                                filled placeholders) are reported as PENDING, not failures.
 *   MYPADI_PHASE=2 npm run preflight
 *                                Phase 2: every check must PASS; PENDING counts as failure.
 *
 * Exit code is 0 only when nothing is FAIL (and, in Phase 2, nothing is PENDING).
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { privateKeyToAccount } from 'viem/accounts';
import { env } from '../src/config/env.js';
import { checkIdentity, TAG, IDENTITY_REGISTRY } from '../src/config/identity.js';
import { loadGoLive, agentUri, REPO_ROOT } from '../src/config/golive.js';
import { TelegramClient } from '../src/telegram/client.js';
import { publicCeloClient } from '../src/chain/attribution.js';

type Status = 'pass' | 'fail' | 'pending' | 'warn';
interface Check {
  name: string;
  status: Status;
  detail: string;
  /** True when this check can only pass at go-live (mainnet/live deploy). */
  goLiveOnly?: boolean;
}

const phase2 = process.env.MYPADI_PHASE === '2';

/** Robust error text: pg connection errors sometimes carry an empty message. */
function errMsg(e: unknown): string {
  if (e instanceof Error) {
    const code = (e as { code?: string }).code;
    const msg = e.message || e.name || 'error';
    return code ? `${msg} (${code})` : msg;
  }
  return String(e);
}

function derivedAddress(): string | undefined {
  if (!env.AGENT_PRIVATE_KEY) return undefined;
  const key = env.AGENT_PRIVATE_KEY.startsWith('0x')
    ? (env.AGENT_PRIVATE_KEY as `0x${string}`)
    : (`0x${env.AGENT_PRIVATE_KEY}` as `0x${string}`);
  try {
    return privateKeyToAccount(key).address;
  } catch {
    return undefined;
  }
}

async function run(): Promise<Check[]> {
  const checks: Check[] = [];
  const cfg = loadGoLive();
  const derived = derivedAddress();

  // 1. Identity: tag constant + no CeloDesk identifiers anywhere we scan.
  const id = checkIdentity({
    derivedAddress: derived,
    scan: [cfg, { AGENT_WALLET: env.AGENT_WALLET, BUY_MODE: env.BUY_MODE }],
  });
  checks.push({
    name: 'Identity (tag + no CeloDesk ids)',
    status: id.ok ? 'pass' : 'fail',
    detail: id.ok ? `TAG ${TAG}` : id.errors.join('; '),
  });

  // 2. Wallet matches key.
  if (!derived) {
    checks.push({ name: 'Wallet derived from key', status: 'pending', detail: 'no AGENT_PRIVATE_KEY yet (run wallet-new)' });
  } else {
    const wallet = (cfg.agentWallet || env.AGENT_WALLET || '').trim();
    const ok = !!wallet && wallet.toLowerCase() === derived.toLowerCase();
    checks.push({
      name: 'Wallet derived from key',
      status: ok ? 'pass' : 'fail',
      detail: ok ? derived : `derived ${derived} != AGENT_WALLET ${wallet || '(empty)'}`,
    });
  }

  // 3. buy keystore present + correct network.
  try {
    const accPath = join(REPO_ROOT, env.BUY_HOME.replace(/^\.\//, ''), 'accounts.json');
    const accounts = JSON.parse(readFileSync(accPath, 'utf8')) as unknown;
    const txt = JSON.stringify(accounts).toLowerCase();
    const hasAccount = txt.includes(env.BUY_ACCOUNT.toLowerCase());
    const onMainnet = txt.includes('celo') && !txt.includes('sepolia');
    if (!hasAccount) {
      checks.push({ name: 'buy keystore account', status: 'fail', detail: `account "${env.BUY_ACCOUNT}" not found in ${accPath}` });
    } else {
      checks.push({
        name: 'buy keystore account',
        status: phase2 ? (onMainnet ? 'pass' : 'fail') : 'pass',
        detail: `account "${env.BUY_ACCOUNT}" present; network ${onMainnet ? 'mainnet' : 'sepolia/sandbox'}`,
        goLiveOnly: !onMainnet,
      });
    }
  } catch {
    checks.push({ name: 'buy keystore account', status: phase2 ? 'fail' : 'pending', detail: 'buy keystore not set up yet (wallet-new --import)' });
  }

  // 4. buy daily cap configured.
  checks.push({
    name: 'buy daily cap set',
    status: env.BUY_DAILY_CAP_USD > 0 ? 'pass' : 'fail',
    detail: `BUY_DAILY_CAP_USD=${env.BUY_DAILY_CAP_USD}`,
  });

  // 5. Groq key works.
  if (!env.GROQ_API_KEY) {
    checks.push({ name: 'Groq API key', status: 'fail', detail: 'GROQ_API_KEY not set' });
  } else {
    try {
      const res = await fetch('https://api.groq.com/openai/v1/models', {
        headers: { Authorization: `Bearer ${env.GROQ_API_KEY}` },
      });
      checks.push({
        name: 'Groq API key',
        status: res.ok ? 'pass' : 'fail',
        detail: res.ok ? `models endpoint ${res.status}` : `HTTP ${res.status}`,
      });
    } catch (e) {
      checks.push({ name: 'Groq API key', status: 'fail', detail: `request failed: ${errMsg(e)}` });
    }
  }

  // 6. Telegram token works.
  if (!env.TELEGRAM_BOT_TOKEN) {
    checks.push({ name: 'Telegram bot token', status: 'fail', detail: 'TELEGRAM_BOT_TOKEN not set' });
  } else {
    try {
      const me = await new TelegramClient(env.TELEGRAM_BOT_TOKEN).getMe();
      checks.push({ name: 'Telegram bot token', status: 'pass', detail: `@${me.username}` });
    } catch (e) {
      checks.push({ name: 'Telegram bot token', status: 'fail', detail: errMsg(e) });
    }
  }

  // 7. Database reachable.
  if (!env.DATABASE_URL) {
    checks.push({ name: 'Database reachable', status: 'fail', detail: 'DATABASE_URL not set' });
  } else {
    try {
      const { getPool, closePool } = await import('../src/db/pool.js');
      await getPool().query('SELECT 1');
      await closePool();
      checks.push({ name: 'Database reachable', status: 'pass', detail: 'SELECT 1 ok' });
    } catch (e) {
      checks.push({ name: 'Database reachable', status: 'fail', detail: errMsg(e) });
    }
  }

  // 8. agentURI reachable (go-live).
  const uri = agentUri(cfg);
  try {
    const res = await fetch(uri);
    checks.push({
      name: 'agentURI reachable',
      status: res.ok ? 'pass' : phase2 ? 'fail' : 'pending',
      detail: `${uri} -> HTTP ${res.status}`,
      goLiveOnly: true,
    });
  } catch {
    checks.push({ name: 'agentURI reachable', status: phase2 ? 'fail' : 'pending', detail: `not reachable yet: ${uri}`, goLiveOnly: true });
  }

  // 9. Mainnet wallet balance (go-live).
  if (phase2 && derived) {
    try {
      const bal = await publicCeloClient().getBalance({ address: derived as `0x${string}` });
      checks.push({ name: 'Mainnet CELO balance (gas)', status: bal > 0n ? 'pass' : 'fail', detail: `${bal} wei` });
    } catch (e) {
      checks.push({ name: 'Mainnet CELO balance (gas)', status: 'fail', detail: errMsg(e) });
    }
  } else {
    checks.push({ name: 'Mainnet CELO balance (gas)', status: 'pending', detail: 'checked in Phase 2 only', goLiveOnly: true });
  }

  // 10. go-live placeholders filled (go-live).
  const placeholders: Array<[string, string]> = [
    ['agentWallet', cfg.agentWallet],
    ['publicBaseUrl', cfg.publicBaseUrl],
    ['agentId', cfg.agentId],
    ['firstTaggedTxHash', cfg.firstTaggedTxHash],
    ['loopsProjectUrl', cfg.loopsProjectUrl],
  ];
  const missing = placeholders
    .filter(([, v]) => !v.trim() || v.includes('example.com'))
    .map(([k]) => k);
  checks.push({
    name: 'go-live.config filled',
    status: missing.length === 0 ? 'pass' : phase2 ? 'fail' : 'pending',
    detail: missing.length === 0 ? 'all values set' : `unfilled: ${missing.join(', ')}`,
    goLiveOnly: true,
  });

  return checks;
}

function render(checks: Check[]): number {
  const icon: Record<Status, string> = { pass: 'PASS', fail: 'FAIL', pending: 'PEND', warn: 'WARN' };
  const width = Math.max(...checks.map((c) => c.name.length));
  console.log(`\nMyPadi preflight (${phase2 ? 'PHASE 2 / go-live' : 'PHASE 1 / local'})\n`);
  for (const c of checks) {
    console.log(`  [${icon[c.status]}]  ${c.name.padEnd(width)}  ${c.detail}`);
  }
  const fails = checks.filter((c) => c.status === 'fail');
  const pendings = checks.filter((c) => c.status === 'pending');
  console.log('');
  if (fails.length) {
    console.log(`${fails.length} FAIL. Fix before proceeding.`);
    return 1;
  }
  if (phase2 && pendings.length) {
    console.log(`${pendings.length} PENDING in Phase 2 (must be resolved before go-live).`);
    return 1;
  }
  if (pendings.length) {
    console.log(`All applicable checks passed. ${pendings.length} go-live check(s) pending (expected in Phase 1).`);
  } else {
    console.log('All checks passed.');
  }
  return 0;
}

run()
  .then((checks) => process.exit(render(checks)))
  .catch((err) => {
    console.error('preflight crashed:', err instanceof Error ? err.message : err);
    process.exit(1);
  });
