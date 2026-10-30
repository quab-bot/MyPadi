/**
 * Decide which workflow a task needs. Deterministic and pure (no LLM call, no cost): an
 * on-chain investigation is signalled by a concrete 0x address / tx hash, or by explicit
 * on-chain vocabulary. Everything else is a multi-source intel report (Workflow A).
 *
 * Kept as a heuristic on purpose: it is testable, free, and never misroutes silently to a
 * paid path. The coordinator validates and budgets every step regardless of this choice.
 */

export type Workflow = 'intel' | 'onchain' | 'competitor';

/** 0x + exactly 40 hex, not part of a longer hex run (an EVM address). */
const ADDRESS_RE = /\b0x[0-9a-fA-F]{40}(?![0-9a-fA-F])/;
/** 0x + exactly 64 hex (a tx hash / block hash). */
const TX_HASH_RE = /\b0x[0-9a-fA-F]{64}\b/;

/** Phrases that, on their own, mean the user wants an on-chain investigation. */
const ONCHAIN_PHRASES = [
  'on-chain',
  'onchain',
  'on chain',
  'tx hash',
  'transaction hash',
  'smart contract',
  'contract address',
  'token holders',
  'wallet activity',
  'wallet history',
  'celoscan',
  'block height',
  'block number',
  'latest block',
  'finalized block',
  'gas price',
  'json-rpc',
  'erc-20',
  'erc20',
];

/** Phrases that mean the user wants LinkedIn competitor/jobs research (Workflow B). */
const COMPETITOR_PHRASES = [
  'linkedin',
  'competitor',
  'competitors',
  'competitive',
  'hiring',
  'who is hiring',
  'job opening',
  'job openings',
  'jobs at',
  'vacancy',
  'vacancies',
  'recruiting',
  'company posts',
  'employees at',
];

export interface Classification {
  workflow: Workflow;
  /** EVM addresses found in the prompt (deduped, lowercased). */
  addresses: string[];
  /** 32-byte hashes found in the prompt (deduped, lowercased). */
  hashes: string[];
}

export function classifyWorkflow(prompt: string): Classification {
  const p = prompt.toLowerCase();

  const hashes = Array.from(new Set((prompt.match(/\b0x[0-9a-fA-F]{64}\b/g) ?? []).map((h) => h.toLowerCase())));
  // Addresses: exclude anything that is actually the first 42 chars of a 64-hex hash.
  const addresses = Array.from(
    new Set(
      (prompt.match(/\b0x[0-9a-fA-F]{40}(?![0-9a-fA-F])/g) ?? []).map((a) => a.toLowerCase()),
    ),
  );

  const hasConcrete = ADDRESS_RE.test(prompt) || TX_HASH_RE.test(prompt);
  const onchain = hasConcrete || ONCHAIN_PHRASES.some((k) => p.includes(k));
  const competitor = COMPETITOR_PHRASES.some((k) => p.includes(k));

  // On-chain wins over competitor (a concrete address/hash is the strongest signal); both
  // win over the default intel report.
  const workflow: Workflow = onchain ? 'onchain' : competitor ? 'competitor' : 'intel';

  return { workflow, addresses, hashes };
}
