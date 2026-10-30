import { describe, it, expect } from 'vitest';
import { Coordinator } from './coordinator.js';
import { Planner } from './planner.js';
import { Synthesizer } from './synthesize.js';
import { BuyAdapter, type BuyRunResult } from '../buy/adapter.js';
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

class FakeLlm implements Llm {
  async complete(messages: ChatMessage[]): Promise<string> {
    const system = messages[0]?.content ?? '';
    if (system.includes('competitor and jobs research on LinkedIn')) {
      return JSON.stringify({
        steps: [
          { tool: 'linkedin.company.posts', input: { company: 'acme' } },
          { tool: 'monid.linkedin.apify.harvestapi-linkedin-job-search', input: { body: { jobTitles: ['software engineer'] }, maxResults: 1 } },
        ],
      });
    }
    return 'Acme has been posting about growth and is hiring engineers [1][2]. Sources: [1] LinkedIn company posts, [2] LinkedIn job search.';
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
  prompt: 'Research my competitor Acme on LinkedIn: recent posts and who they are hiring',
  status: 'queued',
};

function makeRunner(): (argv: string[]) => Promise<BuyRunResult> {
  const quote = JSON.stringify({ accepts: [{ network: 'celo-sepolia', maxAmountRequired: '23000', extra: { name: 'USDC' } }] });
  const body = JSON.stringify({ data: [{ text: 'Acme is hiring senior engineers', url: 'https://www.linkedin.com/company/acme' }] });
  return async (argv: string[]) => {
    if (argv.includes('quote')) return { code: 0, stdout: quote, stderr: '' };
    if (argv.includes('receipts')) return { code: 0, stdout: 'tx 0x' + 'b'.repeat(64), stderr: '' };
    return { code: 0, stdout: body, stderr: '' };
  };
}

describe('Coordinator Workflow B (competitor, sandbox)', () => {
  it('routes to LinkedIn tools, pays each, and reports', async () => {
    const repo = new FakeRepo();
    const ledger = new Ledger(new InMemoryBudgetStore(), caps);
    const adapter = new BuyAdapter({ sandbox: true, token: 'USDC', runner: makeRunner() });
    const llm = new FakeLlm();
    const coordinator = new Coordinator(
      { repo, ledger, adapter, planner: new Planner(llm), synthesizer: new Synthesizer(llm) },
      { sandbox: true, token: 'USDC', maxVideos: 0 },
    );

    const report = await coordinator.runTask(task);
    expect(report).toMatch(/acme/i);

    const paid = repo.serviceCalls.filter((c) => c.status === 'paid');
    expect(paid.length).toBe(2);
    expect(paid.every((c) => c.capability.includes('linkedin'))).toBe(true);
    expect(repo.statuses).toContain('done');
  });
});
