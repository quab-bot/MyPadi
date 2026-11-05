# MyPadi submission (draft)

Track: **Build with buy** · Event: `agents-on-open-rails` · Attribution tag: `celo_c42607f62b5b`

Values in **{{curly braces}}** are filled on go-live day from `go-live.config.json` and the live run.
Do not invent any of them; each comes from a real transaction, deploy or Loops entry.

---

## Problem
People constantly need small research and data-gathering jobs done, such as "what are people
saying about X across social platforms", or "trace this Celo wallet's recent activity". Doing this
well means hitting several paid data APIs, each with its own account, key and billing. Most people
will never set that up. MyPadi removes it: one Telegram chat, plain language, and the agent pays for
the right services as it works.

## Who it is for
Anyone on Telegram with a research or monitoring task: founders checking a narrative, analysts
pulling multi-source intel, Celo users investigating on-chain activity. Users never create an
account with any data provider and never touch a wallet.

## How it works
Telegram message -> Fastify -> task coordinator -> planner (LLM proposes JSON steps) -> validator
(allowlisted tool, schema-checked input, within caps) -> budget ledger (reserves the authoritative
402 quote) -> buy adapter (`buy curl --max-amount <quote>`) -> evidence store (endpoint, price,
settlement tx hash, excerpt) -> synthesis -> sourced reply. The LLM never sees the wallet key and
cannot bypass the ledger. Spending is bounded by four independent guards: the `buy` daily account
cap, a global ledger with a failure reserve, a per-user cap and a per-task cap.

## What MyPadi can do
One Telegram chat, several real jobs. Each is planned by the LLM, validated against an allowlist, and
paid for within budget:

- **Intel reports (Workflow A):** multi-source research across X, Reddit, YouTube, Instagram and
  TikTok, including the top YouTube transcripts, returned with sources and confidence notes.
- **Opportunity discovery:** open hackathons, grants, bounties and airdrops, with deadlines,
  eligibility and how to apply (reuses the paid search tools, recency-tuned).
- **On-chain investigation (Workflow C):** Celo wallet and transaction lookups, token balances,
  contract reads, gas and fees.
- **Flight search:** routes and dates via Google Flights.
- **Document summaries:** send a text file and get a sourced summary (free, no paid call).
- **Watchtower:** standing watches that re-check a topic on a schedule and alert you on new results,
  so depth compounds over time (recurring verified paid calls).
- **Competitor and jobs research (Workflow B):** a company's recent LinkedIn posts plus who they hire.

## buy services used and why (depth of integration)
Real paid x402 calls from the MyPadi wallet into services we do not control:

- **x.posts.search** / **reddit.posts.search** / **youtube.videos.search** ($0.005/call each) — social
  signal and discussion.
- **Instagram** and **TikTok** search (apify bundles) — visual and short-video coverage for Workflow A.
- **YouTube transcript** (`monid.youtube.apify.starvibe-youtube-video-transcript`, $0.013/video) —
  turns the top videos into quotable text.
- **flights.search** (`/v1/travel/flights/search`, $0.023/call) — live Google Flights itineraries.
- **chainstack.celo** (`/chainstack/celo`, $0.01/batch) — authoritative Celo JSON-RPC batch reads,
  alongside the free SQD portal for cheap lookups.
- **LinkedIn** (`linkedin.company.posts` / `linkedin.profile.posts` $0.023, apify `job-search` /
  `post-search` bundles) — competitor and jobs research synthesised into one brief.

Depth, not spam: each report chains several different providers, each call is quoted first and paid
only within budget, every paid call is stored with its settlement tx hash as evidence (users can see
their own with `/proof`), and Watchtower turns one-off research into an ongoing, compounding use of
these services. We do not pad the count with repeated cheap calls.

## Budget controls
Global ~$5 ($3.50 real tasks, $0.50 failure reserve, $1.00 final demo). Enforced by the `buy` daily
cap **and** our own micro-USD ledger (reserve-then-commit, never a guessed price — it reserves the
402 `maxAmountRequired`). Never-retry outcomes (504 / settle_uncertain / provision_failed) keep the
budget held and are resolved with `buy receipts --resolve`, never silently retried.

## Proof of payment
See `docs/PROOF.md` (generated from the `service_calls` table by `npm run proof`): date, service,
endpoint, price, settlement tx hash and the task each call served.

## Agent identity
- Agent wallet: **{{agentWallet}}**
- ERC-8004 agent id: **{{agentId}}** on the Identity Registry `0x8004A169FB4a3325136EB29fA0ceB6D2e539a432` (Celo mainnet)
- Registration tx (tagged `celo_c42607f62b5b`): **{{firstTaggedTxHash}}**
- agentURI: **{{publicBaseUrl}}/agent-registration.json**

## Repo and links
- Repo: https://github.com/quab-bot/MyPadi
- Loops entry: **{{loopsProjectUrl}}**
- Demo: **{{demoLink}}** (Telegram bot + a recorded run)

## Users and usage
- Independent users (Telegram): **{{userCount}}**
- Tasks completed: **{{taskCount}}**
- Total paid to services via buy: **{{totalPaid}}**

---

_Live values are populated on go-live day; see `docs/GO-LIVE-RUNBOOK.md`._
