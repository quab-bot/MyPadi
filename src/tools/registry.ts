/**
 * Tool registry: the allowlist of capabilities MyPadi may call, each with a strict zod schema
 * and a body/URL builder. The planner may ONLY propose tools in this registry; the validator
 * rejects anything else. Schemas mirror the live inputSchemas recorded in docs/FEASIBILITY.md
 * (checked 2026-10-30).
 */

import { z } from 'zod';

export const GATEWAY_BASE = 'https://gateway.usebuy.ai';

/** 'both' = sandbox + mainnet offers exist; 'mainnet-only' = no celo-sepolia offer (Chainstack). */
export type Network = 'both' | 'mainnet-only';

export interface ToolSpec {
  id: string;
  title: string;
  method: 'GET' | 'POST';
  network: Network;
  /** Free services (SQD) never touch the ledger or buy adapter. */
  free: boolean;
  /** Validates the planner's input. */
  schema: z.ZodTypeAny;
  /** Builds the full request URL from validated input (for path params). */
  url: (input: any) => string;
  /** Builds the request body sent to the route (undefined = no body). */
  buildBody?: (input: any) => unknown;
  /** Human note surfaced in errors/evidence. */
  note?: string;
}

// --- Read-only JSON-RPC methods permitted on the Chainstack passthrough. ---
export const CHAINSTACK_READ_METHODS = new Set([
  'eth_blockNumber',
  'eth_chainId',
  'net_version',
  'eth_gasPrice',
  'eth_getBalance',
  'eth_getCode',
  'eth_getStorageAt',
  'eth_getTransactionCount',
  'eth_getBlockByNumber',
  'eth_getBlockByHash',
  'eth_getBlockReceipts',
  'eth_call',
  'eth_getLogs',
  'eth_getTransactionByHash',
  'eth_getTransactionReceipt',
  'eth_feeHistory',
  'eth_maxPriorityFeePerGas',
]);

// --- Workflow A: social search + transcript ---

const xSearch: ToolSpec = {
  id: 'x.posts.search',
  title: 'Search X posts',
  method: 'POST',
  network: 'both',
  free: false,
  note: '$0.005 per call',
  schema: z
    .object({
      query: z.string().min(1).max(512),
      type: z.enum(['top', 'latest', 'media', 'people', 'lists']).optional(),
      cursor: z.string().min(1).max(4096).optional(),
    })
    .strict(),
  url: () => `${GATEWAY_BASE}/v1/social/x/posts/search`,
  buildBody: (i) => i,
};

const redditSearch: ToolSpec = {
  id: 'reddit.posts.search',
  title: 'Search Reddit',
  method: 'POST',
  network: 'both',
  free: false,
  note: '$0.005 per call',
  schema: z
    .object({
      query: z.string().min(1).max(512),
      type: z.enum(['post', 'community', 'comment', 'media', 'people']).optional(),
      sort: z.enum(['relevance', 'hot', 'top', 'new', 'comments']).optional(),
      timeRange: z.enum(['all', 'year', 'month', 'week', 'day', 'hour']).optional(),
      after: z.string().min(1).max(4096).optional(),
    })
    .strict(),
  url: () => `${GATEWAY_BASE}/v1/social/reddit/posts/search`,
  buildBody: (i) => i,
};

const youtubeSearch: ToolSpec = {
  id: 'youtube.videos.search',
  title: 'Search YouTube videos',
  method: 'POST',
  network: 'both',
  free: false,
  note: '$0.005 per call',
  schema: z
    .object({
      query: z.string().min(1).max(512),
      continuationToken: z.string().min(1).max(4096).optional(),
    })
    .strict(),
  url: () => `${GATEWAY_BASE}/v1/social/youtube/videos/search`,
  buildBody: (i) => i,
};

const YT_URL_RE =
  /^(https?:\/\/)?(www\.)?(youtube\.com\/(watch\?v=|embed\/|v\/|shorts\/)|youtu\.be\/)[a-zA-Z0-9_-]{11}(\?.*)?$/;
const YT_CHANNEL_RE = /^(https?:\/\/)?(www\.)?youtube\.com\/(channel\/|c\/|@)[a-zA-Z0-9_.-]+(\?.*)?$/;

const youtubeTranscript: ToolSpec = {
  id: 'monid.youtube.apify.starvibe-youtube-video-transcript',
  title: 'YouTube video transcript',
  method: 'POST',
  network: 'both',
  free: false,
  note: 'fixed_result_bundle, NOT prorated: $0.013 (1) / $0.053 (5) / $0.103 (10). Prefer maxResults=1.',
  schema: z
    .object({
      body: z
        .object({
          youtube_url: z.string().regex(YT_URL_RE).optional(),
          channel_url: z.string().regex(YT_CHANNEL_RE).optional(),
          language: z.string().regex(/^[a-z]{2}$/).optional(),
          start_date: z.string().optional(),
          end_date: z.string().optional(),
          include_transcript_text: z.boolean().optional(),
        })
        .strict()
        .refine(
          (b) => Boolean(b.youtube_url) !== Boolean(b.channel_url),
          'Provide exactly one of youtube_url or channel_url.',
        ),
      // Bundle size is billed whole and not prorated — keep it as small as the task allows.
      maxResults: z.union([z.literal(1), z.literal(5), z.literal(10)]),
    })
    .strict(),
  url: () => `${GATEWAY_BASE}/v1/social/youtube/tools/apify-starvibe-youtube-video-transcript`,
  buildBody: (i) => i,
};

