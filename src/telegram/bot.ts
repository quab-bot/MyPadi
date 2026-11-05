/**
 * Telegram long-polling loop. Each text message becomes a queued task; the worker picks it up,
 * runs it, and replies. In a private chat the user id equals the chat id, which the worker uses
 * to deliver the result.
 */

import type { TaskRepo } from '../db/repo.js';
import { TelegramClient, type TgDocument } from './client.js';
import { classifyWorkflow, buildDocPrompt } from '../agent/classify.js';

const WELCOME =
  "Hi, I'm MyPadi, your personal assistant. Tell me what you need in plain language and I'll find real " +
  'sources, check them properly, and bring you a clear answer with links. For example: "What are people ' +
  'saying about Celo this week?", "Find flights from Lagos to London next Friday", or "Investigate this ' +
  'Celo wallet 0x...".';

/** Short, on-voice note while a real research run happens. Skipped for small talk. */
const WORKING_NOTE = "On it. Let me dig in, I'll come back shortly with the findings and sources.";

/** Note shown when a readable document arrives. */
const DOC_NOTE = "Got your document. Let me read it and come back with a summary and the key points.";

/** Largest document we will download and read (2 MB of text). */
const MAX_DOC_BYTES = 2_000_000;
/** Characters of document text kept for the LLM (Groq 8K TPM: stay well under). */
const MAX_DOC_CHARS = 12_000;

/** Decide whether a document is text we can read right now (no PDF/binary parser yet). */
function isReadableText(doc: TgDocument): boolean {
  const mime = (doc.mime_type ?? '').toLowerCase();
  if (mime.startsWith('text/')) return true;
  if (/^application\/(json|xml|x-ndjson|csv|x-yaml|yaml)$/.test(mime)) return true;
  const name = (doc.file_name ?? '').toLowerCase();
  return /\.(txt|md|markdown|csv|tsv|json|log|xml|yml|yaml|ini|conf|ts|js|py|sql|html?)$/.test(name);
}

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
          if (!msg?.from) continue;
          const chatId = msg.chat.id;

          // Document upload: download, read the text, and queue a summary task.
          if (msg.document) {
            await handleDocument(client, repo, chatId, msg.from, msg.document, msg.caption);
            continue;
          }

          if (!msg.text) continue;
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

/** Download a readable document, truncate it, and queue a summary task. */
async function handleDocument(
  client: TelegramClient,
  repo: TaskRepo,
  chatId: number,
  from: { id: number; username?: string },
  doc: TgDocument,
  caption?: string,
): Promise<void> {
  if (doc.file_size && doc.file_size > MAX_DOC_BYTES) {
    await client.sendMessage(chatId, 'That file is a bit large for me right now. Send one under 2 MB, or paste the part you want me to look at.');
    return;
  }
  if (!isReadableText(doc)) {
    await client.sendMessage(
      chatId,
      'I can read text documents right now (txt, md, csv, json, and similar). PDF and image support is coming. For now, send a text file or paste the text.',
    );
    return;
  }

  let text: string;
  try {
    const file = await client.getFile(doc.file_id);
    if (!file.file_path) throw new Error('no file_path');
    text = await client.downloadFileText(file.file_path, MAX_DOC_BYTES);
  } catch {
    await client.sendMessage(chatId, 'I could not download that file. Please try sending it again.');
    return;
  }

  const trimmed = text.slice(0, MAX_DOC_CHARS);
  const name = doc.file_name ?? 'document';
  const note = (caption ?? '').trim();
  const prompt = buildDocPrompt(name, note, trimmed);

  await repo.upsertUser(String(from.id), from.username);
  await repo.createTask(String(from.id), prompt);
  await client.sendMessage(chatId, DOC_NOTE);
}

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
