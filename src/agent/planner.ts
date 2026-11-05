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

- "x.posts.search": input { "query": string, "type"?: "top"|"latest"|"media"|"people"|"lists" }
- "reddit.posts.search": input { "query": string, "sort"?: "relevance"|"hot"|"top"|"new"|"comments", "timeRange"?: "all"|"year"|"month"|"week"|"day"|"hour" }
- "youtube.videos.search": input { "query": string }
- "monid.instagram.apify.apify-instagram-search-scraper": input { "body": { "search": string, "searchType"?: "hashtag"|"popular"|"user"|"place" }, "maxResults": 1 }
- "monid.tiktok.apify.apidojo-tiktok-scraper": input { "body": { "keywords": [string] }, "maxResults": 1 }

Rules:
- Return STRICT JSON: {"steps":[{"tool":"<id>","input":{...}}, ...]}.
- Derive focused search queries from the user's request. Prefer 1 step per platform.
- Choose the platforms that fit the question. For broad public sentiment use X, Reddit and YouTube;
  add Instagram and/or TikTok when the topic is visual, consumer, cultural, or short-video driven.
  Use 3 to 5 steps total; do not use every platform just because it exists.
- On Instagram and TikTok, maxResults MUST be 1 (cost control). For Instagram prefer searchType
  "hashtag" or "popular". For TikTok put the search terms in the "keywords" array.
- Use ONLY the fields listed. Do not invent fields or tools. Keep queries short and specific.`;

const TRANSCRIPT_SYSTEM = `You are MyPadi's planner, second pass. You are given candidate YouTube
videos and the user's request. Choose the few MOST relevant videos to transcribe (depth costs money,
so be selective). Return STRICT JSON:
{"steps":[{"tool":"monid.youtube.apify.starvibe-youtube-video-transcript","input":{"body":{"youtube_url":"<url>","include_transcript_text":true},"maxResults":1}}]}
Rules:
- One step per chosen video, maxResults always 1.
- Only use URLs from the provided candidates. Choose at most the requested number.`;

const COMPETITOR_SYSTEM = `You are MyPadi's planner for competitor and jobs research on LinkedIn.
Propose steps using ONLY these tools:

- "linkedin.company.posts": input { "company": "<universal name, e.g. microsoft>", "postedWithin"?: "1 month" }
- "linkedin.profile.posts": input { "profile": "<url, slug, or @handle>", "limit"?: <1-20> }
- "monid.linkedin.apify.harvestapi-linkedin-job-search": input { "body": { "jobTitles": ["<title>"], "locations"?: ["<place>"] }, "maxResults": 1 }
- "monid.linkedin.apify.harvestapi-linkedin-post-search": input { "body": { "searchQueries": ["<query>"], "sortBy"?: "date" }, "maxResults": 1 }

Rules:
- Return STRICT JSON: {"steps":[{"tool":"<id>","input":{...}}]}.
- maxResults MUST be 1 on the two apify tools (cost control).
- Pick the few most relevant steps for the request (usually 2 to 3). For a named company use its
  LinkedIn universal name (lowercase, no spaces). Use ONLY the fields listed; do not invent any.`;

const ONCHAIN_SYSTEM = `You are MyPadi's planner for Celo on-chain investigation. Propose read-only
steps using ONLY these tools:

- "sqd.head": input { "dataset": string }                       latest block of a dataset
- "sqd.finalized-head": input { "dataset": string }             latest finalized block
- "sqd.block-at-timestamp": input { "dataset": string, "timestamp": <unix seconds> }
- "chainstack.celo": input { "calls": [ { "jsonrpc":"2.0", "id":1, "method":"<read method>", "params":[...] } ] }
  Allowed methods ONLY: eth_blockNumber, eth_chainId, eth_gasPrice, eth_maxPriorityFeePerGas,
  eth_feeHistory, eth_getBalance, eth_getCode, eth_getTransactionCount, eth_getBlockByNumber,
  eth_getBlockByHash, eth_getTransactionByHash, eth_getTransactionReceipt, eth_getLogs, eth_call.

