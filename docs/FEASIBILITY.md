# FEASIBILITY: buy catalogue, endpoint picks for Workflows A and C

Status: Phase 1 (local, sandbox only). This is the Phase 1 step-1 checkpoint from CLAUDE.md section 6.

**Catalogue pulled:** `GET https://gateway.usebuy.ai/v1/catalog` — HTTP 200, 277 KB, checked **2026-10-30**.
Prices below are the **authoritative x402 quote** captured by an unauthenticated `POST` to each route
(the 402 response lists the offer price before any wallet is involved). No payment was made; no wallet used.

---

## 0. Gateway facts confirmed from the live catalogue

| Field | Value |
|---|---|
| baseUrl | `https://gateway.usebuy.ai` |
| Payment protocol | x402 v1, scheme `exact` |
| Mainnet | network `celo`, chainId `42220`, payTo `0x20faAca5F980E29639A0FCC6dcA6988E18ed333B` |
| Sandbox | network `celo-sepolia`, chainId `11142220`, same payTo, fund at `/v1/sandbox/fund` |
| ERC-8004 Identity Registry | `0x8004A169FB4a3325136EB29fA0ceB6D2e539a432` (matches CLAUDE.md) |
| Capabilities | 170 paid, 1 free service (SQD) |
| Platforms | x 19, instagram 35, tiktok 32, reddit 22, youtube 32, linkedin 25, flights 2, browser 1, chainstack 1, cencori 1 |

**Mainnet payment tokens** (6 decimals each):
- USDC `0xcebA9300f2b948710d2653dD7B07f33A8B32118C`
- USDT `0x48065fbBE25f71C9282ddf5e1cD6D6A887483D5e`
- USAT `0xD2ab3C9A02DBBAB236BfEC45D1d755DF4267F771`

**Sandbox token:** USDC `0x01C5C0122039549AD1493B8220cABEdD739BC44E` (test funds only).

Atomic amounts are in token base units (÷ 1e6 = USD).

---

## 1. Workflow A — multi-source intel report (MAIN DEMO)

Pipeline: search X + Reddit + YouTube for a topic, pull transcripts of the most relevant videos,
extract and synthesize into a sourced report.

| Tool (capability id) | Route | Request body | Price (live 402) | Pricing model | Sandbox? |
|---|---|---|---|---|---|
| `x.posts.search` | `POST /v1/social/x/posts/search` | `{ query, type?, cursor? }` | **$0.005 / call** (5000 atomic) | `per_call` | **Yes** |
| `reddit.posts.search` | `POST /v1/social/reddit/posts/search` | `{ query, type?, sort?, timeRange?, after? }` | **$0.005 / call** (5000) | `per_call` | **Yes** |
| `youtube.videos.search` | `POST /v1/social/youtube/videos/search` | `{ query, continuationToken? }` | **$0.005 / call** (5000) | `per_call` | **Yes** |
| `monid.youtube.apify.starvibe-youtube-video-transcript` | `POST /v1/social/youtube/tools/apify-starvibe-youtube-video-transcript` | `{ body: { youtube_url \| channel_url, language?, include_transcript_text? }, maxResults }` | **$0.013** (1) / $0.053 (5) / $0.103 (10) | `per_result_bundle`, **NOT prorated** | **Yes** |

### Schema notes (from `inputSchema`)
- **x.posts.search**: `query` required (1-512 chars, X operators like `within_time:1d` allowed). `type` ∈ top|latest|media|people|lists (default top). `cursor` for pagination.
- **reddit.posts.search**: `query` required. `type` ∈ post|community|comment|media|people. `sort` ∈ relevance|hot|top|new|comments. `timeRange` ∈ all|year|month|week|day|hour. `after` is the opaque pagination cursor.
- **youtube.videos.search**: `query` required. `continuationToken` for pagination.
- **transcript**: `body` takes **exactly one** of `youtube_url` (single video, strict 11-char id regex) or `channel_url` (+ `max_videos`/`start_date`/`end_date`). `language` ISO 639-1 (`en`). Set `include_transcript_text: true` to get the plain transcript string. `maxResults` ∈ **{1, 5, 10} only**, billed as a bundle and **not prorated** — pick the smallest bundle that fits (CLAUDE.md warning confirmed live).

