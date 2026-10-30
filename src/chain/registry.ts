/**
 * ERC-8004 Identity Registry on Celo mainnet.
 *
 * Address: 0x8004A169FB4a3325136EB29fA0ceB6D2e539a432 (IDENTITY_REGISTRY in identity.ts).
 * `register(agentURI)` mints an agent id to msg.sender and records it as the agent wallet;
 * the new id is emitted in the `Registered` event and also returned by the call.
 *
 * NOTE: the ABI fragment below matches the Celo ERC-8004 reference interface
 * (register(string) -> uint256, event Registered(uint256 indexed, string, address indexed)).
 * It is confirmed against the live contract during the Phase 2 dry run (register-8004 --simulate),
 * which decodes the real return value before any real transaction is ever sent.
 */

import { decodeEventLog, type Log } from 'viem';
import { IDENTITY_REGISTRY } from '../config/identity.js';

export { IDENTITY_REGISTRY };

export const IDENTITY_REGISTRY_ABI = [
  {
    type: 'function',
    name: 'register',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'agentURI', type: 'string' }],
    outputs: [{ name: 'agentId', type: 'uint256' }],
  },
  {
    type: 'event',
    name: 'Registered',
    inputs: [
      { name: 'agentId', type: 'uint256', indexed: true },
      { name: 'agentURI', type: 'string', indexed: false },
      { name: 'owner', type: 'address', indexed: true },
    ],
  },
] as const;

/**
 * Pull the minted agentId out of a receipt's logs. Scans only logs emitted by the registry
 * address and tries to decode a `Registered` event. Returns the id as a decimal string, or
 * undefined if no such event is present (caller should then fall back to a view read).
 */
export function agentIdFromLogs(logs: readonly Log[]): string | undefined {
  for (const log of logs) {
    if (log.address.toLowerCase() !== IDENTITY_REGISTRY.toLowerCase()) continue;
    try {
      const decoded = decodeEventLog({
        abi: IDENTITY_REGISTRY_ABI,
        data: log.data,
        topics: log.topics,
      });
      if (decoded.eventName === 'Registered') {
        const id = (decoded.args as { agentId?: bigint }).agentId;
        if (id !== undefined) return id.toString();
      }
    } catch {
      // Not the Registered event (or an ABI mismatch): try the next log.
    }
  }
  return undefined;
}
