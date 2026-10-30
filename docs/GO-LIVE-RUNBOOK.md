# MyPadi go-live runbook (Phase 2)

This is the Phase 2 sequence from `CLAUDE.md`, as exact commands. **Do not start any of this until
the double-confirmation gate passes** (CeloDesk submitted, and the developer types the exact unlock
phrase). Every command is Windows PowerShell unless noted. Run the identity check (section 2.4 of
CLAUDE.md) before every mainnet tx, every deploy, every `loops project update`, and before final submit.

> Phase 1 lock reminder: no Loops commands, no `git push`, no mainnet, no deploys until the gate passes.

---

## 0. Gate (mandatory, do not skip)
1. Ask: "Is CeloDesk finished AND successfully submitted on Loops House?" Wait for an explicit yes.
2. Ask the developer to type exactly: `CeloDesk submitted, unlock MyPadi`.
If either is missing or unclear, stay in Phase 1.

## 1. Clean switch (guide one step at a time, wait after each)
1. Close the CeloDesk Claude Code session and terminal.
2. `loops auth status`            # expect quadribello3 still signed in
3. `loops auth logout` then `loops auth status`   # expect signed out
4. List installed skills, show what will be deleted, delete ONLY Loops / agents-on-open-rails folders:
   - `Get-ChildItem $HOME\.claude\skills`
   - `Get-ChildItem $HOME\.agents\skills -ErrorAction SilentlyContinue`
   - `Get-ChildItem .\.agents\skills -ErrorAction SilentlyContinue`
5. Remove Phase 1 blocks:
   - Delete the `permissions.deny` list in `.claude/settings.json` (keep valid JSON).
   - `git remote set-url --push origin https://github.com/quab-bot/MyPadi.git`
   - `git remote -v`            # confirm push is restored
6. `npx loopshouse add agents-on-open-rails`   # pick Claude Code; sign in as quabentertainment@gmail.com
7. `loops auth status`          # MUST show quabentertainment@gmail.com, else stop and fix
8. Restart Claude Code in the MyPadi folder so the fresh skill loads.

## 2. Identity check (run now, and before every on-chain/deploy/update/submit step)
Fill `docs/IDENTITY-CHECK.md` with a timestamped row each time. All rows must match:

| Check | Expected |
|---|---|
| `loops auth status` email | `quabentertainment@gmail.com` |
| Tag on the Loops entry (playground popup) | `celo_c42607f62b5b` |
| `TAG` in `src/config/identity.ts` | `celo_c42607f62b5b` |
| Agent wallet on the Loops entry | equals `AGENT_WALLET` and the key-derived address |
| Repo on the Loops entry | `https://github.com/quab-bot/MyPadi` |
| Any CeloDesk identifier anywhere | none |

If the Loops entry shows a different tag, the Loops entry wins: tell the developer, update
`identity.ts` only after confirmation, rerun the whole check.

## 3. Register the Loops project
1. `loops project get -e agents-on-open-rails`
2. `loops project fields -e agents-on-open-rails`   # map to docs/SUBMISSION.md
3. Draft `loops project create` (name MyPadi, repo https://github.com/quab-bot/MyPadi, track Build with buy);
   show the draft; run with `--confirm` only after an explicit yes.

## 4. Wallet + buy on mainnet
1. `npm run wallet-new`          # if not already generated; writes AGENT_PRIVATE_KEY/AGENT_WALLET to .env
2. Import into the buy FILE keystore on MAINNET (key via env, never an argument):
   ```powershell
   $env:BUY_KEYSTORE_BACKEND="file"; $env:BUY_HOME="./buy-home"
   $env:BUY_IMPORT_KEY="<AGENT_PRIVATE_KEY from .env>"
   buy setup --import --name mypadi --network mainnet
   buy account cap mypadi 1.00
   ```
3. In the Loops entry popup, add the MyPadi wallet ("Add your agent wallet"). Re-run section 2.
4. Fund the wallet: USDC / USD₮ / USA₮ on Celo, plus a little CELO (or USDC via the feeCurrency
   adapter) for the registration gas. If funded only with USA₮, set `BUY_TOKEN=USAT`.

## 5. Deploy
1. Set `BUY_MODE=mainnet` in the server `.env`. Fill `go-live.config.json` from
   `go-live.config.example.json` (agentWallet, publicBaseUrl, loopsProjectUrl).
2. `npm run gen-registration`    # writes agent-registration.json + agent.json from config
3. Deploy (Docker: `docker build -t mypadi . && docker run ... ` with env + a volume at /data/buy-home;
   or PM2: `npm run migrate` then `pm2 start ecosystem.config.cjs`).
4. Confirm the agentURI resolves publicly: open `{{publicBaseUrl}}/agent-registration.json`.
5. `MYPADI_PHASE=2 npm run preflight`   # must be all green (no FAIL, no PENDING)

## 6. Register ERC-8004 (tagged) and verify
1. Re-run section 2 (identity check).
2. `MYPADI_PHASE=2 npm run register-8004 -- --confirm`
   - sends the tagged `register(agentURI)` tx, reads `agentId`, writes agentId + firstTaggedTxHash
     into `go-live.config.json`.
3. `npm run gen-registration`    # refresh the files with the new agentId
4. `npm run verify-tag -- <txHash>`   # must print PASS with celo_c42607f62b5b
5. In the Loops entry, paste the hash into the Verify box and click "Check on Celo". Both on-chain
   checks must turn green.

## 7. Real tasks + proof
1. Re-run section 2.
2. With `BUY_MODE=mainnet`, run the real demo tasks via the Telegram bot (paid calls only after the
   wallet is on the Loops entry).
3. `npm run proof`               # fills docs/PROOF.md from the service_calls table
4. Commit and push to quab-bot/MyPadi (ask the developer first).

## 8. Submit
1. Re-run section 2.
2. Finalise `docs/SUBMISSION.md` and README with the live values.
3. Optional: `loops evaluate -e agents-on-open-rails -s <buy sponsor slug>` to self-score.
4. `loops project update` drafts for every field; show them all; `--confirm` only after a clear yes.
5. Confirm on the Loops entry that every check is green and the submission shows as submitted.

Deadline: **Mon 9 Nov 2026, 09:00 GMT**. Target: submit by Sun 8 Nov.
