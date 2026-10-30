/**
 * Telegram long-polling loop. Each text message becomes a queued task; the worker picks it up,
 * runs it, and replies. In a private chat the user id equals the chat id, which the worker uses
 * to deliver the result.
 */

import type { TaskRepo } from '../db/repo.js';
import { TelegramClient } from './client.js';

const WELCOME =
  'Hi, I am MyPadi. Tell me what you want researched in plain language and I will search real sources, ' +
  'check what I find, and reply with a sourced report. Example: "What are people saying about Celo this week?"';

export interface BotHandle {
  stop(): void;
}

export function runBot(opts: {
  client: TelegramClient;
  repo: TaskRepo;
  onError?: (e: unknown) => void;
}): BotHandle {
  const { client, repo } = opts;
  let running = true;
  let offset = 0;

  (async () => {
    while (running) {
      try {
        const updates = await client.getUpdates(offset);
        for (const u of updates) {
          offset = u.update_id + 1;
          const msg = u.message;
          if (!msg?.text || !msg.from) continue;
          const chatId = msg.chat.id;
          const text = msg.text.trim();

          if (text === '/start' || text === '/help') {
            await client.sendMessage(chatId, WELCOME);
            continue;
          }
          if (!text) continue;

          await repo.upsertUser(String(msg.from.id), msg.from.username);
          await repo.createTask(String(msg.from.id), text);
          await client.sendMessage(
            chatId,
            'On it. I will research this and reply with sources. This can take a minute.',
          );
        }
      } catch (e) {
        opts.onError?.(e);
        // Back off briefly on transient polling errors so we do not spin.
        await delay(2000);
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
