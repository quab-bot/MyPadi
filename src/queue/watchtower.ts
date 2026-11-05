/**
 * Watchtower scheduler: periodically runs due watches as normal (budgeted, tagged) research tasks
 * and notifies the user over Telegram ONLY when new results appear. Each check goes through the
 * coordinator, so the ledger caps and the buy daily cap bound all spend. Overlapping ticks cannot
 * double-run a watch: claimDueWatches stamps last_run_at atomically.
 */

import type { TaskRepo, WatchRepo, WatchRow } from '../db/repo.js';
import type { Coordinator } from '../agent/coordinator.js';
import type { TelegramClient } from '../telegram/client.js';
import type { Evidence } from '../agent/synthesize.js';
import { formatReportForTelegram } from '../telegram/format.js';

/** Keep at most this many fingerprints per watch so the stored set cannot grow without bound. */
const MAX_SEEN = 500;

/** Normalise a URL so trivial variations (trailing slash, query, fragment, case) are one item. */
export function normalizeUrl(u: string): string {
  return u
    .trim()
    .replace(/[#?].*$/, '')
    .replace(/\/+$/, '')
    .toLowerCase();
}

/** Stable fingerprints for a result set: the normalized URLs present in the evidence. */
export function fingerprint(evidence: Evidence[]): string[] {
  const out = new Set<string>();
  for (const e of evidence) if (e.url) out.add(normalizeUrl(e.url));
  return Array.from(out);
}

/** Items in `current` not already in `seen`. */
export function newItems(current: string[], seen: string[]): string[] {
  const s = new Set(seen);
  return current.filter((c) => !s.has(c));
}

/** Merge seen + current, newest kept, capped at MAX_SEEN. */
export function mergeSeen(seen: string[], current: string[]): string[] {
  const merged = [...current, ...seen];
  const deduped = Array.from(new Set(merged));
  return deduped.slice(0, MAX_SEEN);
}

export interface WatchtowerHandle {
  stop(): void;
}

export function runWatchtower(opts: {
  watches: WatchRepo;
  repo: TaskRepo;
  coordinator: Coordinator;
  client: TelegramClient;
  /** How often to look for due watches. */
  tickMs?: number;
  /** Max watches processed per tick (limits spend bursts). */
  batch?: number;
  onError?: (e: unknown) => void;
}): WatchtowerHandle {
  const { watches, repo, coordinator, client } = opts;
  const tickMs = opts.tickMs ?? 60_000;
  const batch = opts.batch ?? 3;
  let running = true;

  (async () => {
    while (running) {
      try {
        const due = await watches.claimDueWatches(batch);
        for (const w of due) {
          if (!running) break;
          await runOne(w).catch((e) => opts.onError?.(e));
        }
      } catch (e) {
        opts.onError?.(e);
      }
      await delay(tickMs);
    }
  })();

  async function runOne(w: WatchRow): Promise<void> {
    const taskId = await repo.createTask(w.userId, w.query);
    const task = await repo.getTask(taskId);
    if (!task) return;

    const { report, evidence } = await coordinator.runWatch(task);
    const current = fingerprint(evidence);
    const firstRun = w.seen.length === 0;
    const fresh = newItems(current, w.seen);

    if (firstRun) {
      // Baseline: confirm the watch and send the current picture once.
      await client.sendMessage(
        w.userId,
        `Watchtower is now watching: "${w.query}". Here is the current picture.`,
      );
      await client.sendMessage(w.userId, formatReportForTelegram(report), 'HTML');
    } else if (fresh.length > 0) {
      await client.sendMessage(
        w.userId,
        `Watchtower update on "${w.query}": ${fresh.length} new result(s).`,
      );
      await client.sendMessage(w.userId, formatReportForTelegram(report), 'HTML');
    }
    // No new results on a later run: stay silent.

    await watches.finishWatchRun(w.id, mergeSeen(w.seen, current));
  }

  return {
    stop() {
      running = false;
    },
  };
}

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
