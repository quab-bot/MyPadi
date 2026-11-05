# MyPadi — Master Hackathon Video Production Prompt
## Premium ~2:40 product film for *Agents on Open Rails* (Celo, Build with buy)

You are acting as a world-class product filmmaker, creative director, documentary-style commercial
director, senior motion designer, sound designer, voiceover director, and a technically rigorous
Web3 product storyteller.

Create a polished, cinematic, **technically accurate** demonstration video for **MyPadi**, a
general-purpose AI assistant on Telegram that does real tasks by paying for real services over x402
on **Celo mainnet** and bringing back the answer with on-chain receipts.

This is not a storyboard request. Inspect the repository and the running product, design the
narrative, produce the assets, generate the voiceover, edit and render the video, inspect the output,
and fix issues before declaring it complete. The result should feel like a sophisticated consumer-AI
product film with warmth and character — **not** a template hackathon video, a generic blockchain
advert, an AI slideshow, or a narrated screen recording.

Primary audience: the *Agents on Open Rails* judges (Build with buy track). Secondary: everyday
Telegram users and developers/agents who could use or build on MyPadi.

The film must land three things:
1. The problem is real and instantly understood: AI assistants talk, but they don't actually go do
   the paid work and prove it.
2. MyPadi has a distinctive, **working** solution on Celo mainnet: you ask in plain words, it pays
   real services with its own wallet, and it comes back with a sourced answer and on-chain receipts.
3. It is worth using and building on.

Make it memorable through clarity, character, visual precision and demonstrable functionality — never
exaggerated claims or effects.

---

# WHAT MAKES OURS DIFFERENT (read this first)

Do not copy the fintech "payment desk / doors / ledger" treatment of other entries. MyPadi's film has
its own spine:

- **The idea: "Talk is cheap. MyPadi brings receipts."** Other assistants answer from memory and
  hope. MyPadi dispatches real, paid services, then hands you the answer *stapled to its receipts* —
  actual Celo settlement tx hashes you can click. The signature motif of the whole film is **the
  receipt trail**: a thin printed tape of real tx hashes that threads through every scene and pays
  off in the `/proof` reveal.
- **The character: the padi.** MyPadi is a friendly robot "padi" (Nigerian for a close, trusted
  friend). Give it warmth and personality — it is the one AI that feels like a sharp friend who
  actually gets things done, not a corporate tool. This human warmth, over genuine on-chain rigor, is
  the tone no other entry will have.
- **The surface: a real Telegram chat.** The product lives in one chat thread. The film should feel
  native to that — real messages arriving, real replies, with the heavy machinery (planning, paying,
  verifying) revealed *behind* the chat, not instead of it.

One line: **MyPadi is the assistant that pays its own way — you ask in plain words, it hires and pays
real services on Celo, and brings back the answer with receipts.**

Tagline: **"Ask in plain words. Get real work back, with receipts."**

---

# PART 1 — NON-NEGOTIABLE REQUIREMENTS

## Deliverable
- Landscape video, ~**2:40** (acceptable 2:20–3:00 if the story needs it).
- 1920×1080, 16:9, 30 fps, MP4 (H.264 video, AAC audio).
- Clear natural narration, mixed music, restrained sound design.
- Presentation-ready for a competitive hackathon.

Primary filename: `MyPadi_AgentsOnOpenRails_Master.mp4`
Output folder: `video/` — keep source assets, narration, music licenses/attribution, render scripts,
storyboard and production notes in subfolders.

Do **not** deliver only a script, storyboard, screenshots, or an un-rendered/un-inspected video.

## Mandatory voice direction
**The narrator must sound like a real, warm adult person speaking naturally — a capable friend, not an
automated assistant.** This is extremely important and is part of MyPadi's identity.

Voice: natural, warm, friendly, grounded, conversational; medium register; clear English with a
broadly understandable international accent (a light, authentic African/Nigerian warmth is welcome and
on-brand, but it must stay universally clear — never a thick or performed accent); relaxed confidence;
natural breathing and phrasing; genuine emphasis; real variation in pitch and rhythm; moderate pace
with intentional pauses. It should sound like a smart friend showing you something they are proud of.

