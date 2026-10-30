import { describe, it, expect, beforeEach } from 'vitest';
import {
  Ledger,
  InMemoryBudgetStore,
  BudgetExceededError,
  type BudgetCaps,
} from './ledger.js';
import { microFromUsd } from './money.js';

// Caps mirror the .env.example demo budget.
const caps: BudgetCaps = {
  globalMicro: microFromUsd(5.0),
  perUserMicro: microFromUsd(1.0),
  perTaskMicro: microFromUsd(0.5),
  failureReserveMicro: microFromUsd(0.5),
};

const Q = microFromUsd(0.005); // a typical $0.005 search quote

let store: InMemoryBudgetStore;
let ledger: Ledger;

beforeEach(() => {
  store = new InMemoryBudgetStore();
  ledger = new Ledger(store, caps);
});

describe('reserve / commit', () => {
  it('reserves then commits at the actual (lower) amount, freeing the difference', async () => {
    const r = await ledger.reserve({ userId: 'u1', taskId: 't1', amountMicro: Q });
    expect(await ledger.heldMicro()).toBe(Q);

    await ledger.commit(r.id, microFromUsd(0.004)); // settled a touch cheaper
    expect(await ledger.heldMicro()).toBe(microFromUsd(0.004));
  });

  it('rejects a commit above the reserved amount', async () => {
    const r = await ledger.reserve({ userId: 'u1', taskId: 't1', amountMicro: Q });
    await expect(ledger.commit(r.id, microFromUsd(0.01))).rejects.toThrow(/exceeds reserved/);
  });
});

describe('release', () => {
  it('frees a reservation on clean pre-settlement failure', async () => {
    const r = await ledger.reserve({ userId: 'u1', taskId: 't1', amountMicro: Q });
    await ledger.release(r.id);
    expect(await ledger.heldMicro()).toBe(0);
  });
});

describe('markUnresolved', () => {
  it('keeps the amount held so possibly-spent budget is never reused', async () => {
    const r = await ledger.reserve({ userId: 'u1', taskId: 't1', amountMicro: Q });
    await ledger.markUnresolved(r.id);
    expect(await ledger.heldMicro()).toBe(Q); // still held
  });
});

describe('caps', () => {
  it('enforces the per-task cap', async () => {
    // per-task cap is $0.50 => 100 x $0.005 fits, the 101st does not.
    for (let i = 0; i < 100; i++) {
      await ledger.reserve({ userId: 'u1', taskId: 't1', amountMicro: Q });
    }
    await expect(
      ledger.reserve({ userId: 'u1', taskId: 't1', amountMicro: Q }),
    ).rejects.toMatchObject({ name: 'BudgetExceededError', denial: { scope: 'task' } });
  });

  it('enforces the per-user cap across multiple tasks', async () => {
    // per-user cap is $1.00. Spread across tasks so the task cap is not the binding one.
    // $1.00 / $0.005 = 200 reservations; use 0.1 chunks across 10 tasks (<= $0.5 each).
    const chunk = microFromUsd(0.1); // 10 per task hits $1.00 at task #10's first? compute:
    let count = 0;
    try {
      for (let t = 0; t < 20; t++) {
        for (let i = 0; i < 5; i++) {
          // 5 x $0.1 = $0.5 per task (== task cap, allowed)
          await ledger.reserve({ userId: 'u1', taskId: `t${t}`, amountMicro: chunk });
          count++;
        }
      }
    } catch (e) {
      expect(e).toBeInstanceOf(BudgetExceededError);
      expect((e as BudgetExceededError).denial.scope).toBe('user');
    }
    // $1.00 user cap / $0.1 = 10 reservations allowed.
    expect(count).toBe(10);
  });

  it('enforces the global cap minus the failure reserve', async () => {
    // global usable = $5.00 - $0.50 reserve = $4.50 => 9 x $0.5 across 9 users/tasks.
    const half = microFromUsd(0.5);
    let count = 0;
    try {
      for (let i = 0; i < 20; i++) {
        await ledger.reserve({ userId: `u${i}`, taskId: `t${i}`, amountMicro: half });
        count++;
      }
    } catch (e) {
      expect(e).toBeInstanceOf(BudgetExceededError);
      expect((e as BudgetExceededError).denial.scope).toBe('global');
    }
    expect(count).toBe(9); // $4.50 / $0.5
  });

  it('frees budget after release so a later reserve succeeds', async () => {
    const half = microFromUsd(0.5);
    // Fill the task cap, release one, reserve again.
    const first = await ledger.reserve({ userId: 'u1', taskId: 't1', amountMicro: half });
    await expect(
      ledger.reserve({ userId: 'u1', taskId: 't1', amountMicro: Q }),
    ).rejects.toBeInstanceOf(BudgetExceededError);
    await ledger.release(first.id);
    const ok = await ledger.reserve({ userId: 'u1', taskId: 't1', amountMicro: Q });
    expect(ok.status).toBe('reserved');
  });
});
