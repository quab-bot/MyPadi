/**
 * Minimal Telegram Bot API client over long polling (no webhook, outbound only, so it works
 * from behind NAT in dev). Only what MyPadi needs: getUpdates + sendMessage (chunked to the
 * 4096-char limit).
 */

const TG_MAX = 4096;

export interface TgUser {
  id: number;
  username?: string;
  is_bot?: boolean;
}

export interface TgMessage {
  message_id: number;
  from?: TgUser;
  chat: { id: number; type: string };
  text?: string;
}

export interface TgUpdate {
  update_id: number;
  message?: TgMessage;
}

export class TelegramClient {
  private readonly base: string;

  constructor(token: string) {
    if (!token) throw new Error('TELEGRAM_BOT_TOKEN is required.');
    this.base = `https://api.telegram.org/bot${token}`;
  }

  async getMe(): Promise<TgUser> {
    return this.call<TgUser>('getMe', {});
  }

  async getUpdates(offset: number, timeoutSec = 50): Promise<TgUpdate[]> {
    return this.call<TgUpdate[]>('getUpdates', {
      offset,
      timeout: timeoutSec,
      allowed_updates: ['message'],
    });
  }

  async sendMessage(chatId: string | number, text: string): Promise<void> {
    for (const chunk of splitForTelegram(text)) {
      await this.call('sendMessage', { chat_id: chatId, text: chunk, disable_web_page_preview: true });
    }
  }

  private async call<T>(method: string, body: unknown): Promise<T> {
    const res = await fetch(`${this.base}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const json = (await res.json()) as { ok: boolean; result?: T; description?: string };
    if (!json.ok) throw new Error(`Telegram ${method} failed: ${json.description ?? res.status}`);
    return json.result as T;
  }
}

/** Split long text on paragraph/line boundaries so each piece fits Telegram's limit. */
export function splitForTelegram(text: string, max = TG_MAX): string[] {
  if (text.length <= max) return [text];
  const out: string[] = [];
  let buf = '';
  for (const line of text.split('\n')) {
    const piece = line.length > max ? line.slice(0, max) : line;
    if (buf.length + piece.length + 1 > max) {
      if (buf) out.push(buf);
      buf = piece;
    } else {
      buf = buf ? `${buf}\n${piece}` : piece;
    }
  }
  if (buf) out.push(buf);
  return out;
}