Avoid: robotic TTS cadence; corporate-announcer polish; artificially deep trailer voices; synthetic
enthusiasm; uniform pitch; every sentence ending on the same downward inflection; over-pronounced
technical terms; an exaggerated American ad accent; call-center AI voices; and any heavy "pidgin
performance" that would read as a caricature — keep the warmth, keep it clear and genuine.

### Voice workflow
1. Write the final spoken-English script first.
2. Choose the best natural voice available in the environment.
3. Test a short passage; listen/inspect if the tools allow.
4. Reject anything robotic, theatrical or synthetic.
5. Generate in sections; keep one consistent voice identity and loudness throughout.
6. Assemble with natural pauses; avoid heavy denoise/reverb/pitch-shift.
7. If no natural-quality voice tool exists, **do not** silently ship an obviously robotic voice and
   claim success — document the limitation and recommend an alternative.

Never claim a voice "sounds natural" just because synthesis finished.

---

# PART 2 — UNDERSTAND THE PRODUCT BEFORE FILMING

**Repository:** https://github.com/quab-bot/MyPadi
**Live site:** https://mypadi.185-7-81-139.sslip.io  (landing page + `/health` + `/agent-registration.json`)
**Telegram bot:** https://t.me/mypadi_bot  (`@mypadi_bot`)
**ERC-8004 agent registration (served):** https://mypadi.185-7-81-139.sslip.io/agent-registration.json

**Celo mainnet — chain ID `42220`.** Attribution tag: `celo_c42607f62b5b`.
**Agent wallet:** `0xe7C8e60a40436c3ab3875fbdB9b5a26D9518ECc3`
**ERC-8004 identity:** agent **#10036** on registry `0x8004A169FB4a3325136EB29fA0ceB6D2e539a432`
**Tagged registration tx (verified):** `0x506cf0e7d8812534e7f9ecdf8f4969e5fd8ce25b5ccae287be35dac8f0d8d09b`
**buy gateway:** `https://gateway.usebuy.ai`

Before filming, inspect the actual repo and running product: `README.md`, `CLAUDE.md`, `docs/PROOF.md`,
`docs/SUBMISSION.md`, `src/tools/registry.ts` (the exact paid services + prices), `src/agent/*`
(classify, planner, coordinator, synthesize, persona), `src/buy/adapter.ts`, `src/budget/ledger.ts`,
`src/queue/watchtower.ts`, `src/telegram/bot.ts`, and `src/config/identity.ts`. **Verify every claim
against the implementation** — this brief may not be perfect, and the marketing banner over-lists
features.

Create and keep:
- `video/FACTS.md` — separate **verified facts** from unverified claims (quote the code/tx where possible).
- `video/CAPABILITIES.md` — four buckets: *implemented & demonstrated* / *implemented but not demonstrated* / *planned* / *not supported*.
- `video/STORYBOARD.md`, `video/VOICEOVER.md`, `video/SHOT_LIST.md`.

### HONESTY GUARDRAILS (critical — the banner lies by omission)
The welcome banner shows chips like "Browse & Get Information", "Plan & Organize" and "Business &
Finance Tasks". **Several of those are NOT built.** The film must only show what is really shipped and
must never present planned work as working. Specifically:

- **Shipped and showable:** multi-source intel reports (X, Reddit, YouTube, Instagram, TikTok +
  YouTube transcripts); opportunity discovery (hackathons/grants/bounties/airdrops with deadlines,
  eligibility, apply links); Celo on-chain investigation (wallet/tx lookups, token balances, contract
  reads, gas/fees) — **read-only**; flight search (Google Flights); document summaries (**text files
  only**); Watchtower (standing watches that re-check on a schedule and alert on new results);
  competitor/jobs research on LinkedIn; the `/proof` command.
- **Not shipped — do NOT show or imply as working:** general web browsing / "open any link",
  calendar/planning, email, invoicing or finance/payment execution, and any on-chain *transaction
  execution* (MyPadi only *reads* chain data; it does not send user transactions). PDF document
  reading is **not** supported (text files only).
