/**
 * Turn a raw service response into evidence items (and, for YouTube search, into transcribe
 * candidates). The gateway's exact 200 response shapes are pinned live in the Workflow A
 * sandbox run; until then these walk the JSON defensively and never throw.
 *
 * Design: find the most plausible array of result objects, then pull human-readable text and
 * any URL/id from each. Works across differing shapes without hardcoding one provider's keys.
 */

import type { Evidence } from './synthesize.js';

const TEXT_KEYS = ['text', 'title', 'full_text', 'body', 'selftext', 'description', 'content', 'snippet', 'name', 'caption', 'desc'];
const URL_KEYS = ['url', 'link', 'permalink', 'webUrl', 'href'];
const ID_KEYS = ['videoId', 'video_id', 'id', 'vid'];

export function parseBody(body: string): unknown {
  try {
    return JSON.parse(body);
  } catch {
    return undefined;
  }
}

/** Find the longest array of objects anywhere in the JSON (the likely results list). */
function findResultArray(root: unknown): any[] {
  let best: any[] = [];
  const seen = new Set<unknown>();
  const walk = (node: unknown) => {
    if (!node || typeof node !== 'object' || seen.has(node)) return;
    seen.add(node);
    if (Array.isArray(node)) {
      if (node.length > best.length && node.some((x) => x && typeof x === 'object')) best = node;
      node.forEach(walk);
      return;
    }
    for (const v of Object.values(node as Record<string, unknown>)) walk(v);
  };
  walk(root);
  return best;
}

function firstString(obj: Record<string, unknown>, keys: string[]): string | undefined {
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return undefined;
}

export function extractEvidence(source: string, body: string, limit = 10): Evidence[] {
  const root = parseBody(body);
  if (root === undefined) return [];
  const arr = findResultArray(root);
  const items = arr.length ? arr : [root];
  const out: Evidence[] = [];
  for (const item of items.slice(0, limit)) {
    if (!item || typeof item !== 'object') continue;
    const obj = item as Record<string, unknown>;
    const text = firstString(obj, TEXT_KEYS) ?? firstString(obj, ['transcript_text']);
    if (!text) continue;
    const ev: Evidence = { source, excerpt: text };
    const title = firstString(obj, ['title', 'name']);
    if (title) ev.title = title;
    const url = firstString(obj, URL_KEYS);
    if (url) ev.url = url;
    out.push(ev);
  }
  return out;
}

// --- Workflow C: on-chain evidence (SQD + Chainstack JSON-RPC) --------------

const DATASET_KEYS = ['dataset', 'name', 'id', 'slug', 'alias'];

/** Dataset identifiers from an SQD /datasets response (array of strings or objects). */
export function extractDatasetNames(body: string, limit = 50): string[] {
  const root = parseBody(body);
  if (root === undefined) return [];
  const out = new Set<string>();
  const add = (s: unknown) => {
    if (typeof s === 'string' && s.trim() && s.length <= 128) out.add(s.trim());
  };
  const walk = (node: unknown) => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) {
      for (const el of node) {
        if (typeof el === 'string') add(el);
        else walk(el);
      }
      return;
    }
    const obj = node as Record<string, unknown>;
    for (const k of DATASET_KEYS) add(obj[k]);
    for (const v of Object.values(obj)) if (typeof v === 'object') walk(v);
  };
  walk(root);
  return Array.from(out).slice(0, limit);
}

/**
 * Evidence from an on-chain read. The raw JSON IS the evidence here, so we keep a compact,
 * truncated rendering rather than hunting for prose. Never throws on an odd shape.
 */
export function extractChainEvidence(source: string, body: string, maxChars = 800): Evidence[] {
  const root = parseBody(body);
  if (root === undefined) {
    const text = body.trim();
    return text ? [{ source, excerpt: text.slice(0, maxChars) }] : [];
  }
  let rendered: string;
  try {
    rendered = JSON.stringify(root);
  } catch {
    rendered = String(root);
  }
  if (rendered.length > maxChars) rendered = rendered.slice(0, maxChars) + '…';
  return [{ source, excerpt: rendered }];
}

/** Hex quantity -> bigint, or undefined if not a hex string. */
function hexToBig(h: unknown): bigint | undefined {
  if (typeof h !== 'string' || !/^0x[0-9a-fA-F]*$/.test(h)) return undefined;
  try {
    return BigInt(h);
  } catch {
    return undefined;
  }
}

function fmtCelo(wei: bigint): string {
  const whole = wei / 10n ** 18n;
  const frac = (wei % 10n ** 18n).toString().padStart(18, '0').slice(0, 4);
  return `${whole}.${frac} CELO`;
}

