# CLAUDE.md: MyPadi for Agents on Open Rails (Build with buy)

Read this whole file before doing anything. It is the source of truth for this repo.

**MyPadi WILL be submitted to the Agents on Open Rails hackathon on Loops House** (event slug `agents-on-open-rails`, track Build with buy). The local-only lock below is temporary. Its only purpose is to protect the CeloDesk entry, which is being finished in another terminal under a different Loops account.

## How to work with the developer
- He is a beginner and supervises; you build. Guide him one step at a time: what the step does, paste-ready **Windows PowerShell** commands, what he should see, then wait for his OK.
- Research before asking (official docs, package source, this file). Ask only what cannot be looked up, one question at a time.
- Complete connected pieces of work, run checks, report real results. Never claim a test, deploy, registration or transaction worked unless verified. Never fabricate prices, hashes, endpoints or IDs.
- Never commit `.env` or keys. Never print secrets.
- No em dashes in user-facing copy (Telegram messages, README headline copy).

---

## 0. Identity lock (never change, never swap with CeloDesk)

| Field | Value |
|---|---|
| Local folder | `C:\Users\NEW\MyPadi` (CeloDesk lives separately in `C:\Users\NEW\Downloads\CeloDesk`) |
| Repo | https://github.com/quab-bot/MyPadi |
| Loops account | Quab Entertainment (`quabentertainment@gmail.com`) |
| Event slug | `agents-on-open-rails` |
| Attribution tag | `celo_c42607f62b5b` |
| Track | Build with buy |
| Agent wallet | a NEW dedicated MyPadi wallet (address filled in during Phase 1) |

**CeloDesk is a different entry**: repo `Investorquab/CeloDesk`, account `quadribello3@gmail.com`, tag `celo_3fce81a170fc`, wallet `0x00d1E86040d88397F4eB187c38dC527F6659e486`. None of these may ever appear in MyPadi's config, code, Loops entry or transactions. If you see any of them, stop and tell the developer.

The tag is issued by Loops; it is NOT derived from the repo (`codeFromRepo('quab-bot/MyPadi')` would be `celo_8be850b76091`). Always check against the constant, never derive.

---

## PHASE 1: LOCAL BUILD ONLY (active until the unlock gate in Phase 2 passes)

Rules:
- **No Loops.** Do not run `loops`, `npx loopshouse`, or any command from the Loops skill, not even read-only ones. The Loops login is shared across the whole PC; touching it can break the CeloDesk entry.
- **No git push.** Commit locally only. Push is disabled in git (`origin` push URL is `DISABLED`) and denied in `.claude/settings.json`. Do not change either during Phase 1.
- **No mainnet.** No wallet funding, no mainnet transactions, no ERC-8004 registration, no paid mainnet buy calls. buy runs with `--sandbox` only (Celo Sepolia, free test USDC). Read-only mainnet RPC reads and `eth_call` simulations are allowed.
- **No deploys.**
- Never open, read or edit anything outside this folder, especially a CeloDesk folder.
- Local ports 3100+ (CeloDesk uses 3000 and 3001). Own Telegram bot token from @BotFather, never CeloDesk's @celoagentbot. If both projects share a Groq account, rate limits are likely shared; keep test runs light.

### 1A. Build the product (sections 2 to 6 below), sandbox only.

### 1B. Build the Go-Live Kit so registration day is "fill in, run, done"
Everything below must exist, be wired together and be tested (in sandbox or by simulation) before Phase 2:

