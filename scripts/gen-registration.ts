/**
 * Generate agent-registration.json (ERC-8004 registration file served at agentURI) and
 * agent.json (human-readable mirror for judges) from the SAME config source. Neither file is
 * ever hand-edited; run this whenever identity or go-live values change.
 *
 *   npm run gen-registration
 *
 * Values that cannot exist yet (agentId before registration, wallet before wallet-new) are
 * written as empty strings / null so the shape is stable and preflight can flag them.
 */

import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  TAG,
  EVENT_SLUG,
  REPO_URL,
  TRACK,
  IDENTITY_REGISTRY,
} from '../src/config/identity.js';
import { loadGoLive, agentUri, REPO_ROOT } from '../src/config/golive.js';

const DESCRIPTION =
  'MyPadi is a general-purpose AI assistant on Telegram. Describe a task in plain language and ' +
  'MyPadi plans the steps, pays for real external services over x402 on Celo (via buy), checks the ' +
  'results, and returns a sourced answer. It researches topics across X, Reddit, YouTube, Instagram ' +
  'and TikTok (with video transcripts), finds open opportunities like hackathons and grants, ' +
  'investigates Celo on-chain activity, searches flights, summarizes documents you send, and runs ' +
  'standing watches that alert you when something new appears. Users never touch a wallet; the ' +
  'project wallet sponsors usage under strict per-task, per-user and global budget caps.';

const CAPABILITIES = [
  'Multi-source intelligence reports across X, Reddit, YouTube, Instagram and TikTok, with video transcripts, sources and confidence notes',
  'Opportunity discovery: open hackathons, grants, bounties and airdrops with deadlines, eligibility and how to apply',
  'Celo on-chain investigation: wallet and transaction lookups, token balances, contract reads, gas and fees',
  'Flight search across routes and dates',
  'Document summaries from uploaded text files',
  'Watchtower: standing watches that re-check a topic on a schedule and alert on new results',
  'Competitor and jobs research on LinkedIn',
];

function build() {
  const cfg = loadGoLive();
  const uri = agentUri(cfg);

  // ERC-8004 registration document (served at agentURI once deployed).
  const registration = {
    name: 'MyPadi',
    description: DESCRIPTION,
    capabilities: CAPABILITIES,
    image: `${cfg.publicBaseUrl.replace(/\/$/, '')}/icon.png`,
    url: cfg.publicBaseUrl,
    active: true,
    x402Support: true,
    agent: {
      wallet: cfg.agentWallet || '',
      agentId: cfg.agentId || '',
      registry: IDENTITY_REGISTRY,
      chain: 'celo',
    },
    services: [
      {
        type: 'telegram-bot',
        description: 'Primary user interface. Users send tasks in natural language.',
        // Bot handle from @BotFather, via TELEGRAM_BOT_USERNAME in .env (no leading @).
        endpoint: (() => {
          const u = (process.env.TELEGRAM_BOT_USERNAME || '').replace(/^@/, '').trim();
          return u ? `https://t.me/${u}` : 'https://t.me/';
        })(),
      },
      {
        type: 'http-api',
        description: 'Health and registration endpoints.',
        endpoint: `${cfg.publicBaseUrl.replace(/\/$/, '')}/health`,
      },
    ],
    endpoints: {
      registration: uri,
      health: `${cfg.publicBaseUrl.replace(/\/$/, '')}/health`,
    },
    attribution: { tag: TAG, event: EVENT_SLUG, track: TRACK },
  };

  // Human-readable mirror for judges.
  const agent = {
    name: 'MyPadi',
    tagline: 'A general-purpose AI assistant on Telegram that pays for real services as it works.',
    description: DESCRIPTION,
    capabilities: CAPABILITIES,
    repo: REPO_URL,
    track: TRACK,
    event: EVENT_SLUG,
    attributionTag: TAG,
    agentWallet: cfg.agentWallet || '(set on go-live day)',
    erc8004: {
      registry: IDENTITY_REGISTRY,
      chain: 'celo',
      agentId: cfg.agentId || '(set after registration)',
      agentURI: uri,
    },
    registrationFile: uri,
    generated: new Date().toISOString().slice(0, 10),
  };

  return { registration, agent };
}

function main(): void {
  const { registration, agent } = build();
  const regPath = join(REPO_ROOT, 'agent-registration.json');
  const agentPath = join(REPO_ROOT, 'agent.json');
  writeFileSync(regPath, JSON.stringify(registration, null, 2) + '\n', 'utf8');
  writeFileSync(agentPath, JSON.stringify(agent, null, 2) + '\n', 'utf8');
  console.log(`Wrote ${regPath}`);
  console.log(`Wrote ${agentPath}`);
  console.log(`agentURI -> ${registration.endpoints.registration}`);
  if (!registration.agent.wallet) console.log('note: agentWallet is empty (run wallet-new, then re-run).');
  if (!registration.agent.agentId) console.log('note: agentId is empty (set by register-8004 after registration).');
}

main();
