/**
 * Planner: the LLM proposes JSON steps; the validator decides what is runnable.
 *
 * Two passes for an intel report (Workflow A):
 *   1. plan(prompt)            -> search steps (x/reddit/youtube), no URLs needed yet.
 *   2. planTranscripts(...)    -> transcript steps for the most relevant discovered videos.
 *
 * The planner never pays and never sees the wallet. Every step it returns has already passed
 * the validator here, and the coordinator validates again before spending.
 */

import type { Llm } from '../llm/types.js';
import { validateStep, type PlannerStep } from '../tools/validator.js';

export interface PlanResult {
  steps: PlannerStep[];
  warnings: string[];
}

const SEARCH_SYSTEM = `You are MyPadi's planner. The user wants a researched, sourced answer.
Propose search steps using ONLY these tools:

- "x.posts.search": body { "query": string, "type"?: "top"|"latest"|"media"|"people"|"lists" }
- "reddit.posts.search": body { "query": string, "sort"?: "relevance"|"hot"|"top"|"new"|"comments", "timeRange"?: "all"|"year"|"month"|"week"|"day"|"hour" }
- "youtube.videos.search": body { "query": string }

Rules:
- Return STRICT JSON: {"steps":[{"tool":"<id>","input":{...}}, ...]}.
- Derive focused search queries from the user's request. Prefer 1 step per platform (3 total).
- Use ONLY the fields listed. Do not invent fields or tools.
- Keep queries short and specific.`;

const TRANSCRIPT_SYSTEM = `You are MyPadi's planner, second pass. You are given candidate YouTube
videos and the user's request. Choose the few MOST relevant videos to transcribe (depth costs money,
so be selective). Return STRICT JSON:
{"steps":[{"tool":"monid.youtube.apify.starvibe-youtube-video-transcript","input":{"body":{"youtube_url":"<url>","include_transcript_text":true},"maxResults":1}}]}
Rules:
- One step per chosen video, maxResults always 1.
- Only use URLs from the provided candidates. Choose at most the requested number.`;

const ONCHAIN_SYSTEM = `You are MyPadi's planner for Celo on-chain investigation. Propose read-only
steps using ONLY these tools:

- "sqd.head": input { "dataset": string }                       latest block of a dataset
- "sqd.finalized-head": input { "dataset": string }             latest finalized block
- "sqd.block-at-timestamp": input { "dataset": string, "timestamp": <unix seconds> }
- "chainstack.celo": input { "calls": [ { "jsonrpc":"2.0", "id":1, "method":"<read method>", "params":[...] } ] }
  Allowed methods ONLY: eth_blockNumber, eth_chainId, eth_gasPrice, eth_getBalance, eth_getCode,
  eth_getTransactionCount, eth_getBlockByNumber, eth_getBlockByHash, eth_getTransactionByHash,
  eth_getTransactionReceipt, eth_getLogs, eth_call.

Rules:
- Return STRICT JSON: {"steps":[{"tool":"<id>","input":{...}}]}.
- Use ONLY dataset names from the provided list. If none clearly match Celo, omit SQD steps.
- For a 0x address use eth_getBalance / eth_getTransactionCount (params like ["0x...","latest"]).
  For a 0x tx hash use eth_getTransactionByHash or eth_getTransactionReceipt (params ["0x..."]).
- Keep it to a few focused calls. Do not invent tools, methods, or fields.`;

function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const raw = (fenced?.[1] ?? text).trim();
  return JSON.parse(raw);
}

function parseSteps(raw: unknown): PlannerStep[] {
  if (!raw || typeof raw !== 'object') return [];
  const steps = (raw as { steps?: unknown }).steps;
  if (!Array.isArray(steps)) return [];
  return steps
    .filter((s): s is PlannerStep => !!s && typeof s === 'object' && typeof (s as any).tool === 'string')
    .map((s) => ({ tool: (s as any).tool, input: (s as any).input ?? {} }));
}

export class Planner {
  constructor(private readonly llm: Llm) {}

  async plan(prompt: string, sandbox = true): Promise<PlanResult> {
    const content = await this.llm.complete(
      [
        { role: 'system', content: SEARCH_SYSTEM },
        { role: 'user', content: prompt },
      ],
      { json: true, temperature: 0.2 },
    );
    return this.validateAll(content, sandbox);
  }

  async planTranscripts(
    prompt: string,
    candidates: Array<{ title: string; url: string }>,
    maxVideos: number,
    sandbox = true,
  ): Promise<PlanResult> {
    if (candidates.length === 0 || maxVideos <= 0) return { steps: [], warnings: [] };
    const list = candidates
      .slice(0, 20)
      .map((c, i) => `${i + 1}. ${c.title} -> ${c.url}`)
      .join('\n');
    const content = await this.llm.complete(
      [
        { role: 'system', content: TRANSCRIPT_SYSTEM },
        {
          role: 'user',
          content: `User request: ${prompt}\n\nCandidate videos (choose at most ${maxVideos}):\n${list}`,
        },
      ],
      { json: true, temperature: 0.2 },
    );
    return this.validateAll(content, sandbox);
  }

  /**
   * Workflow C: on-chain investigation. `datasets` are the SQD dataset ids discovered by a free
   * sqd.datasets call so the LLM only references ones that exist. In sandbox the validator drops
   * the paid mainnet-only Chainstack steps (they run in Phase 2); SQD reads are free and run now.
   */
  async planOnchain(prompt: string, datasets: string[], sandbox = true): Promise<PlanResult> {
    const dsList = datasets.length ? datasets.slice(0, 40).join(', ') : '(none discovered)';
    const content = await this.llm.complete(
      [
        { role: 'system', content: ONCHAIN_SYSTEM },
        { role: 'user', content: `User request: ${prompt}\n\nAvailable SQD datasets: ${dsList}` },
      ],
      { json: true, temperature: 0.2 },
    );
    return this.validateAll(content, sandbox);
  }

  /** Parse the LLM output and keep only steps that pass the validator for the active mode. */
  private validateAll(content: string, sandbox: boolean): PlanResult {
    const warnings: string[] = [];
    let parsed: unknown;
    try {
      parsed = extractJson(content);
    } catch {
      return { steps: [], warnings: ['planner did not return valid JSON'] };
    }
    const proposed = parseSteps(parsed);
    const steps: PlannerStep[] = [];
    for (const step of proposed) {
      const v = validateStep(step, { sandbox });
      if (v.ok) steps.push({ tool: step.tool, input: v.input });
      else warnings.push(`dropped step ${step.tool}: ${v.errors.join('; ')}`);
    }
    return { steps, warnings };
  }
}
