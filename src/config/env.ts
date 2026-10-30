/**
 * Typed, validated environment. Loads .env once and exposes a parsed config plus the
 * budget caps as micro-USD. Secrets (Telegram, Groq, wallet) are optional here so the app
 * and scripts can run partial workflows in Phase 1; each consumer asserts what it needs.
 */

import 'dotenv/config';
import { z } from 'zod';
import { microFromUsd } from '../budget/money.js';
import type { BudgetCaps } from '../budget/ledger.js';

const schema = z.object({
  NODE_ENV: z.string().default('development'),
  PORT: z.coerce.number().int().positive().default(3100),
  PUBLIC_BASE_URL: z.string().url().default('http://localhost:3100'),

  AGENT_WALLET: z.string().optional(),
  AGENT_PRIVATE_KEY: z.string().optional(),

  TELEGRAM_BOT_TOKEN: z.string().optional(),

  GROQ_API_KEY: z.string().optional(),
  GROQ_MODEL: z.string().default('openai/gpt-oss-120b'),

  DATABASE_URL: z.string().optional(),

  BUY_MODE: z.enum(['sandbox', 'mainnet']).default('sandbox'),
  BUY_TOKEN: z.enum(['USDC', 'USDT', 'USAT']).default('USDC'),
  BUY_ACCOUNT: z.string().default('mypadi'),
  BUY_BIN: z.string().default('buy'),
  BUY_ENTRY: z.string().optional(),
  BUY_KEYSTORE_BACKEND: z.string().default('file'),
  BUY_HOME: z.string().default('./buy-home'),
  BUY_DAILY_CAP_USD: z.coerce.number().nonnegative().default(1.0),

  BUDGET_GLOBAL_USD: z.coerce.number().nonnegative().default(5.0),
  BUDGET_PER_TASK_USD: z.coerce.number().nonnegative().default(0.5),
  BUDGET_PER_USER_USD: z.coerce.number().nonnegative().default(1.0),
  BUDGET_FAILURE_RESERVE_USD: z.coerce.number().nonnegative().default(0.5),

  CELO_RPC_URL: z.string().url().default('https://forno.celo.org'),
});

export const env = schema.parse(process.env);

/** True when the buy adapter must force --sandbox (Phase 1). */
export const sandbox = env.BUY_MODE === 'sandbox';

export const budgetCaps: BudgetCaps = {
  globalMicro: microFromUsd(env.BUDGET_GLOBAL_USD),
  perUserMicro: microFromUsd(env.BUDGET_PER_USER_USD),
  perTaskMicro: microFromUsd(env.BUDGET_PER_TASK_USD),
  failureReserveMicro: microFromUsd(env.BUDGET_FAILURE_RESERVE_USD),
};

export function requireDatabaseUrl(): string {
  if (!env.DATABASE_URL) throw new Error('DATABASE_URL is not set (check .env).');
  return env.DATABASE_URL;
}
