# MyPadi sandbox test plan

One pass to verify every workflow on Celo Sepolia (free test USDC) before go-live. Run the paid
checks deliberately: the buy sandbox has a **$0.10 upstream cap per payer per day**, so the full
paid set below is budgeted to stay under it. Free workflows (chat, document, on-chain SQD) do not
count against that cap.

## Prerequisites (do once per session)
- SSH tunnel to the VPS Postgres is up (local port 55432). See `memory/dev-environment`.
- Run `npm run migrate` once so the new `watches` table (Watchtower) exists. The schema is
  idempotent, so it is safe to re-run.
- `.env` has `BUY_MODE=sandbox`, a working `GROQ_API_KEY`, `DATABASE_URL`, and the buy key reachable
  (OS keychain locally; file backend only on the Linux VPS, see `memory/buy-keystore-windows`).
- The live app worker is stopped (`demo-sandbox` claims the task itself; a running worker would race).
- Build is green: `npm run typecheck && npm test` (expect all tests passing).

Each paid command makes REAL sandbox x402 calls and prints the report plus every `service_call`
with its settlement tx hash. The command routes automatically through the classifier, so the prompt
wording is what selects the workflow.

## Routing cheat-sheet (how each prompt is classified)
| Workflow | Triggered by | Paid in sandbox? |
|---|---|---|
| chat | greetings / "who are you" / "what can you do" | free (no buy) |
| intel (A) | default research question | paid: X, Reddit, YouTube (+IG/TikTok, +1 transcript) |
| opportunity (C2) | hackathon, grant, airdrop, bounty, accelerator, fellowship | paid: 3-4 searches |
| travel (D) | flight, airfare, "fly to", round trip | paid: 1 flights.search |
| competitor (B) | linkedin, competitor, hiring, jobs | paid: 2-3 LinkedIn calls |
| on-chain (C) | 0x address / tx hash, or on-chain vocabulary | sandbox: free SQD only (Chainstack is mainnet-only) |
| document (E) | a file uploaded to the Telegram bot | free (no buy) |
| watchtower | `/watch <query>` on the bot; re-checks on a schedule | paid: each check is a research task (budgeted) |
| browser (B-web) | deferred, not built | n/a |

## Day 1: paid workflows (budgeted to stay under the $0.10/day sandbox cap)

Run these in order and stop if you see a sandbox cap / 402 funding error (that means the day's
$0.10 is used up; continue tomorrow).

```powershell
# Travel (~$0.023). Confirms flights.search is wired and the extractor reads the real response.
npm run demo-sandbox -- "Find flights from Lagos to London on 2026-12-05"

# Opportunity discovery (~$0.015-0.02). Hackathons/grants via the search tools.
npm run demo-sandbox -- "Find open hackathons and grants for Celo developers right now"

# Intel report (~$0.03-0.05). The main demo: multi-platform search + a transcript.
npm run demo-sandbox -- "What are people saying about Celo this week? Give a short sourced summary"
```

Expected per run: a readable report, and a `Service calls` list where paid rows show
`[paid] ... tx=0x...`. Paste the travel run output back so the flights extractor can be pinned to the
real response shape.

## Day 2 (or after the cap resets): remaining paid workflow
```powershell
# Competitor / jobs research (~$0.03-0.05). LinkedIn tools.
npm run demo-sandbox -- "Research competitor MiniPay on LinkedIn and recent posts"
```

## Free workflows (run any time, no cap impact)
```powershell
# Chat (no buy): should reply in the polished voice, no "digging in" note, no service calls.
npm run demo-sandbox -- "who are you and what can you do?"

# On-chain in sandbox (free SQD only; Chainstack reads are verified on mainnet in Phase 2).
npm run demo-sandbox -- "Investigate wallet 0xe7C8e60a40436c3ab3875fbdB9b5a26D9518ECc3 on Celo"
```

## Document upload (E) - test on the running bot, not demo-sandbox
Document summarization makes no paid call, so test it through the live/local bot:
1. Start the bot (sandbox or mainnet; it is free either way for this path).
2. Send a small `.txt` or `.md` file (optionally with a caption like "what are the risks?").
3. Expect: "Got your document..." then a summary that cites the file name as the source.
4. Send a `.pdf`: expect the polite "I can read text documents right now..." reply (PDF parsing is a
   planned follow-up).

## Watchtower (recurring watches) - test on the running bot
A new watch has `last_run_at = null`, so the scheduler runs it on its next tick (within ~1 minute):
you do NOT have to wait the full interval for the first check.
1. Start the bot in sandbox. Send: `/watch new Celo grants and hackathons`
2. Within ~1 minute you should get: "Watchtower is now watching..." then a baseline briefing. This
   first check spends like one opportunity/intel task (counts against the $0.10/day sandbox cap).
3. `/watches` lists it; `/unwatch 1` stops it.
4. On later checks (after `interval_min`, default 360), it messages you ONLY when a new result URL
   appears; otherwise it stays silent. Spend is bounded by the ledger caps + a 5-watch-per-user limit.

## What "pass" looks like
- Each paid workflow produces a report and at least one `[paid] ... tx=0x...` settlement row.
- Classifier routes each prompt to the workflow in the cheat-sheet (verify the report style matches).
- Chat and document produce no `service_call` rows.
- No unexpected `unresolved` / `pre_settlement` rows (one or two can happen on flaky upstreams; do
  NOT auto-retry, use `buy receipts --resolve`).

## After sandbox passes
Redeploy the VPS with this code, then resume the go-live runbook at 2.5.5 (ERC-8004 registration),
which requires the mandatory 2.4 identity check first. See `docs/GO-LIVE-RUNBOOK.md`.