| File | Purpose |
|---|---|
| `src/config/identity.ts` | Single source for `TAG = 'celo_c42607f62b5b'`, `EVENT_SLUG`, `REPO_URL`, `LOOPS_EMAIL`, `AGENT_WALLET` (from env). Exported and used everywhere; nothing else hardcodes them. |
| `src/chain/attribution.ts` | `@celo/attribution-tags` wrapper (`withAttribution`, `toDataSuffix`) applied where every viem wallet client is created, so no direct tx can go out untagged. |
| Startup assert | App refuses to start if `TAG !== 'celo_c42607f62b5b'`, if any CeloDesk identifier appears in config, or if the wallet address derived from the key does not match `AGENT_WALLET`. |
| `scripts/verify-tag.ts` (`npm run verify-tag -- <txHash>`) | Decodes a mainnet tx with `verifyTx`, prints the codes, exits non-zero unless `celo_c42607f62b5b` is present. |
| `scripts/wallet-new.ts` | Generates the MyPadi wallet key into local `.env` only, prints the address, and prints the paste-ready `buy setup --import` steps (file keystore, `BUY_IMPORT_KEY`). |
| `agent-registration.json` + route serving it | ERC-8004 registration file in the format the official Celo ERC-8004 docs specify (name, description, image, services/endpoints incl. the Telegram bot and API, `x402Support`, `active`). Placeholders only for values that cannot exist yet. Served by Fastify so `agentURI` resolves once deployed. |
| `agent.json` (repo root) | Human-readable mirror for judges, generated from the same config. Never hand-edited. |
| `scripts/register-8004.ts` | Calls `register(agentURI)` on the Identity Registry `0x8004A169FB4a3325136EB29fA0ceB6D2e539a432` from the MyPadi wallet, tagged, gas via USDC feeCurrency adapter `0x2F25deB3848C207fc8E0c34035B3Ba7fC157602B` (or CELO). Reads `agentId` from the `Registered` event and writes it into config. Has `--simulate` (eth_call only) used in Phase 1; real mode refuses to run unless the Phase 2 gate passed. |
| `scripts/preflight.ts` (`npm run preflight`) | One command that checks everything before go-live: tag constant, no CeloDesk identifiers, wallet matches key, buy keystore present and on mainnet, wallet balances, buy daily cap set, Groq key works, Telegram token works, DB reachable, `agentURI` reachable, all placeholders filled. Prints a green/red table. |
| `go-live.config.example.json` | The ONLY place the developer fills values on registration day: `agentWallet`, `publicBaseUrl`, `agentId`, `firstTaggedTxHash`, `loopsProjectUrl`. Everything else reads from it. |
| Deploy setup | Dockerfile or PM2 config, `.env.example` with every variable documented, migration command, and a written deploy runbook for the chosen host. |
| `docs/SUBMISSION.md` | Draft answers for the submission: problem, users, how it works, buy services used and why, depth of integration, budget controls, proof of payment, agent wallet, ERC-8004 agent ID, repo, demo link, user and usage stats. Placeholders only for live values. |
| `docs/PROOF.md` | Template table: date, service, endpoint, price, settlement tx hash, task it served. Filled automatically from the `service_calls` table by `npm run proof`. |
| `docs/GO-LIVE-RUNBOOK.md` | The Phase 2 steps below, in order, with exact commands. |

Phase 1 is finished when: the product works end to end in sandbox, all kit files exist, `npm run preflight` passes every check that can pass before go-live, and `register-8004 --simulate` succeeds. Report this to the developer and **wait**.

---

## PHASE 2: GATE, CLEAN SWITCH, REGISTER AND SUBMIT (same day)

### 2.1 Double-confirmation gate (mandatory)
Do not start Phase 2 on any single message. Ask:
1. "Is CeloDesk finished AND successfully submitted on Loops House?" Wait for yes.
2. Then ask him to confirm a second time by typing exactly: **`CeloDesk submitted, unlock MyPadi`**.
If either answer is missing, unclear, or anything else, stay in Phase 1.

### 2.2 Clean switch (guide step by step, wait after each)
1. Close the CeloDesk Claude Code session and terminal.
2. `loops auth status`: show which account is signed in (should still be quadribello3).
3. `loops auth logout`, then `loops auth status` again: must show signed out.
4. Remove the old installed Loops skill. First list, then show him what you will delete, then delete only after his OK:
   - `Get-ChildItem $HOME\.claude\skills`
   - `Get-ChildItem $HOME\.agents\skills -ErrorAction SilentlyContinue`
   - `Get-ChildItem .\.agents\skills -ErrorAction SilentlyContinue`
   Delete only Loops / agents-on-open-rails skill folders. Never delete other skills.
