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
1 to 3 short sentences as a friendly padi. If they greet you, greet back warm and add one line on
what you can do. If they ask what you can do, tell them briefly: you research a topic across social
media (X, Reddit, YouTube, Instagram, TikTok) and pull transcripts, dig into Celo on-chain activity,
and do competitor or jobs research on LinkedIn, and you pay for the data yourself so they never touch
a wallet. Give one tiny example they could try. Keep it short. Plain text, no markdown, no em dashes.`;

export interface SynthesisInput {
  prompt: string;
  evidence: Evidence[];
  /** Keep the evidence block under this many characters (default ~ 6k tokens). */
  maxEvidenceChars?: number;
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
    const content = await this.llm.complete(
      [
        { role: 'system', content: SYNTH_SYSTEM },
        { role: 'user', content: user },
      ],
      { temperature: 0.4, maxTokens: 1200 },
    );
    return content.trim();
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
