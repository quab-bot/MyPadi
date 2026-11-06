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
Real paid x402 calls from the MyPadi wallet into services we do not control.

**Exercised with real settlements (see `docs/PROOF.md`, each with its settlement tx hash):**

- **x.posts.search** / **reddit.posts.search** / **youtube.videos.search** ($0.005/call each): social
  signal and discussion.
- **YouTube transcript** (`monid.youtube.apify.starvibe-youtube-video-transcript`, $0.013/video):
  turns the top videos into quotable text.
- **TikTok search** (`monid.tiktok.apify.apidojo-tiktok-scraper`, apify bundle): short-video coverage
  for Workflow A.
- **chainstack.celo** (`/chainstack/celo`, $0.01/batch): authoritative Celo JSON-RPC batch reads,
  alongside the free SQD portal for cheap lookups.

**Wired and callable, not yet exercised with a paid settlement** (built into the tool registry and
allowlist, but no paid row in `docs/PROOF.md` yet, so we do not claim them as proof):

- **Instagram search** (apify bundle): visual coverage for Workflow A.
- **flights.search** (`/v1/travel/flights/search`, $0.023/call): Google Flights itineraries.
- **LinkedIn** (`linkedin.company.posts` / `linkedin.profile.posts`, apify `job-search` /
  `post-search` bundles): competitor and jobs research.

Depth, not spam: each report chains several different providers, each call is quoted first and paid
only within budget, every paid call is stored with its settlement tx hash as evidence (users can see
their own with `/proof`), and Watchtower turns one-off research into an ongoing, compounding use of
these services. We do not pad the count with repeated cheap calls.

## Demand created for the services we pay
Build with buy rewards real demand sent to providers, not call volume. Two things make MyPadi's
demand real and growing, and both are measurable:

- **Fan-out per task.** One plain-language task fans out into several paid calls across *different*
  providers (a single intel report hits X, Reddit, YouTube, a transcript provider and TikTok). The
  per-provider breakdown is in `docs/DEMAND.md` (`npm run demand`), generated from real paid rows.
- **Recurring demand via Watchtower.** A standing watch re-runs its research on a schedule, so each
  active watch turns one-off research into repeat paid traffic to the same providers over time. The
  per-day table in `docs/DEMAND.md` is where this shows up.

**Provider-side proof, independently checkable.** Each paid call is a USDC transfer from the agent
wallet `0xe7C8…ECc3` to the provider's recipient address, settled on Celo. A provider can verify the
revenue we send them from their own side, by the settlements their address receives; each row in
`docs/PROOF.md` links to that on-chain transfer. (Verified example: settlement `0x4ef72162…` is a
0.005 USDC transfer from the agent wallet to the provider recipient `0x20faAca5…` on Celo mainnet.)

## Use case: a real task (before / after)
One real end-to-end run from the live bot (logged in the database, settlements in `docs/PROOF.md`,
2026-11-04). The "after" figures are measured; the "before" is a labelled estimate.

- User / context: a Telegram user doing a market-sentiment check, with no data-provider account and
  no wallet of their own.
- Task asked: "What are people saying about MiniPay and mobile money in Africa across social media?"
- What MyPadi paid for (one run, 5 providers, 6 paid calls, $0.0446 total, each with a settlement tx
  hash on Celo mainnet):
  - X search $0.005, Reddit search $0.005, YouTube search $0.005, TikTok search $0.0036, and two
    YouTube transcripts $0.013 each.
- Before MyPadi (estimate): to do this by hand you would open and pay for separate access to X,
  Reddit, YouTube and TikTok data plus a transcript tool, each with its own signup, key and usually a
  monthly minimum, then query each and collate by hand. Realistically tens of dollars a month in
  minimums and roughly 20 to 30 minutes per question.
- After MyPadi (measured): one Telegram message, $0.0446 for that run, a sourced answer in 103
  seconds, no accounts and no wallet for the user.

## Budget controls
Global ~$5 ($3.50 real tasks, $0.50 failure reserve, $1.00 final demo). Enforced by the `buy` daily
cap **and** our own micro-USD ledger (reserve-then-commit, never a guessed price, it reserves the
402 `maxAmountRequired`). Never-retry outcomes (504 / settle_uncertain / provision_failed) keep the
budget held and are resolved with `buy receipts --resolve`, never silently retried.

## Proof of payment
See `docs/PROOF.md` (generated from the `service_calls` table by `npm run proof`): date, service,
endpoint, price, settlement tx hash and the task each call served.

## Agent identity (verified on-chain 2026-11-05)
- Agent wallet: **0xe7C8e60a40436c3ab3875fbdB9b5a26D9518ECc3**
- ERC-8004 agent id: **10036** on the Identity Registry `0x8004A169FB4a3325136EB29fA0ceB6D2e539a432` (Celo mainnet). `ownerOf(10036)` returns the agent wallet; `tokenURI(10036)` returns the agentURI below.
- Registration tx (tagged `celo_c42607f62b5b`, verified with `npm run verify-tag`): **0x506cf0e7d8812534e7f9ecdf8f4969e5fd8ce25b5ccae287be35dac8f0d8d09b**
- agentURI: **https://mypadi.185-7-81-139.sslip.io/agent-registration.json**

## Repo and links
- Repo: https://github.com/quab-bot/MyPadi
- Live site: https://mypadi.185-7-81-139.sslip.io  ·  Telegram bot: https://t.me/mypadi_bot
- Demo video: https://www.youtube.com/watch?v=l3eyg3YrUSo
- Loops entry: project `mypadi-04c1a` (`db43a156-8293-5c8e-b38a-53dd34098096`), event `agents-on-open-rails`

## Users and usage
Live figures come from the database on the VPS; regenerate with `npm run proof` (see `docs/PROOF.md`).
The proof log holds 54 paid x402 settlements so far: **45 on Celo mainnet** ($0.3016) and **9 earlier
on Celo Sepolia testnet** ($0.069) during the sandbox build, each labelled in the Network column.
They span several workflows: intel (X / Reddit / YouTube + transcripts, TikTok) and on-chain
(Chainstack batches); the per-provider and per-day breakdown is in `docs/DEMAND.md`. Every mainnet row
is a real USDC settlement from the agent wallet, and can be checked independently: for example
settlement `0x4ef72162…` carries a USDC transfer of 0.005 from the agent wallet `0xe7C8…ECc3` on Celo
mainnet, matching its row.

---

_Live values are populated on go-live day; see `docs/GO-LIVE-RUNBOOK.md`._
