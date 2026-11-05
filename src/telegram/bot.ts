/**
 * Telegram long-polling loop. Each text message becomes a queued task; the worker picks it up,
 * runs it, and replies. In a private chat the user id equals the chat id, which the worker uses
 * to deliver the result.
 */

import type { TaskRepo, WatchRepo, ProofRepo } from '../db/repo.js';
import { TelegramClient, type TgDocument } from './client.js';
import { classifyWorkflow, buildDocPrompt } from '../agent/classify.js';
import { usdFromMicro } from '../budget/money.js';

/** Watchtower limits (spend safety: fewer, less frequent watches). */
const MAX_WATCHES_PER_USER = 5;
const DEFAULT_WATCH_INTERVAL_MIN = 360; // 6 hours
const MIN_WATCH_INTERVAL_MIN = 60; // 1 hour floor

const WELCOME =
  "Hi, I'm MyPadi, your personal assistant. Tell me what you need in plain language and I'll find real " +
  'sources, check them properly, and bring you a clear answer with links. For example: "What are people ' +
  'saying about Celo this week?", "Find flights from Lagos to London next Friday", or "Investigate this ' +
  'Celo wallet 0x...". You can also send me a text document to summarize, or set a watch with ' +
  '"/watch new Celo grants" and I will ping you when something new shows up.';

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
  watches: WatchRepo;
  proof: ProofRepo;
  onError?: (e: unknown) => void;
}): BotHandle {
  const { client, repo, watches, proof } = opts;
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

          // Watchtower commands.
          if (text === '/watches' || text.startsWith('/watch ') || text === '/watch' || text.startsWith('/unwatch')) {
            await repo.upsertUser(String(msg.from.id), msg.from.username);
            await handleWatchCommand(client, watches, chatId, String(msg.from.id), text);
            continue;
          }

          // Proof of payment: show the user what MyPadi has paid for, with settlement tx hashes.
          if (text === '/proof') {
            await repo.upsertUser(String(msg.from.id), msg.from.username);
            await handleProofCommand(client, proof, chatId, String(msg.from.id));
            continue;
          }

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

/** Show the user their last paid service calls with settlement tx hashes (proof of payment). */
async function handleProofCommand(
  client: TelegramClient,
  proof: ProofRepo,
  chatId: number,
  userId: string,
): Promise<void> {
  const calls = await proof.recentPaidCalls(userId, 10);
  if (calls.length === 0) {
    await client.sendMessage(chatId, 'No paid service calls yet. Give me a research task and I will show you exactly what I paid for.');
    return;
  }
  const total = calls.reduce((s, c) => s + c.paidMicro, 0);
  const lines = calls.map((c) => {
    const price = `$${usdFromMicro(c.paidMicro)}`;
    const tx = c.txHash ? ` tx ${c.txHash}` : '';
    return `- ${c.capability} ${price} ${c.token ?? ''} ${c.network ?? ''}${tx}`.replace(/\s+/g, ' ').trim();
  });
  await client.sendMessage(
    chatId,
    `Here is what I have paid for recently (your last ${calls.length} calls, $${usdFromMicro(total)} total). Every line is a real x402 settlement on Celo:\n\n${lines.join('\n')}`,
  );
}

/** Handle /watch, /watches, /unwatch. Watchtower re-checks a query on a schedule and pings on new results. */
async function handleWatchCommand(
  client: TelegramClient,
  watches: WatchRepo,
  chatId: number,
  userId: string,
  text: string,
): Promise<void> {
  // /watches - list active watches.
  if (text === '/watches') {
    const list = await watches.listWatches(userId);
    if (list.length === 0) {
      await client.sendMessage(chatId, 'You have no active watches. Start one with: /watch <what to track>');
      return;
    }
    const lines = list.map((w, i) => `${i + 1}. ${w.query} (every ${w.intervalMin} min)`);
    await client.sendMessage(chatId, `Your watches:\n${lines.join('\n')}\n\nStop one with /unwatch <number>.`);
    return;
  }

  // /unwatch <number> - deactivate by the number shown in /watches.
  if (text.startsWith('/unwatch')) {
    const arg = text.replace('/unwatch', '').trim();
    const n = Number(arg);
    const list = await watches.listWatches(userId);
    if (!arg || !Number.isInteger(n) || n < 1 || n > list.length) {
      await client.sendMessage(chatId, 'Use /unwatch <number> from your /watches list.');
      return;
    }
    const target = list[n - 1]!;
    const ok = await watches.deactivateWatch(userId, target.id);
    await client.sendMessage(chatId, ok ? `Stopped watching: ${target.query}` : 'Could not stop that watch.');
    return;
  }

  // /watch <query> - create a watch.
  const query = text.replace('/watch', '').trim();
  if (!query) {
    await client.sendMessage(
      chatId,
      'Tell me what to keep an eye on. Example: /watch new Celo grants and hackathons. I will check regularly and ping you when something new shows up.',
    );
    return;
  }
  const count = await watches.countActiveWatches(userId);
  if (count >= MAX_WATCHES_PER_USER) {
    await client.sendMessage(chatId, `You already have ${MAX_WATCHES_PER_USER} watches running. Stop one with /unwatch before adding another.`);
    return;
  }
  const interval = Math.max(MIN_WATCH_INTERVAL_MIN, DEFAULT_WATCH_INTERVAL_MIN);
  await watches.createWatch(userId, query, interval);
  await client.sendMessage(
    chatId,
    `Watchtower is on it. I will check "${query}" regularly and message you when there is something new. See all with /watches.`,
  );
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
