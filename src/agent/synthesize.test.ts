import { describe, it, expect } from 'vitest';
import { Synthesizer, fallbackReport, type Evidence } from './synthesize.js';
import type { Llm, ChatMessage, CompleteOptions } from '../llm/types.js';

/** An Llm stub that returns a scripted string or throws. */
function stubLlm(reply: string | (() => Promise<string>)): Llm {
  return {
    async complete(_m: ChatMessage[], _o?: CompleteOptions): Promise<string> {
      return typeof reply === 'function' ? reply() : reply;
    },
  };
}

const EVID: Evidence[] = [
  { source: 'X', excerpt: 'Base announced a new grants round for builders.', url: 'https://x.com/base/status/1' },
  { source: 'Reddit', title: 'r/ethdev', excerpt: 'Discussion of the base grants and how to apply.' },
];

describe('Synthesizer.run fallbacks', () => {
  it('returns the model answer when it is non-empty', async () => {
    const s = new Synthesizer(stubLlm('Here is your brief. [1]'));
    expect(await s.run({ prompt: 'base grants', evidence: EVID })).toBe('Here is your brief. [1]');
  });

  it('falls back to a sourced brief when the model returns empty content', async () => {
    const s = new Synthesizer(stubLlm('   '));
    const out = await s.run({ prompt: 'base grants', evidence: EVID });
    expect(out.trim().length).toBeGreaterThan(0);
    expect(out).toContain('base grants');
    expect(out).toContain('**Sources**');
    expect(out).toContain('https://x.com/base/status/1');
  });

  it('falls back when the model call throws', async () => {
    const s = new Synthesizer(stubLlm(() => Promise.reject(new Error('Groq 429'))));
    const out = await s.run({ prompt: 'base grants', evidence: EVID });
    expect(out.trim().length).toBeGreaterThan(0);
    expect(out).toContain('**Sources**');
  });

  it('still reports the fixed message when there is no evidence at all', async () => {
    const s = new Synthesizer(stubLlm(''));
    const out = await s.run({ prompt: 'base grants', evidence: [] });
    expect(out.trim().length).toBeGreaterThan(0);
  });
});

describe('fallbackReport', () => {
  it('is non-empty and lists each source with its url when present', () => {
    const out = fallbackReport('what is new', EVID);
    expect(out).toContain('[1] X');
    expect(out).toContain('[2] Reddit');
    expect(out).toContain('https://x.com/base/status/1');
    expect(out.trim().length).toBeGreaterThan(0);
  });
});
