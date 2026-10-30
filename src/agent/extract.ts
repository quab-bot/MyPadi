/**
 * Turn a raw service response into evidence items (and, for YouTube search, into transcribe
 * candidates). The gateway's exact 200 response shapes are pinned live in the Workflow A
 * sandbox run; until then these walk the JSON defensively and never throw.
 *
 * Design: find the most plausible array of result objects, then pull human-readable text and
 * any URL/id from each. Works across differing shapes without hardcoding one provider's keys.
 */

import type { Evidence } from './synthesize.js';

const TEXT_KEYS = ['text', 'title', 'full_text', 'body', 'selftext', 'description', 'content', 'snippet', 'name'];
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