- On-chain must be labeled as **investigation / read-only**, never "manages your money".

---

# PART 3 — THE CORE STORY

## The central insight
We all have AI that talks. Ask it something and it answers from memory — sometimes right, sometimes
confidently wrong, never with proof. MyPadi is the opposite: you ask in plain words, and it actually
goes and *does the work* — it hires real data and research services, **pays them from its own wallet
on Celo**, checks the results, and brings back a clear answer with its **sources and its receipts**.
You never create an account anywhere, never touch a wallet; the project wallet pays, under strict
budgets. And because a payment on Celo is a public fact, the answer comes with proof you can click.

Do not make the film about blockchain in the abstract. Make it about the feeling of delegating a real
job to a friend who comes back with it done — and shows the receipts.

## Emotional arc
1. **Recognition:** "My AI gives me answers. It never actually does the legwork."
2. **Friction:** "So I do it — ten tabs, five sites, and I still can't tell what's true."
3. **Discovery:** "What if you just asked your padi, and it went and did it?"
4. **Proof:** "It's real — it paid real services on Celo, and here are the receipts and sources."
5. **Possibility:** "An assistant that earns your trust by proving its work, for people and for agents."

---

# PART 4 — VISUAL CREATIVE DIRECTION

## Concept: THE RECEIPT TRAIL + THE PADI
The visual signature is **the receipt trail**: as MyPadi works, a slim printed tape unspools with
real settlement lines (service, tiny price, tx hash). It threads scene to scene and culminates in the
`/proof` reveal. Around it, the **MyPadi robot mascot** (the friendly padi) dispatches small glowing
"errands" out to named services and gathers the results back into one chat reply. Many errands out,
one proven answer back — that is the movement to own. For Watchtower, show the padi keeping one eye
open over time: quiet, then a gentle ping when something new appears.

