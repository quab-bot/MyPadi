/**
 * Validator: turns an untrusted planner step into a safe, concrete request, or rejects it.
 *
 * A step is accepted only if:
 *   1. the tool is in the registry allowlist,
 *   2. in sandbox mode, the tool is NOT a paid mainnet-only tool (e.g. Chainstack has no
 *      sandbox offer; paying it is deferred to Phase 2),
 *   3. the input passes the tool's strict zod schema (which carries the structural guards:
 *      transcript bundle size, <=2000 read-only JSON-RPC calls, etc.).
 *
 * Budget caps are NOT checked here; the ledger owns those. This keeps each guard in one place.
 */

import { getTool, type ToolSpec } from './registry.js';

export interface PlannerStep {
  tool: string;
  input: unknown;
}

export type ValidationResult =
  | {
      ok: true;
      tool: ToolSpec;
      request: { url: string; method: 'GET' | 'POST'; body?: unknown };
      /** Normalised, schema-validated input. */
      input: unknown;
    }
  | { ok: false; errors: string[] };

export function validateStep(
  step: PlannerStep,
  opts: { sandbox: boolean } = { sandbox: true },
): ValidationResult {
  const tool = getTool(step.tool);
  if (!tool) {
    return { ok: false, errors: [`Unknown tool "${step.tool}". Not in the allowlist.`] };
  }

  // A paid mainnet-only tool cannot be paid in sandbox mode.
  if (opts.sandbox && tool.network === 'mainnet-only' && !tool.free) {
    return {
      ok: false,
      errors: [
        `Tool "${tool.id}" has no sandbox offer and cannot be paid in sandbox mode (deferred to Phase 2).`,
      ],
    };
  }

  const parsed = tool.schema.safeParse(step.input);
  if (!parsed.success) {
    const errors = parsed.error.issues.map(
      (i) => `${i.path.join('.') || '(root)'}: ${i.message}`,
    );
    return { ok: false, errors };
  }

  const input = parsed.data;
  const request: { url: string; method: 'GET' | 'POST'; body?: unknown } = {
    url: tool.url(input),
    method: tool.method,
  };
  if (tool.buildBody) request.body = tool.buildBody(input);

  return { ok: true, tool, request, input };
}
