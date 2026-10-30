/**
 * buy CLI adapter: the ONLY path from MyPadi to a paid x402 call.
 *
 * Verified against @celo/buy@0.8.5 help + a live sandbox quote (2026-10-30):
 *   - `buy [--sandbox] [--json] quote <curl-args>`  reads the 402 price, never pays, no wallet.
 *   - `buy [--sandbox] [--json] curl --max-amount <usd> --token <T> <curl-args>`  pays via x402.
 *   - Global flags (--sandbox, --json) come BEFORE the subcommand; subcommand options
 *     (--max-amount, --token, --data-file) come right after it, before the forwarded curl-args.
 *   - With --json (default when stdout is not a TTY) errors are machine-readable on stderr;
 *     the response body is on stdout.
 *
 * Retry policy (CLAUDE.md section 2): NEVER auto-retry 504 timeout, 500 settle_uncertain or
 * 500 provision_failed — those may have spent money. They become 'unresolved' and the caller
 * must keep the budget held and resolve with `buy receipts --resolve`. 4xx/503 happen before
 * settlement and are safe to release.
 */

import { spawn } from 'node:child_process';
import type { MicroUsd } from '../budget/money.js';
import { microFromAtomic, usdFromMicro } from '../budget/money.js';

export type BuyToken = 'USDC' | 'USDT' | 'USAT';

/** Map our token symbol to the `extra.name` used in x402 offers. */
const TOKEN_OFFER_NAME: Record<BuyToken, string> = {
  USDC: 'USDC',
  USDT: 'Tether USD',
  USAT: 'Tether America USD',
};

export interface BuyRequest {
  url: string;
  method?: string; // default POST
  headers?: Record<string, string>;
  bodyJson?: unknown; // sent as -d <json>
}

export interface X402Offer {
  scheme: string;
  network: string;
  maxAmountRequired: string; // atomic (6-dec) string
  resource: string;
  asset: string;
  extra?: { name?: string; gateway?: { capability?: string; pricingModel?: string; sandbox?: boolean } };
}

export interface QuoteResult {
  offer: X402Offer;
  atomic: string;
  micro: MicroUsd;
  network: string;
  token: BuyToken;
}

export type PayOutcome =
  | { status: 'ok'; body: string; stderr: string }
  | { status: 'pre_settlement'; error: BuyError; stderr: string } // safe: release reservation
  | { status: 'unresolved'; error: BuyError; stderr: string }; // keep held; buy receipts --resolve

export interface BuyError {
  code?: string;
  message?: string;
  httpStatus?: number;
  retryable?: boolean;
  raw: unknown;
}

export interface BuyRunResult {
  code: number;
  stdout: string;
  stderr: string;
}

/** Injectable subprocess boundary (real impl spawns the buy CLI; tests mock it). */
export type BuyRunner = (argv: string[]) => Promise<BuyRunResult>;

export interface BuyAdapterConfig {
  sandbox: boolean;
  token: BuyToken;
  runner: BuyRunner;
  /** buy keystore account name (from `buy setup --name`). Omit to use the keystore default. */
  account?: string;
}

export class BuyQuoteError extends Error {
  constructor(message: string, public readonly result?: BuyRunResult) {
    super(message);
    this.name = 'BuyQuoteError';
  }
}

export class BuyAdapter {
  constructor(private readonly cfg: BuyAdapterConfig) {}

  private get network(): string {
    return this.cfg.sandbox ? 'celo-sepolia' : 'celo';
  }

  /** Global flags that must precede the subcommand (sandbox, account, json). */
  private globalFlags(opts: { account: boolean }): string[] {
    const flags: string[] = [];
    if (this.cfg.sandbox) flags.push('--sandbox');
    if (opts.account && this.cfg.account) flags.push('--account', this.cfg.account);
    flags.push('--json');
    return flags;
  }

  /** curl args shared by quote and pay. No shell is used; args are passed as an array. */
  private curlArgs(req: BuyRequest): string[] {
    const args: string[] = [req.url, '-X', (req.method ?? 'POST').toUpperCase()];
    const headers = { 'Content-Type': 'application/json', ...(req.headers ?? {}) };
    for (const [k, v] of Object.entries(headers)) args.push('-H', `${k}: ${v}`);
    if (req.bodyJson !== undefined) args.push('-d', JSON.stringify(req.bodyJson));
    return args;
  }

  /** Read the authoritative 402 price. No wallet, never pays. */
  async quote(req: BuyRequest): Promise<QuoteResult> {
    const argv = [...this.globalFlags({ account: false }), 'quote', ...this.curlArgs(req)];

    const res = await this.cfg.runner(argv);
    let parsed: { accepts?: X402Offer[] };
    try {
      parsed = JSON.parse(res.stdout);
    } catch {
      throw new BuyQuoteError('buy quote did not return JSON on stdout', res);
    }
    const accepts = parsed.accepts ?? [];
    const inNetwork = accepts.filter((a) => a.network === this.network);
    if (inNetwork.length === 0) {
      throw new BuyQuoteError(`No x402 offer for network ${this.network}`, res);
    }
    const wantName = TOKEN_OFFER_NAME[this.cfg.token];
    const offer = inNetwork.find((a) => a.extra?.name === wantName) ?? inNetwork[0]!;
    return {
      offer,
      atomic: offer.maxAmountRequired,
      micro: microFromAtomic(offer.maxAmountRequired),
      network: this.network,
      token: this.cfg.token,
    };
  }

