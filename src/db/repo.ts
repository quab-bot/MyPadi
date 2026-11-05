/**
 * Data access for tasks/steps/service_calls/outputs. The coordinator depends on the TaskRepo
 * interface (fake-able in tests); PgTaskRepo is the Postgres implementation.
 */

import { getPool } from './pool.js';
import type { MicroUsd } from '../budget/money.js';

export type TaskStatus = 'queued' | 'planning' | 'running' | 'done' | 'failed';
export type ServiceCallStatus = 'quoted' | 'paid' | 'unresolved' | 'failed' | 'free';

export interface TaskRow {
  id: string;
  userId: string;
  prompt: string;
  status: TaskStatus;
}

export interface ServiceCallRecord {
  taskId: string;
  stepId?: string;
  reservationId?: string;
  capability: string;
  url: string;
  network?: string;
  token?: string;
  quoteMicro?: MicroUsd;
  paidMicro?: MicroUsd;
  txHash?: string;
  status: ServiceCallStatus;
  excerpt?: string;
  raw?: unknown;
}

export interface TaskRepo {
  upsertUser(id: string, username?: string): Promise<void>;
  createTask(userId: string, prompt: string): Promise<string>;
  getTask(id: string): Promise<TaskRow | undefined>;
  claimNextQueuedTask(): Promise<TaskRow | undefined>;
  setTaskStatus(id: string, status: TaskStatus): Promise<void>;
  saveStep(taskId: string, idx: number, tool: string, input: unknown, status: string): Promise<string>;
  setStepStatus(stepId: string, status: string, error?: string): Promise<void>;
  saveServiceCall(rec: ServiceCallRecord): Promise<string>;
  saveOutput(taskId: string, content: string, sources: unknown): Promise<void>;
}

export interface WatchRow {
  id: string;
  userId: string;
  query: string;
  intervalMin: number;
  seen: string[];
}

export interface PaidCallRow {
  capability: string;
  paidMicro: number;
  token?: string;
  network?: string;
  txHash?: string;
}

/** Read access to settled payments for the /proof command (implemented by PgTaskRepo). */
export interface ProofRepo {
  recentPaidCalls(userId: string, limit: number): Promise<PaidCallRow[]>;
}

/** Watchtower persistence (implemented by PgTaskRepo). */
export interface WatchRepo {
  createWatch(userId: string, query: string, intervalMin: number): Promise<string>;
  listWatches(userId: string): Promise<WatchRow[]>;
  countActiveWatches(userId: string): Promise<number>;
  deactivateWatch(userId: string, id: string): Promise<boolean>;
  claimDueWatches(limit: number): Promise<WatchRow[]>;
  finishWatchRun(id: string, seen: string[]): Promise<void>;
}

function toTaskRow(r: any): TaskRow {
  return { id: r.id, userId: String(r.user_id), prompt: r.prompt, status: r.status };
}

function toWatchRow(r: any): WatchRow {
  return {
    id: r.id,
    userId: String(r.user_id),
    query: r.query,
    intervalMin: Number(r.interval_min),
    seen: Array.isArray(r.seen) ? r.seen.map(String) : [],
  };
}

export class PgTaskRepo implements TaskRepo, WatchRepo, ProofRepo {
  async upsertUser(id: string, username?: string): Promise<void> {
    await getPool().query(
      `INSERT INTO users (id, username) VALUES ($1, $2)
       ON CONFLICT (id) DO UPDATE SET username = COALESCE(EXCLUDED.username, users.username)`,
      [id, username ?? null],
    );
  }

  async createTask(userId: string, prompt: string): Promise<string> {
    const res = await getPool().query(
      `INSERT INTO tasks (user_id, prompt, status) VALUES ($1, $2, 'queued') RETURNING id`,
      [userId, prompt],
    );
    return res.rows[0].id;
  }

  async getTask(id: string): Promise<TaskRow | undefined> {
    const res = await getPool().query('SELECT * FROM tasks WHERE id = $1', [id]);
    return res.rows[0] ? toTaskRow(res.rows[0]) : undefined;
  }

  async claimNextQueuedTask(): Promise<TaskRow | undefined> {
    const res = await getPool().query(
      `UPDATE tasks SET status='planning', updated_at=now()
       WHERE id = (SELECT id FROM tasks WHERE status='queued' ORDER BY created_at LIMIT 1 FOR UPDATE SKIP LOCKED)
       RETURNING *`,
    );
    return res.rows[0] ? toTaskRow(res.rows[0]) : undefined;
  }

  async setTaskStatus(id: string, status: TaskStatus): Promise<void> {
    await getPool().query('UPDATE tasks SET status=$2, updated_at=now() WHERE id=$1', [id, status]);
  }