Rules:
- Return STRICT JSON: {"steps":[{"tool":"<id>","input":{...}}]}.
- Use ONLY dataset names from the provided list. If none clearly match Celo, omit SQD steps.
- For a 0x address use eth_getBalance / eth_getTransactionCount (params like ["0x...","latest"]).
  For a 0x tx hash use eth_getTransactionByHash or eth_getTransactionReceipt (params ["0x..."]).
- For a native CELO balance use eth_getBalance. For an ERC-20 token balance use eth_call with
  params [{"to":"<token contract 0x>","data":"0x70a08231<holder address, no 0x, left-padded to 64 hex>"},"latest"].
  For a token's total supply use eth_call with data "0x18160ddd". Only use eth_call when you have a
  concrete contract address and know the selector.
- Batch several related reads into ONE chainstack.celo call (its "calls" array) rather than many.
- Keep it to a few focused calls. Do not invent tools, methods, or fields.`;

const OPPORTUNITY_SYSTEM = `You are MyPadi's planner for finding opportunities: hackathons, grants,
bounties, airdrops, accelerators, fellowships, and developer programs. Propose search steps using
ONLY these tools:

- "x.posts.search": input { "query": string, "type"?: "latest"|"top" }
- "reddit.posts.search": input { "query": string, "sort"?: "new"|"top", "timeRange"?: "month"|"week"|"year" }
- "youtube.videos.search": input { "query": string }

Rules:
- Return STRICT JSON: {"steps":[{"tool":"<id>","input":{...}}]}.
- Build queries that surface CURRENT, OPEN opportunities with deadlines, e.g. "<topic> hackathon 2026 apply",
  "<ecosystem> grant program open", "<topic> bounty", "<ecosystem> accelerator applications".
- Prefer recent results: use type "latest" on X and sort "new" with a short timeRange on Reddit.
- Use 3 to 4 steps across the platforms. Use ONLY the fields listed. Do not invent fields or tools.`;

const TRAVEL_SYSTEM = `You are MyPadi's planner for flight search. Propose steps using ONLY this tool:

- "flights.search": input { "origin": "<3-letter IATA>", "destination": "<3-letter IATA>", "date": "YYYY-MM-DD", "returnDate"?: "YYYY-MM-DD", "country"?: "<2-letter region, e.g. us, ng, gb>" }

Rules:
- Return STRICT JSON: {"steps":[{"tool":"flights.search","input":{...}}]}.
- Convert city or airport names to the correct 3-letter IATA code (e.g. Lagos -> LOS, London -> LHR, New York -> JFK, Accra -> ACC). If a city has several airports, pick the main international one.
- Resolve relative dates ("next Friday", "in 2 weeks") to an absolute YYYY-MM-DD using the provided current date. Dates MUST be today or later.
- Include returnDate ONLY if the user asked for a round trip. Set "country" to the traveller's region when it is clear (e.g. a Nigerian user -> "ng"), otherwise omit it.
- Usually 1 step. Propose a second step only if the user clearly asked about more than one route or date. Do not invent routes the user did not ask for.`;

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

  /** Workflow B: competitor / jobs research using the allowlisted LinkedIn tools. */
  async planCompetitor(prompt: string, sandbox = true): Promise<PlanResult> {
    const content = await this.llm.complete(
      [
        { role: 'system', content: COMPETITOR_SYSTEM },
        { role: 'user', content: prompt },
      ],
      { json: true, temperature: 0.2 },
    );
    return this.validateAll(content, sandbox);
  }

  /** Workflow C2: opportunity discovery (hackathons/grants/bounties) via the search tools. */
  async planOpportunity(prompt: string, sandbox = true): Promise<PlanResult> {
    const content = await this.llm.complete(
      [
        { role: 'system', content: OPPORTUNITY_SYSTEM },
        { role: 'user', content: prompt },
      ],
      { json: true, temperature: 0.2 },
    );
    return this.validateAll(content, sandbox);
  }

  /** Workflow D: flight search. `today` (YYYY-MM-DD) lets the LLM resolve relative dates safely. */
  async planTravel(prompt: string, today: string, sandbox = true): Promise<PlanResult> {
    const content = await this.llm.complete(
      [
        { role: 'system', content: TRAVEL_SYSTEM },
        { role: 'user', content: `Current date: ${today}\n\nUser request: ${prompt}` },
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
