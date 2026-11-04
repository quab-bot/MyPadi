/**
 * Telegram long-polling loop. Each text message becomes a queued task; the worker picks it up,
 * runs it, and replies. In a private chat the user id equals the chat id, which the worker uses
 * to deliver the result.
 */

import type { TaskRepo } from '../db/repo.js';
import { TelegramClient } from './client.js';
import { classifyWorkflow } from '../agent/classify.js';

const WELCOME =
  'How far, I be MyPadi, your padi for getting things done. Tell me what you want in plain language and ' +
  'I go find real sources, check am well well, and bring you the gist. For example: "What are people ' +
  'saying about Celo this week?", or "Investigate this Celo wallet 0x...". No wahala, I dey ground.';

/** Short, on-voice note while a real research run happens. Skipped for small talk. */
const WORKING_NOTE = 'On it, my padi. Let me dig in and come back with the gist and sources shortly.';

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
          // Only promise research when we are actually about to research. Small talk gets a quick
          // reply from the worker instead, so a "digging in" note there would be a lie.
          if (classifyWorkflow(text).workflow !== 'chat') {
            await client.sendMessage(chatId, WORKING_NOTE);
          }
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
