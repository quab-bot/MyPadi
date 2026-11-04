/**
 * Synthesize a sourced report from collected evidence.
 *
 * Groq's binding limit is 8K tokens/minute, so evidence is compressed (truncated excerpts,
 * capped count) before it is sent. The reply always cites its sources by number.
 */

import type { Llm } from '../llm/types.js';

export interface Evidence {
  /** Short source label, e.g. "X", "Reddit", "YouTube transcript". */
  source: string;
  title?: string;
  url?: string;
  /** Raw text excerpt; truncated before sending to the LLM. */
  excerpt: string;
}

const SYNTH_SYSTEM = `You are MyPadi. Write a concise report for a TELEGRAM chat using ONLY the
numbered evidence provided.

Formatting (Telegram, follow strictly):
- Plain text. Do NOT use tables. Do NOT use Markdown headings (#) or backticks.
- Put short section headers on their own line wrapped in **double asterisks** for bold.
- Use "- " for bullet points, one short point per line.
- Cite sources inline like [1], [2].
- Finish with a line **Sources** then one source per line. If that evidence item shows a URL in
  parentheses, write: [n] label - URL (bare URL, no angle brackets). If it has NO URL, write just:
  [n] label. NEVER write a URL that was not given in the evidence.

Content: answer the request directly and briefly. Use the exact figures and labels from the evidence;
do not reinterpret or relabel them (for example, do not call a block number a balance). If the
evidence is thin or conflicting, say so plainly. Do not invent facts, URLs, or figures. No em dashes.`;

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
      { temperature: 0.3, maxTokens: 1200 },
    );
    return content.trim();
  }
}
