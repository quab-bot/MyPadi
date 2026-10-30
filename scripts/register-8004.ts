/**
 * Register MyPadi on the ERC-8004 Identity Registry on Celo mainnet.
 *
 *   npm run register-8004 -- --simulate     eth_call only; prints the agentId that WOULD be
 *                                            minted. Read-only, safe, used throughout Phase 1.
 *   MYPADI_PHASE=2 npm run register-8004 -- --confirm
 *                                            REAL: sends the tagged register(agentURI) tx, reads
 *                                            the minted agentId from the receipt, and writes
 *                                            agentId + firstTaggedTxHash into go-live.config.json.
 *
 * Real mode refuses to run unless the Phase 2 gate is explicitly set (MYPADI_PHASE=2) AND
 * --confirm is passed. The wallet client is built through src/chain/attribution.ts, so the tx
 * is always tagged with celo_c42607f62b5b and the identity assert runs before signing.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { publicCeloClient, taggedWalletClient, USDC_FEE_CURRENCY_ADAPTER } from '../src/chain/attribution.js';
import { IDENTITY_REGISTRY, IDENTITY_REGISTRY_ABI, agentIdFromLogs } from '../src/chain/registry.js';
import { loadGoLive, agentUri, REPO_ROOT } from '../src/config/golive.js';
import { env } from '../src/config/env.js';

function has(flag: string): boolean {
  return process.argv.slice(2).includes(flag);
}

/** Write agentId / firstTaggedTxHash back into go-live.config.json (created if absent). */
function persist(update: { agentId?: string; firstTaggedTxHash?: string }): void {
  const path = join(REPO_ROOT, 'go-live.config.json');
  let obj: Record<string, unknown> = {};
  try {
    obj = JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
  } catch {
    obj = {};
  }
  if (update.agentId !== undefined) obj.agentId = update.agentId;
  if (update.firstTaggedTxHash !== undefined) obj.firstTaggedTxHash = update.firstTaggedTxHash;
  writeFileSync(path, JSON.stringify(obj, null, 2) + '\n', 'utf8');
  console.log(`Updated ${path}`);
}

async function simulate(uri: string, from: `0x${string}`): Promise<void> {
  const client = publicCeloClient();
  const { result } = await client.simulateContract({
    address: IDENTITY_REGISTRY,
    abi: IDENTITY_REGISTRY_ABI,
    functionName: 'register',
    args: [uri],
    account: from,
  });
  console.log('SIMULATE ok (no transaction sent).');
  console.log(`  registry:  ${IDENTITY_REGISTRY}`);
  console.log(`  from:      ${from}`);
  console.log(`  agentURI:  ${uri}`);
  console.log(`  would mint agentId: ${String(result)}`);
}

async function register(uri: string): Promise<void> {
  const { wallet, account, public: pub } = taggedWalletClient();
  console.log(`Sending TAGGED register(agentURI) from ${account.address} ...`);
  console.log(`  agentURI: ${uri}`);

  const useUsdcGas = env.BUY_TOKEN !== undefined && process.argv.includes('--usdc-gas');
  const hash = await wallet.writeContract({
    address: IDENTITY_REGISTRY,
    abi: IDENTITY_REGISTRY_ABI,
    functionName: 'register',
    args: [uri],
    ...(useUsdcGas ? { feeCurrency: USDC_FEE_CURRENCY_ADAPTER } : {}),
  } as Parameters<typeof wallet.writeContract>[0]);

  console.log(`tx sent: ${hash}`);
  const receipt = await pub.waitForTransactionReceipt({ hash });
  console.log(`mined in block ${receipt.blockNumber}, status ${receipt.status}`);
  if (receipt.status !== 'success') {
    throw new Error(`Registration tx reverted (${hash}).`);
  }

  let agentId = agentIdFromLogs(receipt.logs);
  if (!agentId) {
    // Fallback: re-simulate to read the id (view-equivalent); never fabricate.
    try {
      const { result } = await pub.simulateContract({
        address: IDENTITY_REGISTRY,
        abi: IDENTITY_REGISTRY_ABI,
        functionName: 'register',
        args: [uri],
        account: account.address,
      });
      agentId = String(result);
      console.log('(agentId read via simulate fallback; confirm against the Registered event)');
    } catch {
      console.warn('WARNING: could not read agentId from logs or simulate. Set it manually.');
    }
  }

  persist({ firstTaggedTxHash: hash, ...(agentId ? { agentId } : {}) });
  console.log('Next: npm run gen-registration, then npm run verify-tag -- ' + hash);
}

async function main(): Promise<void> {
  const cfg = loadGoLive();
  const uri = agentUri(cfg);
  const simulateOnly = has('--simulate');
  const confirm = has('--confirm');

  if (simulateOnly) {
    const from = (cfg.agentWallet || env.AGENT_WALLET || '').trim();
    if (!from) {
      console.error('No agentWallet set. Run `npm run wallet-new` first (needed even to simulate).');
      process.exit(2);
    }
    await simulate(uri, from as `0x${string}`);
    return;
  }

  // Real mode: hard gate.
  if (process.env.MYPADI_PHASE !== '2' || !confirm) {
    console.error('Refusing to send a real registration.');
    console.error('  Real mode requires BOTH: env MYPADI_PHASE=2 and the --confirm flag.');
    console.error('  Use `npm run register-8004 -- --simulate` in Phase 1.');
    process.exit(3);
  }
  await register(uri);
}

main().catch((err) => {
  console.error('register-8004 failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
