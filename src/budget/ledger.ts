/**
 * Budget ledger: the single chokepoint that decides whether a paid call may proceed.
 *
 * Every paid step must pass through reserve() BEFORE the buy adapter is allowed to pay,
 * and through commit()/release()/markUnresolved() after. The planner LLM never sees the
 * wallet key and cannot bypass this ledger (CLAUDE.md section 4).
 *
 * Guards enforced here (all required by CLAUDE.md):
 *   - global cap, minus a failure reserve kept aside for unresolved settlements
 *   - per-user cap
 *   - per-task cap
 * (The buy daily account cap is enforced separately by the buy CLI itself and mirrored
 *  in config; it is a second line of defence, not a substitute for this ledger.)
 *
 * Money is micro-USD integers (see money.ts).
 */

import { randomUUID } from 'node:crypto';
import type { MicroUsd } from './money.js';
import { usdFromMicro } from './money.js';

export type ReservationStatus = 'reserved' | 'committed' | 'released' | 'unresolved';

export interface Reservation {
  id: string;
  userId: string;
  taskId: string;
  /** Amount held while reserved, and the ceiling a commit may not exceed. */
  amountMicro: MicroUsd;
  /** Actual settled amount once committed (<= amountMicro). */
  actualMicro?: MicroUsd;
  status: ReservationStatus;
  createdAt: number;
  updatedAt: number;
}

export interface BudgetCaps {
  globalMicro: MicroUsd;
  perUserMicro: MicroUsd;
  perTaskMicro: MicroUsd;
  /** Held back from the global cap so an unresolved settlement can't starve the budget. */
  failureReserveMicro: MicroUsd;
}

export interface HeldFilter {
  userId?: string;
  taskId?: string;
}

/**
 * Persistence boundary. The in-memory implementation below is used in tests and dry runs;
 * the Postgres implementation (added once the DB is reachable) performs tryReserve inside a
 * transaction with row locking so concurrent workers cannot both slip past a cap.
 */
export interface BudgetStore {
  /**
   * Atomically: compute the amount currently held (against the given scopes), and if the new
   * reservation fits within every cap, persist it and return it. Otherwise return the reason.
   * Implementations MUST perform the check and the insert without an interleaving window.
   */
  tryReserve(args: {
    reservation: Reservation;
    caps: BudgetCaps;
  }): Promise<{ ok: true; reservation: Reservation } | { ok: false; reason: BudgetDenial }>;

  getReservation(id: string): Promise<Reservation | undefined>;
  updateReservation(id: string, patch: Partial<Reservation>): Promise<Reservation>;
  /** Effective held micro-USD across active (reserved + committed + unresolved) reservations. */
  heldMicro(filter: HeldFilter): Promise<MicroUsd>;
}

export interface BudgetDenial {
  scope: 'global' | 'user' | 'task';
  capMicro: MicroUsd;
  heldMicro: MicroUsd;
  requestedMicro: MicroUsd;
}

export class BudgetExceededError extends Error {
  constructor(public readonly denial: BudgetDenial) {
    super(
      `Budget exceeded on ${denial.scope} cap: requested ${usdFromMicro(denial.requestedMicro)} USD, ` +
        `held ${usdFromMicro(denial.heldMicro)} USD, cap ${usdFromMicro(denial.capMicro)} USD.`,
    );
    this.name = 'BudgetExceededError';
  }
}

/** Effective amount a reservation counts against caps, by status. */
export function effectiveMicro(r: Reservation): MicroUsd {
  switch (r.status) {
    case 'reserved':
    case 'unresolved':
      return r.amountMicro;
    case 'committed':
      return r.actualMicro ?? r.amountMicro;
    case 'released':
      return 0;
  }
}

export class Ledger {
  constructor(
    private readonly store: BudgetStore,
    private readonly caps: BudgetCaps,
  ) {}

  /**
   * Reserve `amountMicro` (the x402 quote) for a step. Throws BudgetExceededError if any cap
   * would be breached. On success the amount is held until commit/release/markUnresolved.
   */
  async reserve(args: {
    userId: string;
    taskId: string;
    amountMicro: MicroUsd;
  }): Promise<Reservation> {
    if (!Number.isInteger(args.amountMicro) || args.amountMicro <= 0) {
      throw new Error(`reserve requires a positive integer micro amount, got ${args.amountMicro}`);
    }
    const now = Date.now();
    const reservation: Reservation = {
      id: randomUUID(),
      userId: args.userId,
      taskId: args.taskId,
      amountMicro: args.amountMicro,
      status: 'reserved',
      createdAt: now,
      updatedAt: now,
    };
    const res = await this.store.tryReserve({ reservation, caps: this.caps });
    if (!res.ok) throw new BudgetExceededError(res.reason);
    return res.reservation;
  }

