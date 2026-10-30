/**
 * Groq client (OpenAI-compatible chat completions). Primary model: openai/gpt-oss-120b.
 *
 * Free-plan limits (CLAUDE.md section 2): 30 RPM, 1K RPD, 8K TPM, 200K TPD. The 8K TPM is the
 * binding limit, so callers must compress evidence before synthesis. This client retries once
 * on a 429 honoring Retry-After, then gives up (never hammers the limit).
 */

import type { ChatMessage, CompleteOptions, Llm } from './types.js';

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';

export class GroqError extends Error {
  constructor(message: string, public readonly status?: number) {
    super(message);
    this.name = 'GroqError';
  }
}

export class GroqClient implements Llm {
  constructor(
    private readonly apiKey: string,
    private readonly model: string,
  ) {
    if (!apiKey) throw new Error('GROQ_API_KEY is required to construct GroqClient.');
  }

  async complete(messages: ChatMessage[], opts: CompleteOptions = {}): Promise<string> {
    const body = {
      model: this.model,
      messages,
      temperature: opts.temperature ?? 0.2,
      ...(opts.maxTokens ? { max_tokens: opts.maxTokens } : {}),
      ...(opts.json ? { response_format: { type: 'json_object' as const } } : {}),
    };

    for (let attempt = 0; attempt < 2; attempt++) {
      const res = await fetch(GROQ_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });

      if (res.status === 429 && attempt === 0) {
        const retryAfter = Number(res.headers.get('retry-after') ?? '2');
        await delay(Math.min(Math.max(retryAfter, 1), 30) * 1000);
        continue;
      }
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new GroqError(`Groq request failed (${res.status}): ${text.slice(0, 300)}`, res.status);
      }

      const json = (await res.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const content = json.choices?.[0]?.message?.content;
      if (typeof content !== 'string') throw new GroqError('Groq returned no content');
      return content;
    }
    throw new GroqError('Groq rate-limited (429) after retry', 429);
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