## Brand identity (use the real MyPadi brand from `images/`)
- **Primary blue:** royal/bright blue ~`#2A63EB` (the "Padi" wordmark and icons).
- **Accent blue:** lighter ~`#4B8DF8`.
- **Ink / deep navy:** ~`#0C1A3C` (the "My" wordmark, dark panels, the bottom wave).
- **Robot screen / near-black:** ~`#0B1020` (the mascot's smiling face panel).
- **Background:** clean white to pale cloud-blue ~`#F7F9FF`.
- Use the real **MyPadi robot mascot** and the **"MyPadi"** wordmark (ink "My" + blue underlined
  "Padi" + chat-bubble robot head). Preserve the identity in `images/MyPadi Robot Chat Logo.png` and
  `images/Welcoming MyPadi AI Assistant Banner.png`; do not invent a new one.

Typography:
- A **rounded, friendly geometric sans** for headlines (Poppins / Baloo 2 feel — matches the banner).
- A clean humanist sans for body/caption.
- **JetBrains Mono** (or similar) for wallet addresses, tx hashes, prices and code.

## Style
Aim for: bright, warm, premium consumer-AI film; soft rounded UI; a genuinely likeable mascot with
small, believable motion; real, well-composed Telegram and product captures; precise geometric motion
for the errands-out / answer-back and receipt-tape; beautiful type and generous white space; calm,
confident, friendly pacing. White and pale blue carry the frame; royal blue is the emphasis.

Avoid: generic purple/blue "crypto" gradients; neon; floating coins; stock "person at laptop"
footage; futuristic cityscapes; glows/holograms; glitch/hacking effects; scrolling code walls;
PowerPoint slides; walls of text. Keep the mascot charming, never childish. Expensive through
**restraint and warmth**, not excess.

---

# PART 5 — FILM STRUCTURE (~160 s; adjust timings slightly as narration needs)

## SCENE 1 — HOOK · 0:00–0:12
Open in a real Telegram thread. A user types a genuine question. A generic AI reply appears and a
small label fades in: "answered from memory — no sources, no proof." A beat of doubt.
On-screen: **YOUR AI TALKS.** → **BUT DID IT ACTUALLY DO ANYTHING?**
VO: warm, curious — the thing everyone quietly feels.

## SCENE 2 — FRICTION · 0:12–0:30
The human does it themselves: tabs pile up (X, Reddit, a YouTube video, a wallet explorer), a half-
built spreadsheet, conflicting claims. Brisk, clean accumulation, no fabricated stats.
On-screen: **ANSWERS ARE EASY. DOING THE WORK — AND KNOWING IT'S TRUE — IS THE HARD PART.**

## SCENE 3 — MEET MyPadi · 0:30–0:46
Transition to the product. The MyPadi mascot waves in; the wordmark resolves. The same question is
sent to `@mypadi_bot`. The padi dispatches small errands out to named services.
On-screen: **MyPadi** · **Ask in plain words. Get real work back, with receipts.**
VO: introduce MyPadi as a personal assistant on Telegram that actually does the job — it plans the
steps, pays real services on Celo as it works, and replies with sources. You never touch a wallet.

## SCENE 4 — THE CORE LOOP, REAL UI · 0:46–1:12
Prove it with **actual captures** from the live bot. Show the intel flow end to end: a question →
"On it" → behind the chat, the plan → paid calls to X, Reddit, YouTube (and a transcript) → a clean,
sourced reply with `[1] [2]` citations. As each paid call lands, a receipt line prints on the trail
(service · tiny price · tx hash). Prefer existing evidence from `docs/PROOF.md` and the `/proof`
output over sending new mainnet calls for the camera.
VO: the key line — MyPadi pays for real data and cites real sources; the model never invents a link,
and every paid call leaves a receipt on Celo. Mono on-screen: a real tx hash / explorer link.

## SCENE 5 — IT DOESN'T JUST RESEARCH · 1:12–1:40
A quick, confident montage of the other shipped jobs, each a few seconds, each real:
- **Opportunity discovery:** "find open Celo/Base grants" → a structured list with amounts, deadlines
  and apply links (use the real grants reply).
- **Flights:** "flights from Lagos to London" → ranked options.
- **On-chain (read-only):** "investigate this wallet" → balances / tx read back correctly.
- **Documents:** drop a text file → a sourced summary.
On-screen chips as each appears: **RESEARCH · OPPORTUNITIES · FLIGHTS · ON-CHAIN (READ-ONLY) · DOCUMENTS**
VO: one assistant, many real jobs — and it pays its own way for each.

## SCENE 6 — WATCHTOWER · 1:40–1:58
The padi keeps one eye open. Set `/watch new Celo grants`; time passes quietly; then a gentle ping —
"Watchtower update: 2 new." Show the real baseline/update messages.
On-screen: **IT KEEPS WATCH — AND PINGS YOU WHEN SOMETHING NEW APPEARS.**
VO: standing watches turn a one-off question into ongoing help, and into recurring, real paid usage
of those services over time.

## SCENE 7 — RECEIPTS & IDENTITY · 1:58–2:24
The signature payoff. Type `/proof`; the receipt trail fills with **real settlement lines** (service,
price, tx hash) — pull these from the live `/proof` output and `docs/PROOF.md`. Then three quiet,
legible truths, each true of the deployed system:
1. **Verified, not vibes.** Every answer carries sources; every paid call is a real USDC settlement on
   Celo mainnet. `/proof` shows them.
2. **A real on-chain identity.** MyPadi holds **ERC-8004 #10036** on Celo's official registry, with a
   live agent registration file — so other agents can find it. (`ownerOf(10036)` = the agent wallet.)
3. **Tagged & budgeted, never custodial.** Its registration tx carries the `celo_c42607f62b5b`
   attribution tag (verifiable with `npm run verify-tag`), and spending is capped four ways; the model
   never sees the wallet key. Users never touch a wallet.
On-screen (mono): identity #10036 · registry `0x8004…A432` · reg tx `0x506cf0e7…` · a real settlement hash.
Honest disclosure, legible not alarmist: **Web browsing, planning and finance features shown in early
marketing are not yet built; MyPadi reads on-chain data but does not send your transactions; documents
are text files for now.** No words like "unhackable" or "guaranteed".

## SCENE 8 — CLOSE · 2:24–2:40
Return to the chat: a plain-words question goes in, and a clear, sourced answer comes back with its
receipt — calm, no confetti. Mascot + wordmark.
Headline: **ASK IN PLAIN WORDS. GET REAL WORK BACK, WITH RECEIPTS.**
Secondary: **Live on Celo mainnet. On Telegram. For people and agents. Open source.**
End card (readable, restrained): `t.me/mypadi_bot` · `mypadi.185-7-81-139.sslip.io` · `github.com/quab-bot/MyPadi`
Leave time to read the links. No long thank-you screen.

---

# PART 6 — VOICEOVER WRITING RULES
Write spoken English, not documentation. The narrator is a warm, technically-informed friend showing
you something they built and believe in. Use contractions; short sentences; varied rhythm.

Ban phrases like: "in today's rapidly evolving digital landscape," "revolutionizing AI," "seamless and
frictionless," "unlocking unprecedented opportunities," "the future is here," "game-changing paradigm
shift." Do not read the UI word-for-word or narrate every animation. Target ~300–350 spoken words;
compute real timing and leave room for the demo to breathe.

Before recording, produce a table: scene · exact narration · estimated duration · visual action ·
on-screen text · pronunciation notes. Check spoken claims match the footage. Pronunciation notes for:
"MyPadi" (my-PAH-dee), "padi" (PAH-dee), "Celo" (SEH-low), "x402" (x-four-oh-two), "ERC-8004",
"USDC", "Watchtower", "MCP". Never read full contract addresses or tx hashes aloud — show them.

---

# PART 7 — MUSIC & SOUND DESIGN
Warm, friendly, premium: gentle electronic pulse, soft ambient pads, light playful percussion, a
little low-end, a controlled build that resolves warmly (not an epic trailer hit). Tactile, restrained
SFX for: message sent, errand dispatched, paid call settled (a soft "receipt print"), the sourced
answer landing, and the Watchtower ping. Mix narration clearly above music; meter levels; avoid
clipping and harsh sibilance. Licensed music only; record attribution.

---

# PART 8 — PRODUCT CAPTURE & MOTION GRAPHICS
Use the live bot, site and repo as the source of truth. Capture real screens: the Telegram thread
(welcome, a research reply with sources, the grants reply, a flight reply, `/watch` + a Watchtower
update, `/proof` with real tx hashes) and the landing page at the live site. Hide sensitive info; no
dev tools, notifications or unrelated tabs. Don't send unnecessary mainnet calls for animation; prefer
existing evidence from `docs/PROOF.md` / `/proof`. Build reusable components for: the mascot (idle,
wave, "thinking", "keeping watch"), an errand dispatched to a named service, a settlement receipt
line, the receipt trail, a sourced chat reply, the Watchtower ping, and the ERC-8004 identity card.
Motion must communicate causality (the paid call and verification happen *before* the answer is
trusted). Keep the brand palette consistent; let technical labels reward judges who read them.

---

# PART 9 — PROOF & FACTUAL ACCURACY
Verify against the current code/docs before stating anything. You may cite: the live bot and site, the
served agent-registration.json, the repo, `docs/PROOF.md`, the real `/proof` settlement hashes, the
ERC-8004 identity/registry, the attribution tag and `verify-tag`, and Celoscan links.

Real, verified anchors you may show on-screen:
- ERC-8004 **#10036**, registry `0x8004A169FB4a3325136EB29fA0ceB6D2e539a432`, `ownerOf(10036)` =
  `0xe7C8e60a40436c3ab3875fbdB9b5a26D9518ECc3`.
- Tagged registration tx `0x506cf0e7d8812534e7f9ecdf8f4969e5fd8ce25b5ccae287be35dac8f0d8d09b`
  (carries `celo_c42607f62b5b`; verified with `npm run verify-tag`).
- Example real settlements from `/proof` (USDC on Celo): e.g. `chainstack.celo`
  `0x37cfdbc5…`, a YouTube transcript `0x0820e343…`, X/Reddit/YouTube searches
  (`0x237b226a…`, `0xa336e5d9…`, `0xba0781ac…`), TikTok `0xd66f3ca8…`. Always show full hashes legibly
  on-screen; confirm them against the live `/proof` output before use.

**Do not fabricate:** user counts, volume, adoption, partnerships, revenue, testimonials, audit
results, performance numbers, or live-status indicators. Never fake a balance, status, tx hash or
explorer result. The strongest proof is the product working, shown with concise on-screen evidence.
Be fair about comparisons; claim no universal superiority.

---

# PART 10 — TECHNICAL PRODUCTION WORKFLOW
First inspect the environment for: browser automation/screen capture, audio generation, video
editing/compositing, FFmpeg, SVG/vector animation, audio mixing, frame extraction. Prefer existing
tools; don't install a large stack without justification. If FFmpeg is available, use it for
render/audio assembly; keep scripts and assets organized so the video is regeneratable. Never claim to
have generated/listened to audio, or rendered/inspected video, if you did not.

**Workflow:** A) Audit → `FACTS.md`, `CAPABILITIES.md`. B) Narrative → `STORYBOARD.md`, `VOICEOVER.md`,
`SHOT_LIST.md` (check timing). C) Voice test → sample, evaluate, revise. D) Visual production → mascot
+ motion assets + real captures + transitions + timeline. E) Render → export the MP4. F) Inspect →
extract frames (open, each transition, demo, proof, close); check layout, readability, color,
artifacts, sync, clipping, pacing, duration/codec/res/fps/audio. G) Revise → fix, re-render,
re-inspect. Don't treat the first successful render as final if defects remain.

