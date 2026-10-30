/**
 * Postgres-backed BudgetStore. tryReserve runs inside a transaction guarded by a session
 * advisory lock so two concurrent workers cannot both slip a reservation past a cap (the
 * check and the insert are one critical section). Low-concurrency demo workload, so a single
 * global lock is simpler and safe; it is released at COMMIT/ROLLBACK.
 */

import type pg from 'pg';
import { getPool } from './pool.js';
import type {
  BudgetStore,
  Reservation,
  BudgetCaps,
  HeldFilter,
  BudgetDenial,
} from '../budget/ledger.js';
import type { MicroUsd } from '../budget/money.js';

// Arbitrary constant key for the global budget advisory lock.
const BUDGET_LOCK_KEY = 4242_0001;

/** SQL expression: the amount a reservation currently counts against caps, by status. */
const EFFECTIVE_SQL = `CASE
  WHEN status IN ('reserved','unresolved') THEN amount_micro
  WHEN status = 'committed' THEN COALESCE(actual_micro, amount_micro)
  ELSE 0 END`;

function rowToReservation(r: any): Reservation {
  return {
    id: r.id,
    userId: String(r.user_id),
    taskId: r.task_id,
    amountMicro: Number(r.amount_micro),
    actualMicro: r.actual_micro == null ? undefined : Number(r.actual_micro),
    status: r.status,
    createdAt: new Date(r.created_at).getTime(),
    updatedAt: new Date(r.updated_at).getTime(),
  };
}

async function heldWith(
  client: pg.PoolClient | pg.Pool,
  filter: HeldFilter,
): Promise<MicroUsd> {
  const where: string[] = [];
  const params: unknown[] = [];
  if (filter.userId) {
    params.push(filter.userId);
    where.push(`user_id = $${params.length}`);
  }
  if (filter.taskId) {
    params.push(filter.taskId);
    where.push(`task_id = $${params.length}`);
  }
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const sql = `SELECT COALESCE(SUM(${EFFECTIVE_SQL}),0)::bigint AS held FROM budget_reservations ${clause}`;
  const res = await client.query(sql, params);
  return Number(res.rows[0].held);
}

export class PgBudgetStore implements BudgetStore {
  async tryReserve(args: {
    reservation: Reservation;
    caps: BudgetCaps;
  }): Promise<{ ok: true; reservation: Reservation } | { ok: false; reason: BudgetDenial }> {
    const { reservation: r, caps } = args;
    const client = await getPool().connect();
    try {
      await client.query('BEGIN');
      await client.query('SELECT pg_advisory_xact_lock($1)', [BUDGET_LOCK_KEY]);

      const globalHeld = await heldWith(client, {});
      const globalCap = caps.globalMicro - caps.failureReserveMicro;
      if (globalHeld + r.amountMicro > globalCap) {
        await client.query('ROLLBACK');
        return { ok: false, reason: deny('global', globalCap, globalHeld, r.amountMicro) };
      }

      const userHeld = await heldWith(client, { userId: r.userId });
      if (userHeld + r.amountMicro > caps.perUserMicro) {
        await client.query('ROLLBACK');
        return { ok: false, reason: deny('user', caps.perUserMicro, userHeld, r.amountMicro) };
      }

      const taskHeld = await heldWith(client, { taskId: r.taskId });
      if (taskHeld + r.amountMicro > caps.perTaskMicro) {
        await client.query('ROLLBACK');
        return { ok: false, reason: deny('task', caps.perTaskMicro, taskHeld, r.amountMicro) };
      }

      const ins = await client.query(
        `INSERT INTO budget_reservations (id, user_id, task_id, amount_micro, status, created_at, updated_at)
         VALUES ($1,$2,$3,$4,'reserved', now(), now())
         RETURNING *`,
        [r.id, r.userId, r.taskId, r.amountMicro],
      );
      await client.query('COMMIT');
      return { ok: true, reservation: rowToReservation(ins.rows[0]) };
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      throw err;
    } finally {
      client.release();
    }
  }

  async getReservation(id: string): Promise<Reservation | undefined> {
    const res = await getPool().query('SELECT * FROM budget_reservations WHERE id = $1', [id]);
    return res.rows[0] ? rowToReservation(res.rows[0]) : undefined;
  }

  async updateReservation(id: string, patch: Partial<Reservation>): Promise<Reservation> {
    const sets: string[] = ['updated_at = now()'];
    const params: unknown[] = [];
    if (patch.status !== undefined) {
      params.push(patch.status);
      sets.push(`status = $${params.length}`);
    }
    if (patch.actualMicro !== undefined) {
      params.push(patch.actualMicro);
      sets.push(`actual_micro = $${params.length}`);
    }
    params.push(id);
    const res = await getPool().query(
      `UPDATE budget_reservations SET ${sets.join(', ')} WHERE id = $${params.length} RETURNING *`,
      params,
    );
    if (!res.rows[0]) throw new Error(`Reservation ${id} not found`);
    return rowToReservation(res.rows[0]);
  }

  async heldMicro(filter: HeldFilter): Promise<MicroUsd> {
    return heldWith(getPool(), filter);
  }
}

function deny(
  scope: BudgetDenial['scope'],
  capMicro: MicroUsd,
  heldMicro: MicroUsd,
  requestedMicro: MicroUsd,
): BudgetDenial {
  return { scope, capMicro, heldMicro, requestedMicro };
}