  /**
   * Pay for a route, capping auto-pay at `maxMicro` (must be >= the quote). The caller MUST
   * have reserved `maxMicro` in the ledger first, and MUST act on the returned status:
   *   ok            -> commit(actual)       (actual == the quote we capped at)
   *   pre_settlement -> release             (no money left the wallet)
   *   unresolved    -> markUnresolved       (DO NOT retry; resolve via receipts)
   */
  async pay(req: BuyRequest, maxMicro: MicroUsd): Promise<PayOutcome> {
    const maxUsd = usdFromMicro(maxMicro);
    const argv = [
      ...this.globalFlags({ account: true }),
      'curl', '--max-amount', maxUsd, '--token', this.cfg.token,
      ...this.curlArgs(req),
    ];

    const res = await this.cfg.runner(argv);
    if (res.code === 0 && !res.stderr.trim()) {
      return { status: 'ok', body: res.stdout, stderr: res.stderr };
    }
    const error = parseBuyError(res.stderr);
    return { status: classifyError(error), error, stderr: res.stderr };
  }

  /**
   * Best-effort settlement tx hash for the most recent payment, for proof-of-payment evidence.
   * Scans `buy receipts --limit 1` output for a 0x…64-hex hash. The exact receipt JSON shape is
   * pinned during the live sandbox run; until then this regex is a safe fallback.
   */
  async latestReceiptTxHash(): Promise<string | undefined> {
    const argv = [...this.globalFlags({ account: true }), 'receipts', '--limit', '1'];
    try {
      const res = await this.cfg.runner(argv);
      const m = res.stdout.match(/0x[0-9a-fA-F]{64}/);
      return m ? m[0] : undefined;
    } catch {
      return undefined;
    }
  }
}

/** Parse the `--json` stderr error envelope: {"error":{"code":...,"message":...}}. */
export function parseBuyError(stderr: string): BuyError {
  const text = stderr.trim();
  try {
    const obj = JSON.parse(text) as { error?: Record<string, unknown> };
    const e = obj.error ?? (obj as Record<string, unknown>);
    const code = e.code != null ? String(e.code) : undefined;
    const httpStatus = typeof e.httpStatus === 'number' ? e.httpStatus
      : typeof e.status === 'number' ? (e.status as number)
      : undefined;
    return {
      code,
      message: typeof e.message === 'string' ? e.message : undefined,
      httpStatus,
      retryable: typeof e.retryable === 'boolean' ? e.retryable : undefined,
      raw: obj,
    };
  } catch {
    return { message: text || 'unknown buy error', raw: text };
  }
}

/**
 * Decide whether a failed pay is safe to release or must be kept held.
 * Conservative: anything we cannot clearly place BEFORE settlement is treated as unresolved,
 * so budget that might have been spent is never freed.
 */
export function classifyError(e: BuyError): 'pre_settlement' | 'unresolved' {
  const code = (e.code ?? '').toLowerCase();
  const status = e.httpStatus;

  // Never-retry, possibly-spent outcomes.
  if (code.includes('settle_uncertain') || code.includes('provision_failed')) return 'unresolved';
  if (status === 504 || code.includes('timeout') || code === '504') return 'unresolved';

  // Clearly before settlement: no money moved.
  if (status === 503 || code === '503') return 'pre_settlement';
  if (typeof status === 'number' && status >= 400 && status <= 499) return 'pre_settlement';

  // Unknown: keep it held to be safe.
  return 'unresolved';
}

/**
 * Default runner. Spawns the buy CLI with NO shell (args passed as an array, so JSON bodies
 * need no escaping). Set BUY_ENTRY to the absolute path of the CLI's dist/main.js for a clean
 * cross-platform launch (resolved by preflight); otherwise falls back to the `buy` binary on
 * PATH. Keystore env (BUY_HOME, BUY_KEYSTORE_BACKEND) is inherited from process.env.
 */
export function createDefaultRunner(opts: { entry?: string; bin?: string } = {}): BuyRunner {
  const entry = opts.entry ?? process.env.BUY_ENTRY;
  const bin = opts.bin ?? process.env.BUY_BIN ?? 'buy';
  return (argv: string[]) =>
    new Promise<BuyRunResult>((resolve, reject) => {
      const command = entry ? process.execPath : bin;
      const args = entry ? [entry, ...argv] : argv;
      const child = spawn(command, args, {
        env: process.env,
        shell: false,
        windowsHide: true,
      });
      let stdout = '';
      let stderr = '';
      child.stdout.on('data', (d) => (stdout += d.toString()));
      child.stderr.on('data', (d) => (stderr += d.toString()));
      child.on('error', reject);
      child.on('close', (code) => resolve({ code: code ?? -1, stdout, stderr }));
    });
}
