/**
 * Queue worker: claims one queued task at a time (FOR UPDATE SKIP LOCKED), runs it through the
 * coordinator, and delivers the result to the user over Telegram. Single-task-at-a-time keeps
 * the shared Groq rate limit and the budget ledger easy to reason about.
 */

import type { TaskRepo } from '../db/repo.js';
import type { Coordinator } from '../agent/coordinator.js';
import type { TelegramClient } from '../telegram/client.js';
import { formatReportForTelegram } from '../telegram/format.js';

export interface WorkerHandle {
  stop(): void;
}

export function runWorker(opts: {
  repo: TaskRepo;
  coordinator: Coordinator;
  client: TelegramClient;
  idleMs?: number;
  onError?: (e: unknown) => void;
}): WorkerHandle {
  const { repo, coordinator, client } = opts;
  const idleMs = opts.idleMs ?? 2000;
  let running = true;

  (async () => {
    while (running) {
      let task;
      try {
        task = await repo.claimNextQueuedTask();
      } catch (e) {
        opts.onError?.(e);
        await delay(idleMs);
        continue;
      }
      if (!task) {
        await delay(idleMs);
        continue;
      }
      try {
        const report = await coordinator.runTask(task);
        const text = formatReportForTelegram(report);
        // Never send an empty message: Telegram rejects it ("message text is empty") and the task
        // would fail after we already did (and paid for) the work. Fall back to a plain note.
        await client.sendMessage(
          task.userId,
          text.trim() || 'I finished working on that but could not put the answer into words. Please try again, or rephrase it.',
          'HTML',
        );
      } catch (e) {
        opts.onError?.(e);
        await repo.setTaskStatus(task.id, 'failed').catch(() => {});
        await client
          .sendMessage(
            task.userId,
            `Sorry, that task failed: ${e instanceof Error ? e.message : 'unknown error'}`,
          )
          .catch(() => {});
      }
    }
  })();

  return {
    stop() {
      running = false;
    },
  };
}

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
