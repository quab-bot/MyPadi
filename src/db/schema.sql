-- MyPadi schema. Idempotent (CREATE ... IF NOT EXISTS). Run via `npm run migrate`.
-- Money is stored as micro-USD (BIGINT), matching src/budget/money.ts.

CREATE TABLE IF NOT EXISTS users (
  id          BIGINT PRIMARY KEY,                 -- Telegram numeric user id
  username    TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS tasks (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     BIGINT NOT NULL REFERENCES users(id),
  prompt      TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'queued',     -- queued|planning|running|done|failed
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_user ON tasks(user_id);

CREATE TABLE IF NOT EXISTS steps (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id     UUID NOT NULL REFERENCES tasks(id),
  idx         INT NOT NULL,                        -- order within the task
  tool        TEXT NOT NULL,
  input       JSONB NOT NULL,
  status      TEXT NOT NULL DEFAULT 'pending',     -- pending|validated|paid|done|failed|skipped
  error       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (task_id, idx)
);

-- Budget reservations: backs the Ledger (src/budget/ledger.ts).
CREATE TABLE IF NOT EXISTS budget_reservations (
  id            UUID PRIMARY KEY,
  user_id       BIGINT NOT NULL,
  task_id       UUID NOT NULL,
  amount_micro  BIGINT NOT NULL,                   -- reserved (quote) amount
  actual_micro  BIGINT,                            -- settled amount once committed
  status        TEXT NOT NULL DEFAULT 'reserved',  -- reserved|committed|released|unresolved
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_res_user ON budget_reservations(user_id);
CREATE INDEX IF NOT EXISTS idx_res_task ON budget_reservations(task_id);
CREATE INDEX IF NOT EXISTS idx_res_status ON budget_reservations(status);

-- Evidence: one row per paid (or free) service call, with proof of payment.
CREATE TABLE IF NOT EXISTS service_calls (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id         UUID NOT NULL REFERENCES tasks(id),
  step_id         UUID REFERENCES steps(id),
  reservation_id  UUID,                            -- links to budget_reservations when paid
  capability      TEXT NOT NULL,                   -- e.g. x.posts.search
  url             TEXT NOT NULL,
  network         TEXT,                            -- celo | celo-sepolia | (free)
  token           TEXT,                            -- USDC | USDT | USAT
  quote_micro     BIGINT,
  paid_micro      BIGINT,
  tx_hash         TEXT,                            -- settlement tx hash (proof of payment)
  status          TEXT NOT NULL DEFAULT 'quoted',  -- quoted|paid|unresolved|failed|free
  excerpt         TEXT,                            -- short evidence excerpt for the report
  raw             JSONB,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_calls_task ON service_calls(task_id);
CREATE INDEX IF NOT EXISTS idx_calls_status ON service_calls(status);

CREATE TABLE IF NOT EXISTS outputs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id     UUID NOT NULL REFERENCES tasks(id),
  content     TEXT NOT NULL,
  sources     JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_outputs_task ON outputs(task_id);

-- Watchtower: standing watches that re-run a query on a schedule and notify on NEW results.
-- Each check runs as a normal task, so it is budgeted and tagged like any other paid call.
CREATE TABLE IF NOT EXISTS watches (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       BIGINT NOT NULL REFERENCES users(id),
  query         TEXT NOT NULL,
  interval_min  INT NOT NULL DEFAULT 360,            -- how often to check (minutes)
  active        BOOLEAN NOT NULL DEFAULT true,
  seen          JSONB NOT NULL DEFAULT '[]'::jsonb,  -- result fingerprints already reported
  last_run_at   TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_watches_user ON watches(user_id);
CREATE INDEX IF NOT EXISTS idx_watches_active ON watches(active);
