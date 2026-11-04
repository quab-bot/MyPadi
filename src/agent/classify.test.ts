import { describe, it, expect } from 'vitest';
import { classifyWorkflow } from './classify.js';

describe('classifyWorkflow', () => {
  it('routes plain research prompts to intel', () => {
    expect(classifyWorkflow('What are people saying about Celo this week?').workflow).toBe('intel');
    expect(classifyWorkflow('Summarise the latest news on L2 rollups').workflow).toBe('intel');
  });

  it('routes prompts with an EVM address to onchain and extracts it', () => {
    const c = classifyWorkflow('Investigate 0xe7C8e60a40436c3ab3875fbdB9b5a26D9518ECc3 on Celo');
    expect(c.workflow).toBe('onchain');
    expect(c.addresses).toEqual(['0xe7c8e60a40436c3ab3875fbdb9b5a26d9518ecc3']);
    expect(c.hashes).toEqual([]);
  });

  it('routes prompts with a tx hash to onchain and does not mistake it for an address', () => {
    const hash = '0x' + 'a'.repeat(64);
    const c = classifyWorkflow(`What happened in transaction ${hash}?`);
    expect(c.workflow).toBe('onchain');
    expect(c.hashes).toEqual([hash]);
    expect(c.addresses).toEqual([]); // a 64-hex hash must not be read as a 40-hex address
  });

  it('routes on explicit on-chain vocabulary without any hex', () => {
    expect(classifyWorkflow('show me the latest block on celo').workflow).toBe('onchain');
    expect(classifyWorkflow('trace this wallet activity').workflow).toBe('onchain');
    expect(classifyWorkflow('what is the current gas price').workflow).toBe('onchain');
  });

  it('routes competitor / jobs / linkedin prompts to competitor', () => {
    expect(classifyWorkflow('research my competitor Acme on LinkedIn').workflow).toBe('competitor');
    expect(classifyWorkflow('who is hiring data scientists in Berlin').workflow).toBe('competitor');
    expect(classifyWorkflow('find job openings for frontend engineers').workflow).toBe('competitor');
  });

  it('classifies the word "competitors" as competitor research (LinkedIn workflow)', () => {
    expect(classifyWorkflow('research competitors for my startup').workflow).toBe('competitor');
  });

  it('routes greetings, thanks and meta questions to chat (no paid research)', () => {
    for (const p of ['hi', 'how far my padi', 'thanks!', '/start', 'good morning', 'who are you', 'what can you do?']) {
      expect(classifyWorkflow(p).workflow).toBe('chat');
    }
  });

  it('does not let a greeting word hijack a real research request', () => {
    expect(classifyWorkflow('hello, what are people saying about Celo?').workflow).toBe('intel');
    expect(
      classifyWorkflow('hey, investigate 0xe7C8e60a40436c3ab3875fbdB9b5a26D9518ECc3').workflow,
    ).toBe('onchain');
  });

  it('on-chain still wins when both signals appear', () => {
    const c = classifyWorkflow('is 0xe7C8e60a40436c3ab3875fbdB9b5a26D9518ECc3 hiring on linkedin?');
    expect(c.workflow).toBe('onchain');
  });
});