export interface ChainCall {
  id: number | string;
  method: string;
  params?: unknown[];
}

/**
 * Decode a Chainstack JSON-RPC batch into human-readable, correctly-labeled evidence by pairing
 * each response (by id) with the request method. Without this, the synthesizer sees raw hex like
 * "0x4e19cb5" with no method and mislabels it (e.g. a block number as a balance).
 */
export function decodeChainBatch(calls: ChainCall[], body: string, source: string): Evidence[] {
  const root = parseBody(body);
  if (root === undefined) return extractChainEvidence(source, body);
  const results = Array.isArray(root) ? root : [root];
  const byId = new Map<string, any>();
  for (const r of results) if (r && typeof r === 'object' && 'id' in (r as object)) byId.set(String((r as any).id), r);

  const lines: string[] = [];
  for (const c of calls) {
    const r = byId.get(String(c.id));
    const res = r?.result;
    const addr = Array.isArray(c.params) && typeof c.params[0] === 'string' ? ` ${c.params[0]}` : '';
    if (r?.error) {
      lines.push(`${c.method}${addr}: error ${JSON.stringify(r.error).slice(0, 80)}`);
      continue;
    }
    switch (c.method) {
      case 'eth_getBalance': {
        const b = hexToBig(res);
        lines.push(`balance${addr}: ${b !== undefined ? fmtCelo(b) : String(res)}`);
        break;
      }
      case 'eth_getTransactionCount': {
        const b = hexToBig(res);
        lines.push(`transaction count (nonce)${addr}: ${b !== undefined ? b.toString() : String(res)}`);
        break;
      }
      case 'eth_blockNumber': {
        const b = hexToBig(res);
        lines.push(`latest block number: ${b !== undefined ? b.toString() : String(res)}`);
        break;
      }
      case 'eth_chainId': {
        const b = hexToBig(res);
        lines.push(`chain id: ${b !== undefined ? b.toString() : String(res)}`);
        break;
      }
      case 'eth_gasPrice': {
        const b = hexToBig(res);
        lines.push(`gas price: ${b !== undefined ? `${(Number(b) / 1e9).toFixed(3)} gwei` : String(res)}`);
        break;
      }
      case 'eth_getCode': {
        lines.push(`code${addr}: ${res === '0x' || res === undefined ? 'none (externally owned account)' : 'contract bytecode present'}`);
        break;
      }
      case 'eth_getLogs': {
        lines.push(`logs${addr}: ${Array.isArray(res) ? `${res.length} event log(s)` : '0'}`);
        break;
      }
      case 'eth_getBlockByNumber':
      case 'eth_getBlockByHash': {
        if (res && typeof res === 'object') {
          const n = hexToBig((res as any).number);
          const ts = hexToBig((res as any).timestamp);
          lines.push(`block: number ${n?.toString() ?? '?'}${ts !== undefined ? `, time ${new Date(Number(ts) * 1000).toISOString()}` : ''}`);
        } else lines.push(`block: ${String(res)}`);
        break;
      }
      case 'eth_getTransactionByHash':
      case 'eth_getTransactionReceipt': {
        if (res && typeof res === 'object') {
          const o = res as any;
          const blk = hexToBig(o.blockNumber);
          lines.push(`tx: from ${o.from ?? '?'} to ${o.to ?? '?'}${o.status ? ` status ${o.status}` : ''}${blk !== undefined ? ` block ${blk.toString()}` : ''}`);
        } else lines.push('tx: not found');
        break;
      }
      default:
        lines.push(`${c.method}${addr}: ${typeof res === 'object' ? JSON.stringify(res).slice(0, 120) : String(res)}`);
    }
  }
  const excerpt = lines.join('; ') || 'no results';
  return [{ source, excerpt: excerpt.slice(0, 800) }];
}

export interface VideoCandidate {
  title: string;
  url: string;
}

export function extractYoutubeCandidates(body: string, limit = 20): VideoCandidate[] {
  const root = parseBody(body);
  if (root === undefined) return [];
  const arr = findResultArray(root);
  const out: VideoCandidate[] = [];
  for (const item of arr.slice(0, limit)) {
    if (!item || typeof item !== 'object') continue;
    const obj = item as Record<string, unknown>;
    let url = firstString(obj, URL_KEYS);
    if (!url) {
      const id = firstString(obj, ID_KEYS);
      if (id && /^[a-zA-Z0-9_-]{11}$/.test(id)) url = `https://www.youtube.com/watch?v=${id}`;
    }
    if (!url) continue;
    const title = firstString(obj, ['title', 'name', 'description']) ?? url;
    out.push({ title, url });
  }
  return out;
}