5. Remove the Phase 1 blocks: delete the deny list in `.claude/settings.json` (keep the file valid JSON) and restore push with `git remote set-url --push origin https://github.com/quab-bot/MyPadi.git`. Check with `git remote -v`.
6. Reinstall fresh in the MyPadi folder: `npx loopshouse add agents-on-open-rails`. Pick Claude Code. When the browser opens, sign in as **quabentertainment@gmail.com**.
7. `loops auth status` must show `quabentertainment@gmail.com`. If not, stop and fix before anything else.
8. Restart Claude Code in the MyPadi folder so the fresh skill loads.

### 2.3 Register the project
1. `loops project get -e agents-on-open-rails`: see whether this account already has a project.
2. `loops project fields -e agents-on-open-rails`: list required fields; map them to `docs/SUBMISSION.md`.
3. Draft `loops project create` (name MyPadi, repo `https://github.com/quab-bot/MyPadi`, track Build with buy). Show the draft. Run with `--confirm` only after an explicit yes.

### 2.4 Identity confirmation (MANDATORY, repeat it every time listed below)
Right after the project exists, and again **before every mainnet transaction, before every deploy, before every `loops project update`, and before final submit**, run this check and show the result as a table:

| Check | Expected |
|---|---|
| `loops auth status` email | `quabentertainment@gmail.com` |
| Tag shown on the Loops entry (ask him to open the playground popup and paste or screenshot it) | `celo_c42607f62b5b` |
| `TAG` in `src/config/identity.ts` | `celo_c42607f62b5b` |
| Agent wallet on the Loops entry | equals `AGENT_WALLET` and the address derived from the MyPadi key |
| Repo on the Loops entry | `https://github.com/quab-bot/MyPadi` |
| Any CeloDesk identifier anywhere | none |

If ANY row does not match: stop, do nothing on-chain, explain the mismatch, and wait. If the Loops entry shows a different tag than `celo_c42607f62b5b`, the Loops entry wins: tell the developer, update `identity.ts` only after he confirms, and rerun the full check. Log each check with a timestamp in `docs/IDENTITY-CHECK.md`.

### 2.5 Go live (ask before each step)
1. Run `scripts/wallet-new.ts` if not already done; import into buy (file keystore); set `buy account cap` (daily cap).
2. Developer adds the MyPadi wallet in the Loops entry popup ("Add your agent wallet"). Re-run 2.4.
3. Developer funds the wallet (USDC, USD₮ or USA₮ on Celo; if USA₮ only, payments use `--token USAT`; keep a little USDC or CELO for the registration gas).
4. Deploy. Confirm `agentURI` resolves publicly. Fill `go-live.config.json`. `npm run preflight` must be all green.
5. Re-run 2.4, then `register-8004` (real mode, tagged). Then `npm run verify-tag -- <txHash>`. Guide him to paste the hash into the Loops "Verify" box and click "Check on Celo". Both on-chain checks must turn green.
6. Re-run 2.4, then switch buy to mainnet and run real tasks (paid calls only after the wallet is on the Loops entry). `npm run proof` to fill `docs/PROOF.md`.
7. Commit, push to `quab-bot/MyPadi` (ask first).

### 2.6 Submit
1. Re-run 2.4.
2. Finalise `docs/SUBMISSION.md` and README with live values.
3. Optional: `loops evaluate -e agents-on-open-rails -s <buy sponsor slug>` to self-score.
4. `loops project update` drafts for every field. Show them all; `--confirm` only after a clear yes.
5. Confirm on the Loops entry that every check is green and the submission shows as submitted. Report the final state.

Deadline: **Mon 9 Nov 2026, 09:00 GMT**. Target: submit by Sun 8 Nov.

---

## 1. Product
MyPadi is a general-purpose AI assistant on Telegram: a user describes a task in plain language, MyPadi plans steps, pays for real external services through buy (x402 on Celo), checks results and returns a sourced report. Users never touch a wallet; the project wallet sponsors usage under strict budgets.

Build with buy is judged on the problem solved and depth of integration, meaning verified paid calls from our wallet into services we do not control, and the growth they create for those services. Independent users are a qualifier. Spamming cheap calls scores nothing. Submission must name services used and include proof of payment. No tag is needed on buy calls themselves (the gateway sends the settlement tx), but every tx we send directly (ERC-8004 registration) must carry the tag.

