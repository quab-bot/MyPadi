/**
 * Attribution chokepoint. Every viem wallet client MyPadi ever builds is created HERE and
 * extended with `withAttribution(TAG)`, so no direct transaction can leave untagged. The
 * ERC-8004 registration (the only tx we send ourselves) therefore always carries celo_c42607f62b5b.
 * (buy's x402 settlement tx is sent by the gateway and is tagged by the gateway, not here.)
 *
 * API is the real @celo/attribution-tags@0.5 surface:
 *   withAttribution(code) -> client extension appending the ERC-8021 suffix to every tx
 *   toDataSuffix(code)    -> the raw suffix bytes (used when we build calldata by hand)
 *   verifyTx({client,hash}) -> decode a settled tx's suffix (used by scripts/verify-tag.ts)
 *   codeFromRepo(repo)    -> the WRONG, repo-derived tag; kept only to assert we never use it
 */

import { createPublicClient, createWalletClient, http, type PublicClient } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { celo } from 'viem/chains';
import {
  withAttribution,
  toDataSuffix,
  verifyTx,
  codeFromRepo,
} from '@celo/attribution-tags';
import { TAG, assertIdentity } from '../config/identity.js';
import { env } from '../config/env.js';

export { withAttribution, toDataSuffix, verifyTx, codeFromRepo };

/**
 * USDC fee-currency adapter on Celo mainnet. When passed as a tx's `feeCurrency`, gas is paid
 * in USDC instead of CELO (CLAUDE.md section 1B / 2.5). Optional: omit to pay gas in CELO.
 */
export const USDC_FEE_CURRENCY_ADAPTER =
  '0x2F25deB3848C207fc8E0c34035B3Ba7fC157602B' as const;

/** Normalise a private key to a 0x-prefixed hex string. */
function normalizeKey(raw: string): `0x${string}` {
  return (raw.startsWith('0x') ? raw : `0x${raw}`) as `0x${string}`;
}

/** Read-only mainnet client. Allowed in Phase 1 (RPC reads + eth_call simulations). */
export function publicCeloClient(): PublicClient {
  return createPublicClient({
    chain: celo,
    transport: http(env.CELO_RPC_URL),
  }) as PublicClient;
}

/**
 * Build the ONE tagged wallet client. Asserts identity first (tag unaltered, no CeloDesk
 * identifiers, derived address == AGENT_WALLET), then extends the viem wallet client with the
 * attribution suffix so every tx it sends is tagged with TAG.
 *
 * Throws if no private key is set. Callers that only simulate should use publicCeloClient().
 */
export function taggedWalletClient() {
  if (!env.AGENT_PRIVATE_KEY) {
    throw new Error('AGENT_PRIVATE_KEY is not set; cannot build a wallet client.');
  }
  const account = privateKeyToAccount(normalizeKey(env.AGENT_PRIVATE_KEY));

  // Identity gate at the exact point a signing client is created. Belt and suspenders with
  // the startup assert in src/index.ts, but scripts that build a wallet without booting the
  // app (register-8004) must not be able to skip it.
  assertIdentity({ derivedAddress: account.address });

  const wallet = createWalletClient({
    account,
    chain: celo,
    transport: http(env.CELO_RPC_URL),
  }).extend(withAttribution(TAG));

  return { wallet, account, public: publicCeloClient() };
}
