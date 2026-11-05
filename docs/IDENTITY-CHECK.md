# Identity checks (CLAUDE.md 2.4)

Mandatory check run right after the project is created, and again before every mainnet transaction,
every deploy, every `loops project update`, and final submit. Each run is logged here with a timestamp.
If any row does not match: stop, do nothing on-chain, and wait. If the Loops entry shows a different
tag than `celo_c42607f62b5b`, the Loops entry wins.

---

## 2026-11-04 09:57 UTC — right after project create

| Check | Expected | Observed | Result |
|---|---|---|---|
| `loops auth status` email | quabentertainment@gmail.com | quabentertainment@gmail.com | PASS |
| Tag on the Loops entry (`project get` attributionTag) | celo_c42607f62b5b | celo_c42607f62b5b | PASS |
| `TAG` in `src/config/identity.ts` | celo_c42607f62b5b | celo_c42607f62b5b | PASS |
| Agent wallet on the Loops entry | 0xe7C8e60a40436c3ab3875fbdB9b5a26D9518ECc3 (== AGENT_WALLET == key-derived) | 0xe7C8e60a40436c3ab3875fbdB9b5a26D9518ECc3 | PASS |
| Repo on the Loops entry | https://github.com/quab-bot/MyPadi | https://github.com/quab-bot/MyPadi | PASS |
| Any CeloDesk identifier anywhere | none | none found on entry | PASS |

projectId: db43a156-8293-5c8e-b38a-53dd34098096

Note: tag/wallet/repo above read via `loops project get` (the entry's own stored values). Before the
first mainnet transaction, also have the developer open the playground submit popup and visually confirm
the tag shown there, as a second safeguard.

---

## 2026-11-04 11:37 UTC — before ERC-8004 registration (first mainnet tx)

| Check | Expected | Observed | Result |
|---|---|---|---|
| `loops auth status` email | quabentertainment@gmail.com | quabentertainment@gmail.com | PASS |
| Tag on the Loops entry (`project get` attributionTag) | celo_c42607f62b5b | celo_c42607f62b5b | PASS |
| `TAG` in `src/config/identity.ts` | celo_c42607f62b5b | celo_c42607f62b5b | PASS |
| Agent wallet on the Loops entry | 0xe7C8e60a40436c3ab3875fbdB9b5a26D9518ECc3 | 0xe7C8e60a40436c3ab3875fbdB9b5a26D9518ECc3 | PASS |
| Repo on the Loops entry | https://github.com/quab-bot/MyPadi | https://github.com/quab-bot/MyPadi | PASS |
| Any CeloDesk identifier anywhere | none | none | PASS |

Deploy state: app live on VPS (mainnet), `agentURI` https://mypadi.185-7-81-139.sslip.io/agent-registration.json
reachable (HTTP 200, valid TLS), Phase-2 preflight all green. Registration simulate: would mint agentId 10036.
Awaiting developer visual confirmation of the tag in the Loops playground popup + explicit go-ahead before sending.

---

## 2026-11-05 ~10:40 UTC — redeploy (new capabilities) + on-chain registration verification

Redeployed the live mainnet agent with the new features (travel, opportunity, documents, deeper
on-chain, Watchtower, /proof, landing page). Checks:

| Check | Expected | Observed | Result |
|---|---|---|---|
| App startup assert (tag + no CeloDesk ids + wallet==key) | pass | "Identity OK. Tag celo_c42607f62b5b. Mode: MAINNET." | PASS |
| `TAG` in identity.ts | celo_c42607f62b5b | celo_c42607f62b5b | PASS |
| CeloDesk identifiers in operational config/code | none | none (only the guard/docs/tests) | PASS |
| /health tag + mode | celo_c42607f62b5b / mainnet | same | PASS |
| agentURI wallet | 0xe7C8e60a40436c3ab3875fbdB9b5a26D9518ECc3 | same | PASS |

On-chain registration verified via read-only eth_call to the Identity Registry
`0x8004A169FB4a3325136EB29fA0ceB6D2e539a432` (Celo mainnet, forno):
- `ownerOf(10036)` = `0xe7c8e60a40436c3ab3875fbdb9b5a26d9518ecc3` (== AGENT_WALLET). agentId 10036 is ours.
- `tokenURI(10036)` ends `...sslip.io/agent-registration.json` (== agentURI).

Still pending before the next `loops project update` / submit: developer to confirm the Loops-entry
rows (auth email `quabentertainment@gmail.com`, tag, wallet, repo) per 2.4.

---

## 2026-11-05 ~11:00 UTC — final 2.4 check + submission (loops project update --confirm)

All rows read from the live Loops entry via `loops project get` / `loops auth status` (CLI, same
account that owns the entry). Developer approved the update; `--confirm` run only after that yes.

| Check | Expected | Observed | Result |
|---|---|---|---|
| `loops auth status` email | quabentertainment@gmail.com | quabentertainment@gmail.com | PASS |
| Loops entry attributionTag | celo_c42607f62b5b | celo_c42607f62b5b | PASS |
| Loops entry agentWallet | 0xe7C8e60a40436c3ab3875fbdB9b5a26D9518ECc3 | same | PASS |
| Loops entry repoUrl | https://github.com/quab-bot/MyPadi | same | PASS |
| Loops entry firstTaggedTx | 0x506cf0e7...d8d09b | same (matches verify-tag PASS) | PASS |
| Any CeloDesk identifier | none | none | PASS |

Submission state after `loops project update --confirm` (description refreshed to full capabilities,
demoUrl https://mypadi.185-7-81-139.sslip.io, screenshot + logo uploaded): `missing: []`,
`celoTag: celo_c42607f62b5b`. Everything the event asks for is in. MyPadi is submitted.
