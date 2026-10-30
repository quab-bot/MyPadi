/**
 * Loads the single go-live config file the developer fills in on registration day.
 *
 * Precedence for each value: go-live.config.json (live) -> env fallback -> example/empty.
 * This keeps Phase 1 working with no live file (values read from .env / defaults) while
 * giving Phase 2 one place to edit. go-live.config.json is gitignored; the committed
 * go-live.config.example.json is the template. Nothing here throws on a missing file.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { env } from './env.js';

const here = dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = join(here, '..', '..');

export interface GoLiveConfig {
  /** MyPadi agent wallet address (must equal the address derived from the key). */
  agentWallet: string;
  /** Public base URL once deployed; agentURI is `${publicBaseUrl}/agent-registration.json`. */
  publicBaseUrl: string;
  /** ERC-8004 agent id, written back by register-8004 after a real registration. */
  agentId: string;
  /** First tagged mainnet tx hash (the ERC-8004 registration), for the Loops Verify box. */
  firstTaggedTxHash: string;
  /** Loops project URL for the submission docs. */
  loopsProjectUrl: string;
  /** True when loaded from go-live.config.json (live), false when from env/example only. */
  isLive: boolean;
}

function readJson(path: string): Record<string, unknown> | undefined {
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
  } catch {
    return undefined;
  }
}

/** Load the go-live config, merging live file over env fallbacks. Never throws. */
export function loadGoLive(): GoLiveConfig {
  const live = readJson(join(REPO_ROOT, 'go-live.config.json'));
  const str = (k: string): string => {
    const v = live?.[k];
    return typeof v === 'string' ? v.trim() : '';
  };
  return {
    agentWallet: str('agentWallet') || (env.AGENT_WALLET ?? '').trim(),
    publicBaseUrl: str('publicBaseUrl') || env.PUBLIC_BASE_URL,
    agentId: str('agentId'),
    firstTaggedTxHash: str('firstTaggedTxHash'),
    loopsProjectUrl: str('loopsProjectUrl'),
    isLive: live !== undefined,
  };
}

/** The agentURI an ERC-8004 registration points at. */
export function agentUri(cfg: GoLiveConfig): string {
  return `${cfg.publicBaseUrl.replace(/\/$/, '')}/agent-registration.json`;
}
