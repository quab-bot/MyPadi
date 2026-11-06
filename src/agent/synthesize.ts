/**
 * Synthesize a sourced report from collected evidence.
 *
 * Groq's binding limit is 8K tokens/minute, so evidence is compressed (truncated excerpts,
 * capped count) before it is sent. The reply always cites its sources by number.
 */

import type { Llm } from '../llm/types.js';
import { MYPADI_VOICE } from './persona.js';

export interface Evidence {
  /** Short source label, e.g. "X", "Reddit", "YouTube transcript". */
  source: string;
  title?: string;
  url?: string;
  /** Raw text excerpt; truncated before sending to the LLM. */
  excerpt: string;
}

const SYNTH_SYSTEM = `${MYPADI_VOICE}

You just did the legwork and paid for the data. Now brief your padi, using ONLY the numbered evidence.

Length: match the task. A small question gets a few lines. A real research request gets a short
brief with a couple of headers. Never pad to look busy. Lead with the answer, then the key points.

Formatting (Telegram, follow strictly):
- Plain text. No tables, no Markdown headings (#), no backticks.
- Only when the brief truly has sections, put a short header on its own line in **double asterisks**.
- Use "- " for bullets, one short point each. Cite sources inline like [1], [2].
- Finish with a line **Sources**, then one per line. If that evidence item shows a URL in
  parentheses, write: [n] label - URL (bare URL, no angle brackets). If it has NO URL, write just
  [n] label. NEVER write a URL that was not given in the evidence.

Use the exact figures and labels from the evidence; do not reinterpret or relabel them (for example,
never call a block number a balance). If the evidence is thin or conflicting, say so plainly.`;

const CHAT_SYSTEM = `${MYPADI_VOICE}

This is a casual message, not a research job, so DO NOT pretend to have searched anything. Reply in
1 to 3 short sentences. If they greet you, greet back warmly and add one line on what you can do. If
they ask what you can do, tell them briefly: you research any topic across social media (X, Reddit,
YouTube, Instagram, TikTok) and pull video transcripts; investigate Celo on-chain activity (wallets,
transactions, token balances); do competitor and jobs research on LinkedIn; find opportunities like
hackathons, grants and bounties; search flights; and summarize documents they send you. You pay for
the data yourself so they never touch a wallet. Give one tiny example they could try. Keep it short.
Plain text, no markdown, no em dashes.`;

export interface SynthesisInput {
  prompt: string;
  evidence: Evidence[];
  /** Optional per-workflow instruction appended to the system prompt (e.g. how to format flights). */
  guidance?: string;
  /** Keep the evidence block under this many characters (default ~ 6k tokens). */
  maxEvidenceChars?: number;
}

/**
 * Deterministic brief built straight from the evidence, used when the LLM returns empty content or
 * errors. The paid data is already in hand, so the user still gets a useful, sourced answer instead
 * of an empty message. Never empty when `evidence` is non-empty.
 */
export function fallbackReport(prompt: string, evidence: Evidence[], limit = 8): string {
  const items = evidence.slice(0, limit);
  const lines: string[] = [`Here is what I found for: ${prompt}`, ''];
  items.forEach((e, i) => {
    const text = e.excerpt.replace(/\s+/g, ' ').trim().slice(0, 240);
    lines.push(`- [${i + 1}] ${e.source}${e.title ? `: ${e.title}` : ''}${text ? `: ${text}` : ''}`);
  });
  lines.push('', '**Sources**');
  items.forEach((e, i) => {
    const label = `${e.source}${e.title ? ` ${e.title}` : ''}`;
    lines.push(e.url ? `[${i + 1}] ${label} - ${e.url}` : `[${i + 1}] ${label}`);
  });
  return lines.join('\n');
}

export function buildEvidenceBlock(evidence: Evidence[], maxChars: number): { block: string; used: number } {
  const lines: string[] = [];
  let total = 0;
  let used = 0;
  // Budget per item so one huge transcript cannot crowd out the rest.
  const perItem = Math.max(400, Math.floor(maxChars / Math.max(evidence.length, 1)));
  for (let i = 0; i < evidence.length; i++) {
    const e = evidence[i]!;
    const head = `[${i + 1}] ${e.source}${e.title ? `: ${e.title}` : ''}${e.url ? ` (${e.url})` : ''}\n`;
    const excerpt = e.excerpt.slice(0, perItem).replace(/\s+/g, ' ').trim();
    const chunk = `${head}${excerpt}\n\n`;
    if (total + chunk.length > maxChars) break;
    lines.push(chunk);
    total += chunk.length;
    used++;
  }
  return { block: lines.join(''), used };
}

export class Synthesizer {
  constructor(private readonly llm: Llm) {}

  async run(input: SynthesisInput): Promise<string> {
    const maxChars = input.maxEvidenceChars ?? 24_000; // ~6k tokens
    if (input.evidence.length === 0) {
      return 'I could not gather any evidence for this request, so I have nothing to report yet.';
    }
    const { block } = buildEvidenceBlock(input.evidence, maxChars);
    const user = `User request: ${input.prompt}\n\nEvidence:\n${block}`;
    const system = input.guidance ? `${SYNTH_SYSTEM}\n\nFor THIS task specifically:\n${input.guidance}` : SYNTH_SYSTEM;
    let content = '';
    try {
      content = (
        await this.llm.complete(
          [
            { role: 'system', content: system },
            { role: 'user', content: user },
          ],
          { temperature: 0.4, maxTokens: 1200 },
        )
      ).trim();
    } catch {
      content = '';
    }
    // The model occasionally returns empty content (e.g. a reasoning model that spends its token
    // budget before emitting an answer) or the call fails. We already paid for and hold the
    // evidence, so fall back to a deterministic sourced brief rather than returning an empty reply.
    return content || fallbackReport(input.prompt, input.evidence);
  }

  /** Small-talk / meta reply in MyPadi's voice. No evidence, no paid calls. */
  async chat(prompt: string): Promise<string> {
    const content = await this.llm.complete(
      [
        { role: 'system', content: CHAT_SYSTEM },
        { role: 'user', content: prompt },
      ],
      { temperature: 0.6, maxTokens: 300 },
    );
    return content.trim();
  }
}
