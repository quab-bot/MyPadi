/**
 * Task coordinator: the engine that runs a task end to end.
 *
 *   plan -> for each step: validate -> (free? fetch : quote -> reserve -> pay) -> store evidence
 *        -> (YouTube) pick videos -> transcribe -> synthesize -> save output.
 *
 * Every paid call is gated by the validator and the ledger. Pay outcomes map to ledger actions:
 *   ok            -> commit        pre_settlement -> release        unresolved -> markUnresolved
 * A budget denial skips the step cleanly (the task still produces a report from what it could buy).
 */

import { Ledger, BudgetExceededError } from '../budget/ledger.js';
import type { BuyAdapter, BuyToken } from '../buy/adapter.js';
import { validateStep, type PlannerStep } from '../tools/validator.js';
import type { TaskRepo, TaskRow, ServiceCallStatus } from '../db/repo.js';
import type { Planner } from './planner.js';
import type { Synthesizer, Evidence } from './synthesize.js';
import {
  extractEvidence,
  extractYoutubeCandidates,
  extractChainEvidence,
  extractDatasetNames,
} from './extract.js';
import { classifyWorkflow } from './classify.js';

export interface CoordinatorDeps {
  repo: TaskRepo;
  ledger: Ledger;
  adapter: BuyAdapter;
  planner: Planner;
  synthesizer: Synthesizer;
}

export interface CoordinatorOptions {
  sandbox: boolean;
  token: BuyToken;
  /** Max videos to transcribe per task (the ledger still gates each one). */
  maxVideos: number;
}

const SOURCE_LABEL: Record<string, string> = {
  'x.posts.search': 'X',
  'reddit.posts.search': 'Reddit',
  'youtube.videos.search': 'YouTube',
  'monid.youtube.apify.starvibe-youtube-video-transcript': 'YouTube transcript',
  'sqd.datasets': 'SQD datasets',
  'sqd.head': 'SQD chain head',
  'sqd.finalized-head': 'SQD finalized head',
  'sqd.block-at-timestamp': 'SQD block lookup',
  'chainstack.celo': 'Celo RPC',
};

function labelFor(toolId: string): string {
  return SOURCE_LABEL[toolId] ?? toolId;
}

interface StepOutcome {
  body?: string;
  evidence: Evidence[];
}

export class Coordinator {
  constructor(
    private readonly deps: CoordinatorDeps,
    private readonly opts: CoordinatorOptions,
  ) {}

  /** Route the task to the right workflow, then save the report. */
  async runTask(task: TaskRow): Promise<string> {
    const { repo, synthesizer } = this.deps;
    const kind = classifyWorkflow(task.prompt).workflow;
    await repo.setTaskStatus(task.id, 'running');
    try {
      const evidence =
        kind === 'onchain'
          ? await this.gatherOnchain(task)
          : kind === 'competitor'
            ? await this.gatherCompetitor(task)
            : await this.gatherIntel(task);
      const report = await synthesizer.run({ prompt: task.prompt, evidence });
      await repo.saveOutput(
        task.id,
        report,
        evidence.map((e) => ({ source: e.source, title: e.title, url: e.url })),
      );
      await repo.setTaskStatus(task.id, 'done');
      return report;
    } catch (err) {
      await repo.setTaskStatus(task.id, 'failed');
      throw err;
    }
  }

  /** Workflow A: multi-source intel report (X + Reddit + YouTube search + transcripts). */
  private async gatherIntel(task: TaskRow): Promise<Evidence[]> {
    const { planner } = this.deps;
    const evidence: Evidence[] = [];
    let idx = 0;
    let youtubeBody: string | undefined;

    // Pass 1: searches.
    const plan = await planner.plan(task.prompt, this.opts.sandbox);
    for (const step of plan.steps) {
      const out = await this.executeStep(task, step, idx++);
      evidence.push(...out.evidence);
      if (step.tool === 'youtube.videos.search' && out.body) youtubeBody = out.body;
    }

    // Pass 2: transcribe the most relevant videos, budget permitting.
    if (youtubeBody && this.opts.maxVideos > 0) {
      const candidates = extractYoutubeCandidates(youtubeBody);
      if (candidates.length) {
        const tplan = await planner.planTranscripts(
          task.prompt,
          candidates,
          this.opts.maxVideos,
          this.opts.sandbox,
        );
        for (const step of tplan.steps) {
          const out = await this.executeStep(task, step, idx++);
          evidence.push(...out.evidence);
        }
      }
    }
    return evidence;
  }

  /** Workflow B: competitor / jobs research. Same engine as intel, LinkedIn tools allowlisted. */
  private async gatherCompetitor(task: TaskRow): Promise<Evidence[]> {
    const { planner } = this.deps;
    const evidence: Evidence[] = [];
    let idx = 0;
    const plan = await planner.planCompetitor(task.prompt, this.opts.sandbox);
    for (const step of plan.steps) {
      const out = await this.executeStep(task, step, idx++);
      evidence.push(...out.evidence);
    }
    return evidence;
  }

