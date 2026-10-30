import { describe, it, expect, beforeEach } from 'vitest';
import { Coordinator } from './coordinator.js';
import { Planner } from './planner.js';
import { Synthesizer } from './synthesize.js';
import { BuyAdapter, type BuyRunResult } from '../buy/adapter.js';
import { Ledger, InMemoryBudgetStore, type BudgetCaps } from '../budget/ledger.js';
import { microFromUsd, usdFromMicro } from '../budget/money.js';
import type { Llm, ChatMessage } from '../llm/types.js';
import type { TaskRepo, TaskRow, ServiceCallRecord } from '../db/repo.js';

// --- Fakes ---------------------------------------------------------------

class FakeRepo implements TaskRepo {
  statuses: string[] = [];
  serviceCalls: ServiceCallRecord[] = [];
  outputs: Array<{ content: string }> = [];
  steps = 0;
  async upsertUser() {}
  async createTask() {
    return 'task-1';
  }
  async getTask() {
    return undefined;
  }
  async claimNextQueuedTask() {
    return undefined;
  }
  async setTaskStatus(_id: string, status: any) {
    this.statuses.push(status);
  }
  async saveStep() {
    return `step-${++this.steps}`;
  }
  async setStepStatus() {}
  async saveServiceCall(rec: ServiceCallRecord) {
    this.serviceCalls.push(rec);
    return `call-${this.serviceCalls.length}`;
  }
  async saveOutput(_t: string, content: string) {
    this.outputs.push({ content });
  }
}

/** LLM that returns a canned planner JSON for pass 1 and transcripts for pass 2, then a report. */
class FakeLlm implements Llm {
  calls = 0;
  async complete(messages: ChatMessage[]): Promise<string> {
    this.calls++;
    const system = messages[0]?.content ?? '';
    if (system.includes('second pass')) {
      // transcript pass: pick the one candidate
      return JSON.stringify({
        steps: [
          {
            tool: 'monid.youtube.apify.starvibe-youtube-video-transcript',
            input: { body: { youtube_url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', include_transcript_text: true }, maxResults: 1 },
          },
        ],
      });
    }
    if (system.includes("MyPadi's planner")) {
      return JSON.stringify({
        steps: [
          { tool: 'x.posts.search', input: { query: 'celo', type: 'latest' } },
          { tool: 'reddit.posts.search', input: { query: 'celo' } },
          { tool: 'youtube.videos.search', input: { query: 'celo' } },
        ],
      });
    }
    // synthesis
    return 'Report about celo [1][2]. Sources: [1] X, [2] YouTube transcript.';
  }
}

const caps: BudgetCaps = {
  globalMicro: microFromUsd(5),
  perUserMicro: microFromUsd(1),
  perTaskMicro: microFromUsd(0.5),
  failureReserveMicro: microFromUsd(0.5),
};

const task: TaskRow = { id: 'task-1', userId: 'u1', prompt: 'what is new with celo', status: 'queued' };

// A runner that answers quote with the sandbox offer, pay with a scripted result, and
// receipts with a fake tx hash.
function makeRunner(payResult: BuyRunResult): (argv: string[]) => Promise<BuyRunResult> {
  const quoteStdout = JSON.stringify({
    accepts: [{ network: 'celo-sepolia', maxAmountRequired: '5000', extra: { name: 'USDC' } }],
  });
  const ytBody = JSON.stringify({ items: [{ title: 'Celo explained', videoId: 'dQw4w9WgXcQ' }] });
  const genericBody = JSON.stringify({ data: [{ text: 'celo post text here', url: 'https://x.com/1' }] });
  return async (argv: string[]) => {
    if (argv.includes('quote')) return { code: 0, stdout: quoteStdout, stderr: '' };
    if (argv.includes('receipts')) return { code: 0, stdout: 'tx 0x' + 'a'.repeat(64), stderr: '' };
    // pay: decide body by URL in argv
    if (payResult.code === 0 && payResult.stdout === '__AUTO__') {
      const url = argv.find((a) => a.startsWith('http')) ?? '';
      const body = url.includes('youtube/videos/search') ? ytBody : genericBody;
      return { code: 0, stdout: body, stderr: '' };
    }
    return payResult;
  };
}

function build(payResult: BuyRunResult) {
  const repo = new FakeRepo();
  const ledger = new Ledger(new InMemoryBudgetStore(), caps);
  const adapter = new BuyAdapter({ sandbox: true, token: 'USDC', runner: makeRunner(payResult) });
  const llm = new FakeLlm();
  const coordinator = new Coordinator(
    { repo, ledger, adapter, planner: new Planner(llm), synthesizer: new Synthesizer(llm) },
    { sandbox: true, token: 'USDC', maxVideos: 2 },
  );
  return { repo, ledger, coordinator };
}

describe('Coordinator happy path', () => {
  let repo: FakeRepo;
  let ledger: Ledger;
  let coordinator: Coordinator;

  beforeEach(() => {
    ({ repo, ledger, coordinator } = build({ code: 0, stdout: '__AUTO__', stderr: '' }));
  });

  it('runs searches + a transcript, pays each, and produces a report', async () => {
    const report = await coordinator.runTask(task);
    expect(report).toMatch(/celo/i);

    // 3 searches + 1 transcript = 4 paid calls, all committed.
    const paid = repo.serviceCalls.filter((c) => c.status === 'paid');
    expect(paid.length).toBe(4);
    for (const c of paid) {
      expect(c.txHash).toBe('0x' + 'a'.repeat(64));
      expect(c.paidMicro).toBe(5000);
    }
    // committed spend held in the ledger: 4 x $0.005 = $0.02
    expect(usdFromMicro(await ledger.heldMicro({ taskId: 'task-1' }))).toBe('0.02');
    expect(repo.statuses).toContain('done');
    expect(repo.outputs.length).toBe(1);
  });
});

describe('Coordinator pay-failure routing', () => {
  it('releases the reservation on a pre-settlement (4xx) failure', async () => {
    const { repo, ledger, coordinator } = build({
      code: 1, stdout: '', stderr: '{"error":{"code":"bad_request","httpStatus":400}}',
    });
    await coordinator.runTask(task);
    // Nothing settled, so no budget is held.
    expect(await ledger.heldMicro({ taskId: 'task-1' })).toBe(0);
    expect(repo.serviceCalls.every((c) => c.status !== 'paid')).toBe(true);
  });

  it('keeps budget held on an unresolved (504) failure', async () => {
    const { repo, ledger, coordinator } = build({
      code: 1, stdout: '', stderr: '{"error":{"code":"timeout","httpStatus":504,"retryable":false}}',
    });
    await coordinator.runTask(task);
    // Each attempted paid step stays held; at least the first search's $0.005.
    expect(await ledger.heldMicro({ taskId: 'task-1' })).toBeGreaterThan(0);
    expect(repo.serviceCalls.some((c) => c.status === 'unresolved')).toBe(true);
  });
});
