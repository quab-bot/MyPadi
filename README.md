# MyPadi

A general-purpose AI assistant on Telegram. Describe a task in plain language and MyPadi plans the
steps, pays for real external services over x402 on Celo (via [buy](https://usebuy.ai)), checks the
results, and returns a sourced answer. Users never create provider accounts and never touch a wallet;
the project wallet sponsors usage under strict budgets.

- Live site: https://mypadi.185-7-81-139.sslip.io
- Telegram bot: https://t.me/mypadi_bot
- Built for the Agents on Open Rails hackathon, track Build with buy.

## What it can do

- **Intelligence reports** across X, Reddit, YouTube, Instagram and TikTok, with video transcripts,
  returned with sources and confidence notes.
- **Opportunity discovery:** open hackathons, grants, bounties and airdrops with deadlines,
  eligibility and how to apply.
- **Celo on-chain investigation:** wallet and transaction lookups, token balances, contract reads,
  gas and fees.
- **Flight search** across routes and dates.
- **Document summaries** from uploaded text files.
- **Watchtower:** standing watches that re-check a topic on a schedule and alert you on new results.
- **Competitor and jobs research** on LinkedIn.
- **`/proof`:** shows exactly what MyPadi paid for, with settlement tx hashes.

## How it works

Telegram message to Fastify to a task coordinator. An LLM planner proposes JSON steps; a validator
enforces an allowlisted tool, schema-checked input and budget caps; a micro-USD ledger reserves the
authoritative 402 quote; the buy adapter runs the paid call; every call is stored with its endpoint,
price and settlement tx hash as evidence; results are synthesised into a reply with sources. The LLM
never sees the wallet key and cannot bypass the ledger.

Spending is bounded by four independent guards: the buy daily account cap, a global reserve-then-commit
ledger with a failure reserve, a per-user cap and a per-task cap.

## Identity and proof of payment

Registered on the Celo ERC-8004 Identity Registry (`0x8004A169FB4a3325136EB29fA0ceB6D2e539a432`) as
**agent 10036**, owned by the agent wallet `0xe7C8e60a40436c3ab3875fbdB9b5a26D9518ECc3`. The tagged
registration tx is
[`0x506cf0e7…d8d09b`](https://celoscan.io/tx/0x506cf0e7d8812534e7f9ecdf8f4969e5fd8ce25b5ccae287be35dac8f0d8d09b).
Proof of payment (service, endpoint, price, settlement tx hash, task) is in [`docs/PROOF.md`](docs/PROOF.md),
generated from the database by `npm run proof`.

## Stack

TypeScript, Node 22, Fastify, PostgreSQL (jobs table as queue), Telegram Bot API (long polling),
Groq for planning and synthesis, and the `@celo/buy` CLI behind one adapter. See `CLAUDE.md` for the
build and go-live details and `docs/` for feasibility, proof, submission and runbook.

## Run

```bash
npm install
npm run migrate          # create the schema
npm run typecheck && npm test
npm run start            # starts the bot, worker and watchtower (needs .env; see .env.example)
```

Sandbox end-to-end run of the engine without Telegram: `npm run demo-sandbox -- "<your prompt>"`.