## 2. Verified facts (checked 2026-10-29 against docs and the published package)
- buy CLI: `npm install -g @celo/buy@0.8.5`, Node 22+. Pin this version.
- `buy curl` handles 402 automatically; `buy quote` prices without paying; `--max-amount` refuses quotes above it before signing; `--token USDC|USDT|USAT`.
- Headless: `BUY_KEYSTORE_BACKEND=file` with `BUY_HOME`; import our key via `buy setup --import` and `BUY_IMPORT_KEY` (env, never an argument).
- Non-TTY runs emit JSON errors on stderr (`{"error":{"code":...}}`); body on stdout.
- `buy account cap <name> <amount>` sets a daily spend cap.
- Gas for buy calls is sponsored by the gateway.
- `--sandbox` = same flow on Celo Sepolia with free test USDC; 0.10 USD upstream per payer per day.
- NEVER auto-retry `504 timeout` (`retryable:false`), `500 settle_uncertain`, `500 provision_failed`; use `buy receipts --resolve`. 4xx/503 happen before settlement.
- Live catalogue: free `GET https://gateway.usebuy.ai/v1/catalog`. The 402 quote is authoritative. Generated routes take `{"queryParams":{...}}` or `{"body":{...}}`; per-result tools need a non-prorated `maxResults` bundle.
- Catalogue: browser rental + 170 data APIs (X 19, Instagram 36, TikTok 33, Reddit 22, YouTube 32, LinkedIn 25, flights 3), free SQD chain data (120 req/min/IP), Chainstack Celo RPC (0.01 per batch up to 2000 calls), Cencori LLM (0.01, `maximo-atlas-1.3` only), Google Places 0.04 / Routes 0.015, AbaPay Nigerian bills and airtime (experimental third party), naira-rates (experimental), Streamlivr (experimental).
- ERC-8004 Identity Registry on Celo mainnet `0x8004A169FB4a3325136EB29fA0ceB6D2e539a432`; `register(agentURI)` mints to the sender and sets it as agent wallet; `agentId` from the `Registered` event.
- Groq free plan `openai/gpt-oss-120b`: 30 RPM, 1K RPD, 8K TPM, 200K TPD. 8K TPM is the binding limit: compress evidence before synthesis, queue LLM work.

## 3. Stack
TypeScript, Node 22, Fastify, PostgreSQL (jobs table as queue, no Redis), Telegram Bot API long polling, Groq (swappable; Cencori via buy as paid fallback), buy CLI spawned as a subprocess behind one adapter. No Next.js, no dashboard.

## 4. Architecture
Telegram → Fastify → Task coordinator → Planner (LLM proposes JSON steps) → Validator (allowlisted tool, schema-valid input, within caps) → Budget ledger (reserve quoted amount) → buy adapter (`buy curl --max-amount <quote>`) → Evidence store (endpoint, price, settlement tx hash, excerpt) → Extract → Synthesize → Telegram reply with sources.

Postgres: users (Telegram numeric id), tasks, steps, service_calls (quote, paid, tx hash, status incl. `unresolved`), budget (global, per user, per task), outputs.

Spending guards, all required: buy daily account cap, global ledger with a demo reserve, per-task and per-user caps. The LLM never sees the key and cannot bypass the ledger.

## 5. Scope
- Workflow A, multi-source intel report (X, Reddit, YouTube search, transcripts): main demo.
- Workflow C, Celo on-chain investigation (SQD + Chainstack batch): second demo.
- Workflow B, competitor/jobs research: stretch, same engine with LinkedIn tools allowlisted.
- Airtime via AbaPay: only if the developer approves; must read back phone number, naira amount and quoted price and get explicit confirmation before paying.
- Budget about $5: $3.50 real tasks, $0.50 failure reserve, $1.00 final demo.

## 6. Phase 1 order of work
1. `docs/FEASIBILITY.md`: pull the live catalogue, pick exact endpoints for A and C, record schemas and live sandbox quotes. Checkpoint.
2. Core in sandbox: Telegram, queue, planner, validator, ledger, buy adapter, Workflow A, tests for ledger and adapter error handling. Checkpoint.
3. Workflow C. Checkpoint.
4. Go-Live Kit (1B). `npm run preflight` and `register-8004 --simulate`. Report and wait for the Phase 2 gate.