---

# PART 11 — FINAL QUALITY CHECKLIST
**Story:** first 10 s create curiosity; the problem reads without crypto knowledge; the "it pays real
services and proves it" idea lands; the demo proves real implementation; research / opportunities /
flights / on-chain / documents / Watchtower each read as genuinely built; the `/proof` reveal is the
emotional peak; the ending is warm, memorable and concise.
**Voice:** warm, natural, human, correct pronunciation, no robotic delivery, intelligible over music,
on-brand friendliness without caricature.
**Visuals:** correct MyPadi brand/colors/type and mascot; no fake screens presented as real; no
unreadable clutter; smooth intentional motion; correct identity/links; high-quality final frame.
**Accuracy:** no unsupported guarantees; no invented metrics; honest about unbuilt features (browsing,
planning, finance), read-only on-chain, and text-only documents; clear line between live and planned.
**Technical:** MP4 plays start-to-finish; correct ratio/res/fps; synced audio; no black frames/gaps;
no clipped narration; correct duration; assets and scripts retained.

---

# PART 12 — REQUIRED FINAL DELIVERABLES
1. `MyPadi_AgentsOnOpenRails_Master.mp4`
2. `FACTS.md` · 3. `CAPABILITIES.md` · 4. `STORYBOARD.md` · 5. `VOICEOVER.md` · 6. `SHOT_LIST.md`
7. A short `README.md` in `video/` explaining how to reproduce the video.
8. The voiceover audio file.
9. The editable/regeneratable project and supporting assets, where practical.

At completion, report: exact output path; actual duration; resolution/fps; audio format; voice method;
whether narration was actually auditioned; which product flows were shown; which claims were verified;
what remains unverified; whether the rendered video was inspected; any remaining limitations. If
something couldn't be completed, say so plainly and provide the best available deliverable. Do not
claim success for work not actually performed.

---

# FINAL CREATIVE DIRECTION
Make the film feel like a product people will actually want in their Telegram. MyPadi's story isn't
that AI is clever — it's that your AI should go and *do the work*, pay its own way for the real
services, and prove what it did. Show the doubt about assistants that only talk. Reveal the padi that
dispatches real, paid errands and brings back a sourced answer. Prove it on Celo mainnet — with
receipts, with sources, with a real on-chain identity, honestly about what's built and what's not. End
with the warm sense that this is an assistant people and agents can both trust, because it shows its
receipts. Throughout, the narrator should sound like a real friend who gets things done — never a
machine reading a script.