  async saveStep(taskId: string, idx: number, tool: string, input: unknown, status: string): Promise<string> {
    const res = await getPool().query(
      `INSERT INTO steps (task_id, idx, tool, input, status) VALUES ($1,$2,$3,$4,$5) RETURNING id`,
      [taskId, idx, tool, JSON.stringify(input), status],
    );
    return res.rows[0].id;
  }

  async setStepStatus(stepId: string, status: string, error?: string): Promise<void> {
    await getPool().query('UPDATE steps SET status=$2, error=$3, updated_at=now() WHERE id=$1', [
      stepId,
      status,
      error ?? null,
    ]);
  }

  async saveServiceCall(rec: ServiceCallRecord): Promise<string> {
    const res = await getPool().query(
      `INSERT INTO service_calls
        (task_id, step_id, reservation_id, capability, url, network, token, quote_micro, paid_micro, tx_hash, status, excerpt, raw)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING id`,
      [
        rec.taskId,
        rec.stepId ?? null,
        rec.reservationId ?? null,
        rec.capability,
        rec.url,
        rec.network ?? null,
        rec.token ?? null,
        rec.quoteMicro ?? null,
        rec.paidMicro ?? null,
        rec.txHash ?? null,
        rec.status,
        rec.excerpt ?? null,
        rec.raw == null ? null : JSON.stringify(rec.raw),
      ],
    );
    return res.rows[0].id;
  }

  async saveOutput(taskId: string, content: string, sources: unknown): Promise<void> {
    await getPool().query(
      `INSERT INTO outputs (task_id, content, sources) VALUES ($1,$2,$3)`,
      [taskId, content, sources == null ? null : JSON.stringify(sources)],
    );
  }

  // --- Watchtower (WatchRepo) ---

  async createWatch(userId: string, query: string, intervalMin: number): Promise<string> {
    const res = await getPool().query(
      `INSERT INTO watches (user_id, query, interval_min) VALUES ($1,$2,$3) RETURNING id`,
      [userId, query, intervalMin],
    );
    return res.rows[0].id;
  }

  async listWatches(userId: string): Promise<WatchRow[]> {
    const res = await getPool().query(
      `SELECT * FROM watches WHERE user_id=$1 AND active ORDER BY created_at`,
      [userId],
    );
    return res.rows.map(toWatchRow);
  }

  async countActiveWatches(userId: string): Promise<number> {
    const res = await getPool().query(
      `SELECT count(*)::int AS n FROM watches WHERE user_id=$1 AND active`,
      [userId],
    );
    return res.rows[0]?.n ?? 0;
  }

  async deactivateWatch(userId: string, id: string): Promise<boolean> {
    const res = await getPool().query(
      `UPDATE watches SET active=false WHERE id=$1 AND user_id=$2 AND active RETURNING id`,
      [id, userId],
    );
    return (res.rowCount ?? 0) > 0;
  }

  /** Atomically claim watches whose interval has elapsed (stamps last_run_at so ticks do not race). */
  async claimDueWatches(limit: number): Promise<WatchRow[]> {
    const res = await getPool().query(
      `UPDATE watches SET last_run_at = now()
         WHERE id IN (
           SELECT id FROM watches
            WHERE active AND (last_run_at IS NULL OR last_run_at < now() - make_interval(mins => interval_min))
            ORDER BY last_run_at NULLS FIRST
            LIMIT $1
            FOR UPDATE SKIP LOCKED
         )
       RETURNING id, user_id, query, interval_min, seen`,
      [limit],
    );
    return res.rows.map(toWatchRow);
  }

  async finishWatchRun(id: string, seen: string[]): Promise<void> {
    await getPool().query(`UPDATE watches SET seen=$2 WHERE id=$1`, [id, JSON.stringify(seen)]);
  }

  // --- Proof of payment (ProofRepo) ---

  async recentPaidCalls(userId: string, limit: number): Promise<PaidCallRow[]> {
    const res = await getPool().query(
      `SELECT sc.capability, sc.paid_micro, sc.token, sc.network, sc.tx_hash
         FROM service_calls sc JOIN tasks t ON t.id = sc.task_id
        WHERE t.user_id = $1 AND sc.status = 'paid' AND sc.tx_hash IS NOT NULL
        ORDER BY sc.created_at DESC
        LIMIT $2`,
      [userId, limit],
    );
    return res.rows.map((r: any) => ({
      capability: r.capability,
      paidMicro: Number(r.paid_micro ?? 0),
      token: r.token ?? undefined,
      network: r.network ?? undefined,
      txHash: r.tx_hash ?? undefined,
    }));
  }
}
