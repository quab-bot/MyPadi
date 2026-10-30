/**
 * Single source of truth for MyPadi's identity on the Agents on Open Rails hackathon.
 *
 * NOTHING else in the codebase may hardcode the tag, event slug, repo, email or wallet.
 * Import from here. The startup assert (assertIdentity) runs before the app serves anything.
 *
 * The tag is issued by Loops; it is NOT derived from the repo. Always compare against the
 * TAG constant below, never recompute it from the repo name. See CLAUDE.md section 0.
 */

/** Attribution tag issued by Loops for the MyPadi entry. The one true value. */
export const TAG = 'celo_c42607f62b5b';

export const EVENT_SLUG = 'agents-on-open-rails';
export const REPO_URL = 'https://github.com/quab-bot/MyPadi';
export const LOOPS_EMAIL = 'quabentertainment@gmail.com';
export const TRACK = 'Build with buy';

/** ERC-8004 Identity Registry on Celo mainnet (confirmed live in the catalogue). */
export const IDENTITY_REGISTRY = '0x8004A169FB4a3325136EB29fA0ceB6D2e539a432' as const;

/**
 * CeloDesk is a DIFFERENT hackathon entry in another folder under another Loops account.
 * None of these identifiers may EVER appear in MyPadi config, code, Loops entry or a tx.
 * If any is seen at startup, the app refuses to run. See CLAUDE.md section 0.
 */
export const FORBIDDEN_CELODESK = Object.freeze({
  repo: 'Investorquab/CeloDesk',
  email: 'quadribello3@gmail.com',
  tag: 'celo_3fce81a170fc',
  wallet: '0x00d1E86040d88397F4eB187c38dC527F6659e486',
  botHandle: '@celoagentbot',
});

/**
 * The tag that WOULD result from deriving it from the repo name. It is the wrong value and
 * must never be used; kept here only so a mistaken derivation is caught, not silently used.
 */
export const DERIVED_REPO_TAG_DO_NOT_USE = 'celo_8be850b76091';

/** Agent wallet address, read from env. Empty in early Phase 1 until wallet-new.ts runs. */
export function agentWallet(): string {
  return (process.env.AGENT_WALLET ?? '').trim();
}

export interface IdentityCheckResult {
  ok: boolean;
  errors: string[];
}

/**
 * Validate the identity configuration. Pure (no process.exit) so it is unit-testable and
 * reusable by scripts/preflight.ts. `config` lets callers pass extra values to scan
 * (e.g. the resolved wallet, env snapshot) for forbidden CeloDesk identifiers.
 */
export function checkIdentity(
  opts: {
    /** Address derived from AGENT_PRIVATE_KEY, if a key is present. */
    derivedAddress?: string | undefined;
    /** Extra config blobs to scan for forbidden identifiers (stringified). */
    scan?: unknown[];
  } = {},
): IdentityCheckResult {
  const errors: string[] = [];

  // 1. Tag must be exactly the Loops-issued value, never the repo-derived one.
  if (TAG !== 'celo_c42607f62b5b') {
    errors.push(`TAG constant has been altered to "${TAG}" (expected celo_c42607f62b5b).`);
  }
  if ((TAG as string) === DERIVED_REPO_TAG_DO_NOT_USE) {
    errors.push('TAG is the repo-derived value; it must be the Loops-issued tag.');
  }

  // 2. No CeloDesk identifier may appear anywhere we were asked to scan.
  const forbidden = Object.values(FORBIDDEN_CELODESK).map((v) => v.toLowerCase());
  const haystacks: string[] = [
    TAG,
    EVENT_SLUG,
    REPO_URL,
    LOOPS_EMAIL,
    agentWallet(),
    ...(opts.scan ?? []).map((s) => JSON.stringify(s)),
  ].map((s) => (s ?? '').toString().toLowerCase());

  for (const hay of haystacks) {
    for (const bad of forbidden) {
      if (bad && hay.includes(bad)) {
        errors.push(`Forbidden CeloDesk identifier "${bad}" found in config.`);
      }
    }
  }

  // 3. If a private key is present, the address it derives must equal AGENT_WALLET.
  const wallet = agentWallet();
  if (opts.derivedAddress) {
    if (!wallet) {
      errors.push('A private key is set but AGENT_WALLET is empty.');
    } else if (opts.derivedAddress.toLowerCase() !== wallet.toLowerCase()) {
      errors.push(
        `AGENT_WALLET (${wallet}) does not match the address derived from the key (${opts.derivedAddress}).`,
      );
    }
  }

  return { ok: errors.length === 0, errors: [...new Set(errors)] };
}

/**
 * Enforce identity at startup. Throws (caller exits non-zero) if anything is wrong.
 * Call this before Fastify starts listening and before any wallet client is built.
 */
export function assertIdentity(opts: Parameters<typeof checkIdentity>[0] = {}): void {
  const { ok, errors } = checkIdentity(opts);
  if (!ok) {
    throw new Error(
      `Identity check FAILED. Refusing to start.\n  - ${errors.join('\n  - ')}`,
    );
  }
}