// --- Workflow A (extended): Instagram + TikTok keyword search. Both have sandbox offers. ---
// Verified against the live catalogue 2026-11-04 (fixed_result_bundle, not prorated).

const instagramSearch: ToolSpec = {
  id: 'monid.instagram.apify.apify-instagram-search-scraper',
  title: 'Search Instagram',
  method: 'POST',
  network: 'both',
  free: false,
  note: 'fixed_result_bundle, NOT prorated: $0.006 (1) / $0.018 (5) / $0.033 (10). Prefer maxResults=1.',
  schema: z
    .object({
      body: z
        .object({
          search: z.string().min(1).max(256),
          searchType: z.enum(['place', 'user', 'hashtag', 'popular']).optional(),
        })
        .strict(),
      maxResults: z.union([z.literal(1), z.literal(5), z.literal(10)]),
    })
    .strict(),
  url: () => `${GATEWAY_BASE}/v1/social/instagram/tools/apify-apify-instagram-search-scraper`,
  buildBody: (i) => i,
};

const tiktokSearch: ToolSpec = {
  id: 'monid.tiktok.apify.apidojo-tiktok-scraper',
  title: 'Search TikTok',
  method: 'POST',
  network: 'both',
  free: false,
  note: 'fixed_result_bundle, NOT prorated: $0.0036 (1) / $0.006 (5) / $0.009 (10). Prefer maxResults=1.',
  schema: z
    .object({
      body: z
        .object({
          keywords: z.array(z.string().min(1).max(256)).min(1).max(5),
          dateRange: z
            .enum([
              'DEFAULT',
              'ALL_TIME',
              'YESTERDAY',
              'THIS_WEEK',
              'THIS_MONTH',
              'LAST_THREE_MONTHS',
              'LAST_SIX_MONTHS',
            ])
            .optional(),
        })
        .strict(),
      maxResults: z.union([z.literal(1), z.literal(5), z.literal(10)]),
    })
    .strict(),
  url: () => `${GATEWAY_BASE}/v1/social/tiktok/tools/apify-apidojo-tiktok-scraper`,
  buildBody: (i) => i,
};

// --- Workflow B: competitor / jobs research on LinkedIn (all have sandbox offers) ---
// Prices and sandbox availability verified live against the catalogue + 402 quotes 2026-10-30.

const linkedinCompanyPosts: ToolSpec = {
  id: 'linkedin.company.posts',
  title: 'LinkedIn company posts',
  method: 'POST',
  network: 'both',
  free: false,
  note: '$0.023 per call',
  schema: z
    .object({
      company: z.string().min(1).max(512), // LinkedIn company universal name, e.g. "microsoft"
      postedWithin: z.string().min(1).max(64).optional(), // e.g. "1 month"
    })
    .strict(),
  url: () => `${GATEWAY_BASE}/v1/social/linkedin/company/posts`,
  buildBody: (i) => i,
};

const linkedinProfilePosts: ToolSpec = {
  id: 'linkedin.profile.posts',
  title: 'LinkedIn profile posts',
  method: 'POST',
  network: 'both',
  free: false,
  note: '$0.023 per call',
  schema: z
    .object({
      profile: z.string().min(1).max(512), // profile URL, slug, or @handle
      limit: z.number().int().min(1).max(20).optional(),
    })
    .strict(),
  url: () => `${GATEWAY_BASE}/v1/social/linkedin/profile/posts`,
  buildBody: (i) => i,
};

// maxResults is pinned to 1: the only bundle size verified by a live sandbox quote
// (job-search $0.007, post-search $0.0215). Larger bundles need a fresh quote before use.
const linkedinJobSearch: ToolSpec = {
  id: 'monid.linkedin.apify.harvestapi-linkedin-job-search',
  title: 'LinkedIn job search',
  method: 'POST',
  network: 'both',
  free: false,
  note: 'result bundle (maxResults pinned to 1): ~$0.007 sandbox',
  schema: z
    .object({
      body: z
        .object({
          jobTitles: z.array(z.string().min(1).max(256)).min(1).max(10),
          locations: z.array(z.string().min(1).max(128)).max(10).optional(),
        })
        .strict(),
      maxResults: z.literal(1),
    })
    .strict(),
  url: () => `${GATEWAY_BASE}/v1/social/linkedin/tools/apify-harvestapi-linkedin-job-search`,
  buildBody: (i) => i,
};

