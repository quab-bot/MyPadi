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