  /**
   * Workflow C: Celo on-chain investigation. Discover datasets via free SQD, let the planner
   * propose SQD reads and (mainnet) a Chainstack batch, run them, and collect the raw on-chain
   * results as evidence. In sandbox only the free SQD reads run; Chainstack is Phase 2.
   */
  private async gatherOnchain(task: TaskRow): Promise<Evidence[]> {
    const { planner } = this.deps;
    const chainExtractor = (label: string, body: string): Evidence[] =>
      extractChainEvidence(label, body);
    const evidence: Evidence[] = [];
    let idx = 0;

    // 1. Discover available datasets (free, no input).
    const ds = await this.executeStep(task, { tool: 'sqd.datasets', input: {} }, idx++, chainExtractor);
    evidence.push(...ds.evidence);
    const datasets = ds.body ? extractDatasetNames(ds.body) : [];

    // 2. Plan and run the on-chain reads.
    const plan = await planner.planOnchain(task.prompt, datasets, this.opts.sandbox);
    for (const step of plan.steps) {
      const out = await this.executeStep(task, step, idx++, chainExtractor);
      evidence.push(...out.evidence);
    }
    return evidence;
  }

  /** Execute one planner step, handling free vs paid and all pay outcomes. */
  private async executeStep(
    task: TaskRow,
    step: PlannerStep,
    idx: number,
    extractor: (label: string, body: string) => Evidence[] = (label, body) =>
      extractEvidence(label, body),
  ): Promise<StepOutcome> {
    const { repo, ledger, adapter } = this.deps;
    const stepId = await repo.saveStep(task.id, idx, step.tool, step.input, 'validated');

    const v = validateStep(step, { sandbox: this.opts.sandbox });
    if (!v.ok) {
      await repo.setStepStatus(stepId, 'failed', v.errors.join('; '));
      return { evidence: [] };
    }
    const label = labelFor(v.tool.id);
    const req = { url: v.request.url, method: v.request.method, bodyJson: v.request.body };

    // Free services (SQD) bypass the ledger and the buy adapter.
    if (v.tool.free) {
      try {
        const res = await fetch(v.request.url, { method: v.request.method });
        const body = await res.text();
        await repo.saveServiceCall({
          taskId: task.id, stepId, capability: v.tool.id, url: v.request.url,
          status: 'free', excerpt: body.slice(0, 500),
        });
        await repo.setStepStatus(stepId, 'done');
        return { body, evidence: extractor(label, body) };
      } catch (e) {
        await repo.setStepStatus(stepId, 'failed', String(e));
        return { evidence: [] };
      }
    }

    // Paid: quote -> reserve -> pay.
    const quote = await adapter.quote(req);
    let reservationId: string;
    try {
      const reservation = await ledger.reserve({
        userId: task.userId, taskId: task.id, amountMicro: quote.micro,
      });
      reservationId = reservation.id;
    } catch (e) {
      if (e instanceof BudgetExceededError) {
        await repo.saveServiceCall({
          taskId: task.id, stepId, capability: v.tool.id, url: v.request.url,
          network: quote.network, token: quote.token, quoteMicro: quote.micro,
          status: 'failed', excerpt: `budget denied: ${e.denial.scope} cap`,
        });
        await repo.setStepStatus(stepId, 'skipped', e.message);
        return { evidence: [] };
      }
      throw e;
    }

    const pay = await adapter.pay(req, quote.micro);
    const base = {
      taskId: task.id, stepId, reservationId, capability: v.tool.id, url: v.request.url,
      network: quote.network, token: quote.token, quoteMicro: quote.micro,
    };

    if (pay.status === 'ok') {
      await ledger.commit(reservationId, quote.micro);
      const txHash = await adapter.latestReceiptTxHash();
      await repo.saveServiceCall({
        ...base, paidMicro: quote.micro, txHash, status: 'paid' as ServiceCallStatus,
        excerpt: pay.body.slice(0, 500),
      });
      await repo.setStepStatus(stepId, 'done');
      return { body: pay.body, evidence: extractor(label, pay.body) };
    }

    if (pay.status === 'pre_settlement') {
      await ledger.release(reservationId);
      await repo.saveServiceCall({ ...base, status: 'failed', excerpt: pay.error.message });
      await repo.setStepStatus(stepId, 'failed', pay.error.message ?? 'pre_settlement failure');
      return { evidence: [] };
    }

    // unresolved: keep the budget held; do not retry.
    await ledger.markUnresolved(reservationId);
    await repo.saveServiceCall({ ...base, status: 'unresolved', excerpt: pay.error.message });
    await repo.setStepStatus(stepId, 'failed', `unresolved: ${pay.error.message ?? ''}`);
    return { evidence: [] };
  }
}