const linkedinPostSearch: ToolSpec = {
  id: 'monid.linkedin.apify.harvestapi-linkedin-post-search',
  title: 'LinkedIn post search',
  method: 'POST',
  network: 'both',
  free: false,
  note: 'result bundle (maxResults pinned to 1): ~$0.0215 sandbox',
  schema: z
    .object({
      body: z
        .object({
          searchQueries: z.array(z.string().min(1).max(512)).min(1).max(10),
          postedLimit: z
            .enum(['any', '1h', '24h', 'week', 'month', '3months', '6months', 'year'])
            .optional(),
          sortBy: z.enum(['relevance', 'date']).optional(),
        })
        .strict(),
      maxResults: z.literal(1),
    })
    .strict(),
  url: () => `${GATEWAY_BASE}/v1/social/linkedin/tools/apify-harvestapi-linkedin-post-search`,
  buildBody: (i) => i,
};

// --- Workflow D: travel (flights). One-shot paid Google Flights search, sandbox on celo-sepolia. ---
// Verified live against the catalogue 2026-11-05: $0.023 per_call, inputSchema below.

const flightsSearch: ToolSpec = {
  id: 'flights.search',
  title: 'Search flights',
  method: 'POST',
  network: 'both',
  free: false,
  note: '$0.023 per call. Google Flights, one-way or round-trip. IATA codes + YYYY-MM-DD dates.',
  schema: z
    .object({
      origin: z.string().regex(/^[A-Za-z]{3}$/), // 3-letter origin IATA code
      destination: z.string().regex(/^[A-Za-z]{3}$/), // 3-letter destination IATA code
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), // departure date
      returnDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), // present => round trip
      country: z.string().regex(/^[A-Za-z]{2}$/).optional(), // 2-letter Google region code
    })
    .strict(),
  url: () => `${GATEWAY_BASE}/v1/travel/flights/search`,
  buildBody: (i) => i,
};

// --- Workflow C: free SQD reads + paid Chainstack batch (mainnet only) ---

const sqdDatasets: ToolSpec = {
  id: 'sqd.datasets',
  title: 'SQD: list datasets',
  method: 'GET',
  network: 'both',
  free: true,
  schema: z.object({}).strict(),
  url: () => `${GATEWAY_BASE}/sqd/datasets`,
};

const sqdDataset = z.object({ dataset: z.string().min(1).max(128) }).strict();

const sqdHead: ToolSpec = {
  id: 'sqd.head',
  title: 'SQD: chain head',
  method: 'GET',
  network: 'both',
  free: true,
  schema: sqdDataset,
  url: (i) => `${GATEWAY_BASE}/sqd/datasets/${encodeURIComponent(i.dataset)}/head`,
};

const sqdFinalizedHead: ToolSpec = {
  id: 'sqd.finalized-head',
  title: 'SQD: finalized head',
  method: 'GET',
  network: 'both',
  free: true,
  schema: sqdDataset,
  url: (i) => `${GATEWAY_BASE}/sqd/datasets/${encodeURIComponent(i.dataset)}/finalized-head`,
};

const sqdBlockAtTimestamp: ToolSpec = {
  id: 'sqd.block-at-timestamp',
  title: 'SQD: block at a timestamp',
  method: 'GET',
  network: 'both',
  free: true,
  schema: z
    .object({ dataset: z.string().min(1).max(128), timestamp: z.number().int().nonnegative() })
    .strict(),
  url: (i) => `${GATEWAY_BASE}/sqd/datasets/${encodeURIComponent(i.dataset)}/timestamps/${i.timestamp}/block`,
  // NOTE: the SQD /stream POST body schema is not yet verified live; added in the Workflow C step.
};

const chainstackCelo: ToolSpec = {
  id: 'chainstack.celo',
  title: 'Celo mainnet JSON-RPC batch',
  method: 'POST',
  network: 'mainnet-only', // no celo-sepolia offer: deferred to Phase 2 (see FEASIBILITY.md)
  free: false,
  note: '$0.01 per batch, up to 2000 read-only calls. No sandbox offer.',
  schema: z
    .object({
      calls: z
        .array(
          z
            .object({
              jsonrpc: z.literal('2.0'),
              id: z.union([z.number(), z.string()]),
              method: z.string().refine((m) => CHAINSTACK_READ_METHODS.has(m), {
                message: 'method is not in the read-only allowlist',
              }),
              params: z.array(z.any()).optional(),
            })
            .strict(),
        )
        .min(1)
        .max(2000),
    })
    .strict(),
  url: () => `${GATEWAY_BASE}/chainstack/celo`,
  buildBody: (i) => i.calls, // gateway expects a raw JSON-RPC array
};

export const TOOLS: ToolSpec[] = [
  xSearch,
  redditSearch,
  youtubeSearch,
  youtubeTranscript,
  instagramSearch,
  tiktokSearch,
  linkedinCompanyPosts,
  linkedinProfilePosts,
  linkedinJobSearch,
  linkedinPostSearch,
  flightsSearch,
  sqdDatasets,
  sqdHead,
  sqdFinalizedHead,
  sqdBlockAtTimestamp,
  chainstackCelo,
];

export const TOOL_IDS = TOOLS.map((t) => t.id);

export function getTool(id: string): ToolSpec | undefined {
  return TOOLS.find((t) => t.id === id);
}