### Workflow A budget shape (sandbox + later mainnet)
One report = 3 searches ($0.015) + up to 3 single-video transcripts ($0.039) ≈ **$0.05 / report**.
Well inside the ~$5 budget. The validator must cap transcript bundles at `maxResults: 1` per call unless a task explicitly needs more.

---

## 2. Workflow C — Celo on-chain investigation (SECOND DEMO)

Pipeline: resolve a block/time window and cheap lookups via **free SQD**, then (where a live
authoritative RPC read is needed) a **Chainstack batch**.

| Tool | Route | Request | Price (live 402) | Sandbox? |
|---|---|---|---|---|
| **SQD Portal** (free service `sqd`) | `GET /sqd/datasets`, `/sqd/datasets/{dataset}/head`, `/finalized-head`, `/metadata`, `/timestamps/{ts}/block`; `POST /sqd/datasets/{dataset}/stream`, `/finalized-stream` | per endpoint | **FREE** (120 req/min/IP, burst 20) | n/a (free) |
| `chainstack.celo` | `POST /chainstack/celo` | **raw JSON-RPC array**, batch up to 2000 calls | **$0.01 / batch** (10000 atomic) | **NO** — only `celo` mainnet offered |

### CRITICAL feasibility finding
`chainstack.celo` returns **no `celo-sepolia` offer** — the only offers are mainnet `celo` at $0.01/batch.
There is **no sandbox path** for the paid Chainstack batch. Consequences for Phase 1:
- Phase 1 exercises Workflow C **against free SQD only** (fully testable now, no spend).
- The Chainstack adapter gets **built and unit-tested** (request shaping, batch limit, error handling) but its **paid call is exercised only in Phase 2** on mainnet, or simulated via `eth_call` read-only RPC in Phase 1 (CLAUDE.md allows read-only mainnet RPC reads).
- `chainstack.celo` has `inputSchema: undefined` in the catalogue — it is a raw JSON-RPC passthrough. The validator must enforce the ≤2000-call batch limit and an allowlist of safe read methods (`eth_blockNumber`, `eth_getBlockByNumber`, `eth_call`, `eth_getLogs`, etc.) ourselves.

---

## 3. Paid LLM fallback (optional)

| Tool | Route | Price | Notes |
|---|---|---|---|
| `cencori.v1.chat.completions` | `POST` (cencori) | ~$0.01 / call | model `maximo-atlas-1.3` only (closed beta). Paid fallback when Groq is rate-limited. Mainnet only — confirm sandbox offer before relying on it. |

Primary LLM stays Groq free `openai/gpt-oss-120b` (8K TPM binding limit — compress evidence before synthesis).

---

## 4. Decisions / open items for the next checkpoint

1. **Workflow A is fully sandbox-testable** end to end. Proceed to build core in sandbox (section 6 step 2).
2. **Workflow C**: build on free SQD now; wire Chainstack adapter but defer its paid call to Phase 2 (no sandbox exists). Confirm this split is acceptable — it is forced by the gateway, not a shortcut.
3. Validator allowlist (initial): `x.posts.search`, `reddit.posts.search`, `youtube.videos.search`, `monid.youtube.apify.starvibe-youtube-video-transcript`, `sqd.*` (free), `chainstack.celo` (Phase 2 paid / Phase 1 simulate).
4. Per-call quotes are stable at $0.005 for the three searches; ledger reserves the 402 `maxAmountRequired`, never a guessed price.

Raw catalogue saved to scratchpad for this session; re-pull before go-live since prices and `available` flags can change.
