/**
 * Decide which workflow a task needs. Deterministic and pure (no LLM call, no cost): an
 * on-chain investigation is signalled by a concrete 0x address / tx hash, or by explicit
 * on-chain vocabulary. Everything else is a multi-source intel report (Workflow A).
 *
 * Kept as a heuristic on purpose: it is testable, free, and never misroutes silently to a
 * paid path. The coordinator validates and budgets every step regardless of this choice.
 */

export type Workflow = 'chat' | 'intel' | 'onchain' | 'competitor';

/** Meta / small-talk the bot should answer directly (free), never a paid research run. */
const META_RE = /\b(who\s+(are|r)\s+(you|u)|who\s+be\s+you|what\s+(are|r)\s+(you|u)|what\s+can\s+you\s+do|what\s+do\s+you\s+do|how\s+do\s+you\s+work|what\s+is\s+mypadi|wetin\s+you\s+fit\s+do)\b/;
/** Greetings / thanks: only treated as chat when the WHOLE message is short (not a research ask). */
const GREETING_RE = /^(\s*)(\/(start|help)\b|hi|hiya|hello|hey+|yo+|sup|howdy|hola|good\s+(morning|afternoon|evening|day)|how\s+(are|r|you|u|far|body)\b|how\s+you\s+dey|wetin\s+dey|thanks|thank\s+you|thanks\s+padi|thx|well\s+done|nice\s+one|good\s+job|correct|abeg)/i;

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

  // Small talk / meta: answer directly and free. A greeting only counts when the whole message is
  // short (<= 6 words) and carries no concrete research target, so "hello, investigate 0x..." still
  // routes to research. Meta ("what can you do") is always chat. On-chain/competitor still win if a
  // concrete signal is present.
  const wordCount = prompt.trim().split(/\s+/).filter(Boolean).length;
  const isChat =
    !hasConcrete && (META_RE.test(p) || (GREETING_RE.test(prompt) && wordCount <= 6));

  // On-chain wins over competitor (a concrete address/hash is the strongest signal); both win over
  // the default intel report; chat wins over everything when nothing concrete was asked.
  const workflow: Workflow = isChat
    ? 'chat'
    : onchain
      ? 'onchain'
      : competitor
        ? 'competitor'
        : 'intel';

  return { workflow, addresses, hashes };
}