  /** Settle a reservation at the actual paid amount (must be <= the reserved amount). */
  async commit(id: string, actualMicro: MicroUsd): Promise<Reservation> {
    const r = await this.requireReserved(id);
    if (!Number.isInteger(actualMicro) || actualMicro < 0) {
      throw new Error(`commit requires a non-negative integer micro amount, got ${actualMicro}`);
    }
    if (actualMicro > r.amountMicro) {
      throw new Error(
        `commit amount ${usdFromMicro(actualMicro)} USD exceeds reserved ${usdFromMicro(r.amountMicro)} USD`,
      );
    }
    return this.store.updateReservation(id, {
      status: 'committed',
      actualMicro,
      updatedAt: Date.now(),
    });
  }

  /** Cancel a reservation that never settled (clean pre-settlement failure: 4xx/503). */
  async release(id: string): Promise<Reservation> {
    const r = await this.requireReserved(id);
    return this.store.updateReservation(r.id, { status: 'released', updatedAt: Date.now() });
  }

  /**
   * Flag a reservation whose settlement is uncertain (504 timeout, 500 settle_uncertain,
   * 500 provision_failed). The amount STAYS held — we must not free budget we might have
   * spent. Resolve later with `buy receipts --resolve`, then commit() or release().
   */
  async markUnresolved(id: string): Promise<Reservation> {
    const r = await this.requireReserved(id);
    return this.store.updateReservation(r.id, { status: 'unresolved', updatedAt: Date.now() });
  }

  async heldMicro(filter: HeldFilter = {}): Promise<MicroUsd> {
    return this.store.heldMicro(filter);
  }

  private async requireReserved(id: string): Promise<Reservation> {
    const r = await this.store.getReservation(id);
    if (!r) throw new Error(`Reservation ${id} not found`);
    if (r.status !== 'reserved') {
      throw new Error(`Reservation ${id} is ${r.status}, expected reserved`);
    }
    return r;
  }
}

/**
 * In-memory store for tests and dry runs. Single-process, synchronous check-and-insert, so
 * its tryReserve is atomic by construction.
 */
export class InMemoryBudgetStore implements BudgetStore {
  private readonly rows = new Map<string, Reservation>();

  private sumHeld(filter: HeldFilter): MicroUsd {
    let total = 0;
    for (const r of this.rows.values()) {
      if (filter.userId && r.userId !== filter.userId) continue;
      if (filter.taskId && r.taskId !== filter.taskId) continue;
      total += effectiveMicro(r);
    }
    return total;
  }

  async tryReserve(args: {
    reservation: Reservation;
    caps: BudgetCaps;
  }): Promise<{ ok: true; reservation: Reservation } | { ok: false; reason: BudgetDenial }> {
    const { reservation: r, caps } = args;

    const globalHeld = this.sumHeld({});
    const globalCap = caps.globalMicro - caps.failureReserveMicro;
    if (globalHeld + r.amountMicro > globalCap) {
      return {
        ok: false,
        reason: { scope: 'global', capMicro: globalCap, heldMicro: globalHeld, requestedMicro: r.amountMicro },
      };
    }

    const userHeld = this.sumHeld({ userId: r.userId });
    if (userHeld + r.amountMicro > caps.perUserMicro) {
      return {
        ok: false,
        reason: { scope: 'user', capMicro: caps.perUserMicro, heldMicro: userHeld, requestedMicro: r.amountMicro },
      };
    }

    const taskHeld = this.sumHeld({ taskId: r.taskId });
    if (taskHeld + r.amountMicro > caps.perTaskMicro) {
      return {
        ok: false,
        reason: { scope: 'task', capMicro: caps.perTaskMicro, heldMicro: taskHeld, requestedMicro: r.amountMicro },
      };
    }

    this.rows.set(r.id, { ...r });
    return { ok: true, reservation: { ...r } };
  }

  async getReservation(id: string): Promise<Reservation | undefined> {
    const r = this.rows.get(id);
    return r ? { ...r } : undefined;
  }

  async updateReservation(id: string, patch: Partial<Reservation>): Promise<Reservation> {
    const r = this.rows.get(id);
    if (!r) throw new Error(`Reservation ${id} not found`);
    const next = { ...r, ...patch, id: r.id };
    this.rows.set(id, next);
    return { ...next };
  }

  async heldMicro(filter: HeldFilter): Promise<MicroUsd> {
    return this.sumHeld(filter);
  }
}
