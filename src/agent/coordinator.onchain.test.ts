import { describe, it, expect, vi, afterEach } from 'vitest';
import { Coordinator } from './coordinator.js';
import { Planner } from './planner.js';
import { Synthesizer } from './synthesize.js';
import { BuyAdapter } from '../buy/adapter.js';
import { Ledger, InMemoryBudgetStore, type BudgetCaps } from '../budget/ledger.js';
import { microFromUsd } from '../budget/money.js';
import type { Llm, ChatMessage } from '../llm/types.js';
import type { TaskRepo, TaskRow, ServiceCallRecord } from '../db/repo.js';

class FakeRepo implements TaskRepo {
  statuses: string[] = [];
  serviceCalls: ServiceCallRecord[] = [];
  outputs: Array<{ content: string }> = [];
  steps = 0;
  async upsertUser() {}
  async createTask() { return 'task-1'; }
  async getTask() { return undefined; }
  async claimNextQueuedTask() { return undefined; }
  async setTaskStatus(_id: string, status: any) { this.statuses.push(status); }
  async saveStep() { return `step-${++this.steps}`; }
  async setStepStatus() {}
  async saveServiceCall(rec: ServiceCallRecord) { this.serviceCalls.push(rec); return `call-${this.serviceCalls.length}`; }
  async saveOutput(_t: string, content: string) { this.outputs.push({ content }); }
}

/** LLM that returns an on-chain plan for the onchain system prompt, then a report. */
class FakeLlm implements Llm {
  async complete(messages: ChatMessage[]): Promise<string> {
    const system = messages[0]?.content ?? '';
    if (system.includes('Celo on-chain investigation')) {
      return JSON.stringify({
        steps: [
          { tool: 'sqd.head', input: { dataset: 'celo-mainnet' } },
          // A paid, mainnet-only Chainstack step: must be dropped by the validator in sandbox.
          { tool: 'chainstack.celo', input: { calls: [{ jsonrpc: '2.0', id: 1, method: 'eth_blockNumber' }] } },
        ],
      });
    }
    return 'Celo chain head is block 12345 [2]. Sources: [1] SQD datasets, [2] SQD chain head.';
  }
}

const caps: BudgetCaps = {
  globalMicro: microFromUsd(5),
  perUserMicro: microFromUsd(1),
  perTaskMicro: microFromUsd(0.5),
  failureReserveMicro: microFromUsd(0.5),
};

const task: TaskRow = {
  id: 'task-1',
  userId: 'u1',
  prompt: 'Show me the latest block on the Celo chain (on-chain)',
  status: 'queued',
};

afterEach(() => vi.unstubAllGlobals());

describe('Coordinator Workflow C (on-chain, sandbox)', () => {
  it('discovers datasets, runs free SQD reads, drops paid Chainstack, and reports', async () => {
    // Stub the free-service HTTP calls (SQD) by URL.
    vi.stubGlobal('fetch', async (url: string) => {
      const body = url.includes('/datasets')
        ? JSON.stringify([{ dataset: 'celo-mainnet' }, { dataset: 'ethereum-mainnet' }])
        : JSON.stringify({ number: 12345, hash: '0xabc' });
      return { text: async () => body } as Response;
    });

    const repo = new FakeRepo();
    const ledger = new Ledger(new InMemoryBudgetStore(), caps);
    // A runner that throws: proves no paid buy call happens on the sandbox on-chain path.
    const adapter = new BuyAdapter({
      sandbox: true,
      token: 'USDC',
      runner: async () => { throw new Error('buy must not be called in sandbox Workflow C'); },
    });
    const llm = new FakeLlm();
    const coordinator = new Coordinator(
      { repo, ledger, adapter, planner: new Planner(llm), synthesizer: new Synthesizer(llm) },
      { sandbox: true, token: 'USDC', maxVideos: 0 },
    );

    const report = await coordinator.runTask(task);
    expect(report).toMatch(/block 12345/i);

    // Two free SQD calls recorded (datasets + head); no paid or unresolved calls.
    const free = repo.serviceCalls.filter((c) => c.status === 'free');
    expect(free.length).toBe(2);
    expect(repo.serviceCalls.some((c) => c.status === 'paid' || c.status === 'unresolved')).toBe(false);
    // Nothing was reserved against the budget.
    expect(await ledger.heldMicro({ taskId: 'task-1' })).toBe(0);
    expect(repo.statuses).toContain('done');
  });
});
