# MyPadi

Your personal AI assistant on Telegram that actually does the work. Describe a task in plain language
and MyPadi plans the steps, pays for real external services over x402 on [Celo](https://celo.org) (via
[buy](https://usebuy.ai)), checks the results, and replies with a clear, sourced answer. You never
create provider accounts and never touch a wallet; the project wallet pays, under strict budgets. And
because every service call is a public settlement on Celo, the answer comes with receipts you can
click.

- **Telegram bot:** https://t.me/mypadi_bot
- **Live site:** https://mypadi.185-7-81-139.sslip.io
- Built for the Agents on Open Rails hackathon, track Build with buy.

> Talk is cheap. MyPadi brings receipts.

## Demo

[![Watch the MyPadi demo](https://img.youtube.com/vi/l3eyg3YrUSo/hqdefault.jpg)](https://www.youtube.com/watch?v=l3eyg3YrUSo)

Short walkthrough. Click the thumbnail to watch on YouTube.

---

## What MyPadi can do

Each job is planned by an LLM, validated against an allowlist, paid for within budget, and returned
with its sources.

### 1. Intelligence reports (multi-source research)
Searches across X, Reddit, YouTube, Instagram and TikTok, pulls the most relevant YouTube transcripts,
and synthesises one sourced brief with `[1] [2]` citations and honest confidence notes.
- **Ask:** "What are people saying about Celo and stablecoin payments this week?"
- **You get:** a short brief with the key points, each tied to a real source link.

### 2. Opportunity discovery
Finds open hackathons, grants, bounties and airdrops, and lays out each with its amount, deadline,
eligibility and how to apply.
- **Ask:** "Find open Celo or Base grants I can apply for."
- **You get:** a ranked list, soonest deadlines first, with apply links (nothing invented).

### 3. Celo on-chain investigation (read-only)
Looks up wallets and transactions, reads token balances, contract state, gas and fees, using a
Chainstack RPC batch plus the free SQD portal.
- **Ask:** "Investigate the recent on-chain activity of 0x…"
- **You get:** balances, nonce, recent transactions and contract reads, decoded and labeled. (MyPadi
  reads the chain; it does not send transactions for you.)

### 4. Flight search
Searches Google Flights for a route and date and ranks the options.
- **Ask:** "Find flights from Lagos to London on 2026-12-05."
- **You get:** options ranked by price and speed, with airlines, stops and durations.

### 5. Document summaries
Send a text file (txt, md, csv, json, and similar) and MyPadi returns a sourced summary. (PDF reading
is not supported yet.)
- **Do:** upload `notes.md` with a caption like "what are the risks?"
- **You get:** a focused summary citing the file.

### 6. Watchtower (standing watches)
Set a watch and MyPadi re-checks it on a schedule, pinging you only when something new appears.
- **Do:** `/watch new Celo grants`
- **You get:** a baseline briefing now, then a quiet ping later when a new result shows up. Manage with
  `/watches` and `/unwatch <n>`.

### 7. Competitor and jobs research (LinkedIn)
Pulls a company's recent LinkedIn posts and who they are hiring into one brief.
- **Ask:** "Research competitor MiniPay on LinkedIn."

### 8. Proof of payment
See exactly what MyPadi paid for.
- **Do:** `/proof`
- **You get:** your recent paid service calls with prices and Celo settlement tx hashes.

---

## Commands

| Command | What it does |
|---|---|
| `/start`, `/help` | Welcome and a quick tour |
| *(just type a task)* | Research, opportunities, on-chain, flights, LinkedIn, or small talk, auto-routed |
| *(upload a text file)* | Summarise a document |
| `/watch <query>` | Start a standing watch |
| `/watches` | List your active watches |
| `/unwatch <n>` | Stop a watch |
| `/proof` | Show what MyPadi has paid for, with tx hashes |

---

## How it works

Telegram message to Fastify to a task coordinator. An LLM planner proposes JSON steps; a validator
enforces an allowlisted tool, schema-checked input and budget caps; a micro-USD ledger reserves the
authoritative x402 402 quote; the buy adapter runs the paid call; every call is stored with its
endpoint, price and settlement tx hash as evidence; results are synthesised into a reply with sources.
The LLM never sees the wallet key and cannot bypass the ledger.

Spending is bounded by four independent guards: the buy daily account cap, a global reserve-then-commit
ledger with a failure reserve, a per-user cap and a per-task cap.

## Paid services it uses (via buy)

Real x402 calls from the MyPadi wallet into services it does not own:

| Service | Used for | Price |
|---|---|---|
| `x.posts.search`, `reddit.posts.search`, `youtube.videos.search` | social and discussion signal | ~$0.005/call |
| Instagram and TikTok search (apify) | visual and short-video coverage | bundle |
| YouTube transcript (`…starvibe-youtube-video-transcript`) | quotable video text | $0.013/video |
| `flights.search` | Google Flights itineraries | $0.023/call |
| `chainstack.celo` | Celo JSON-RPC batch reads | $0.01/batch |
| LinkedIn company / profile / job / post search | competitor and jobs research | bundle |
| SQD portal | free chain lookups | free |

## Identity and proof of payment

Registered on the Celo ERC-8004 Identity Registry (`0x8004A169FB4a3325136EB29fA0ceB6D2e539a432`) as
**agent 10036**, owned by the agent wallet `0xe7C8e60a40436c3ab3875fbdB9b5a26D9518ECc3`. Its tagged
registration tx is
[`0x506cf0e7…d8d09b`](https://celoscan.io/tx/0x506cf0e7d8812534e7f9ecdf8f4969e5fd8ce25b5ccae287be35dac8f0d8d09b)
(carries the `celo_c42607f62b5b` attribution tag, verified with `npm run verify-tag`). Real settlements
(34 paid calls so far, across intel, on-chain and opportunity tasks) are in
[`docs/PROOF.md`](docs/PROOF.md), generated from the database by `npm run proof`.

## What is not built yet (honest scope)

MyPadi is focused and truthful about its edges. Not shipped: general web browsing / opening arbitrary
links, calendar and planning, email, invoicing or payments execution, and sending on-chain
transactions on your behalf (on-chain is read-only). Documents are text files only (no PDF yet). These
are on the roadmap, not in the product.

## Roadmap: we keep building

MyPadi is live, and we are not stopping here. For the hackathon the project wallet sponsors all usage
under strict budgets; after it, we keep building and expanding. Rolling out next:

- **Web browsing:** open links you send, read and navigate sites, and pull out what matters.
- **Richer documents:** PDFs and images, not just text files.
- **Travel planning:** hotels and full itineraries on top of flight search.
- **Watchtower+:** price, release and website-change alerts, not just topics.
- **Daily briefings and planning:** a lightweight chief-of-staff that organizes your day.
- **Memory:** MyPadi remembers your projects, preferences and past tasks.
- **More buy services and models** as the catalogue grows.
- **Optional user credits:** a top-up tier so power users can fund their own usage, while a free
  daily allowance stays sponsored.

Have something you want MyPadi to do? Tell us, and we will build it.

## Stack

TypeScript, Node 22, Fastify, PostgreSQL (jobs table as queue), Telegram Bot API (long polling), Groq
for planning and synthesis, and the `@celo/buy` CLI behind one adapter. A background Watchtower
scheduler runs standing watches. See `CLAUDE.md` for build and go-live details and `docs/` for
feasibility, proof, submission and runbook.

## Run

```bash
npm install
npm run migrate          # create the schema (users, tasks, service_calls, watches, ...)
npm run typecheck && npm test
npm run start            # starts the bot, worker and watchtower (needs .env; see .env.example)
```

Sandbox end-to-end run of the engine without Telegram:

```bash
npm run demo-sandbox -- "What are people saying about Celo this week?"
```
