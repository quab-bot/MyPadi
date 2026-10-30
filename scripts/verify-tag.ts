/**
 * Verify that a mainnet transaction carries MyPadi's attribution tag.
 *
 *   npm run verify-tag -- <txHash>
 *
 * Decodes the tx's ERC-8021 suffix with verifyTx, prints every code found, and exits
 * non-zero unless celo_c42607f62b5b (the TAG constant) is present. Read-only: one RPC call.
 * Used after the ERC-8004 registration and to confirm the hash the developer pastes into the
 * Loops "Verify" box.
 */

import { verifyTx, publicCeloClient } from '../src/chain/attribution.js';
import { TAG } from '../src/config/identity.js';

async function main(): Promise<void> {
  const hash = process.argv[2]?.trim();
  if (!hash || !/^0x[0-9a-fA-F]{64}$/.test(hash)) {
    console.error('Usage: npm run verify-tag -- <0x…64-hex txHash>');
    process.exit(2);
  }

  const client = publicCeloClient();
  const decoded = await verifyTx({ client, hash: hash as `0x${string}` });

  if (!decoded) {
    console.error(`FAIL: ${hash} carries no decodable attribution suffix.`);
    process.exit(1);
  }

  console.log(`Transaction: ${hash}`);
  console.log(`Schema:      ${decoded.schemaId}`);
  console.log(`Codes:       ${decoded.codes.join(', ') || '(none)'}`);

  if (decoded.codes.includes(TAG)) {
    console.log(`PASS: MyPadi tag ${TAG} is present.`);
    process.exit(0);
  }
  console.error(`FAIL: expected tag ${TAG} not found in the tx suffix.`);
  process.exit(1);
}

main().catch((err) => {
  console.error('verify-tag failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
