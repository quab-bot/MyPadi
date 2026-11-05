import { describe, it, expect } from 'vitest';
import {
  extractDatasetNames,
  extractChainEvidence,
  extractEvidence,
  extractFlightEvidence,
  decodeChainBatch,
} from './extract.js';

describe('extractDatasetNames', () => {
  it('pulls dataset ids from an array of objects', () => {
    const body = JSON.stringify([
      { dataset: 'celo-mainnet', aliases: ['celo'] },
      { name: 'ethereum-mainnet' },
    ]);
    const names = extractDatasetNames(body);
    expect(names).toContain('celo-mainnet');
    expect(names).toContain('ethereum-mainnet');
  });

  it('pulls dataset ids from an array of strings', () => {
    expect(extractDatasetNames(JSON.stringify(['celo-mainnet', 'base-mainnet']))).toEqual([
      'celo-mainnet',
      'base-mainnet',
    ]);
  });

  it('returns [] on non-JSON', () => {
    expect(extractDatasetNames('not json')).toEqual([]);
  });
});

describe('extractChainEvidence', () => {
  it('renders a compact JSON excerpt from an RPC batch response', () => {
    const body = JSON.stringify([{ id: 1, result: '0x16345785d8a0000' }]);
    const ev = extractChainEvidence('Celo RPC', body);
    expect(ev).toHaveLength(1);
    expect(ev[0]!.source).toBe('Celo RPC');
    expect(ev[0]!.excerpt).toContain('0x16345785d8a0000');
  });

  it('truncates very long bodies', () => {
    const big = JSON.stringify({ blob: 'x'.repeat(5000) });
    const ev = extractChainEvidence('SQD', big, 200);
    expect(ev[0]!.excerpt.length).toBeLessThanOrEqual(201); // 200 + ellipsis
  });

  it('keeps raw text when the body is not JSON', () => {
    const ev = extractChainEvidence('SQD', 'block 12345');
    expect(ev[0]!.excerpt).toBe('block 12345');
  });
});

describe('extractEvidence still works for social bodies', () => {
  it('pulls text + url from a results array', () => {
    const body = JSON.stringify({ data: [{ text: 'hello celo', url: 'https://x.com/1' }] });
    const ev = extractEvidence('X', body);
    expect(ev[0]!.excerpt).toBe('hello celo');
    expect(ev[0]!.url).toBe('https://x.com/1');
  });
});

describe('decodeChainBatch decodes eth_call (Workflow F depth)', () => {
  it('renders a uint256 word as its decimal value', () => {
    // 0x...03e8 = 1000
    const res = '0x' + (1000).toString(16).padStart(64, '0');
    const body = JSON.stringify([{ id: 1, result: res }]);
    const ev = decodeChainBatch([{ id: 1, method: 'eth_call' }], body, 'Celo RPC');
    expect(ev[0]!.excerpt).toContain('contract read (eth_call)');
    expect(ev[0]!.excerpt).toContain('= 1000');
  });

  it('labels an empty eth_call result', () => {
    const body = JSON.stringify([{ id: 1, result: '0x' }]);
    const ev = decodeChainBatch([{ id: 1, method: 'eth_call' }], body, 'Celo RPC');
    expect(ev[0]!.excerpt).toContain('empty');
  });
});

describe('extractFlightEvidence (Workflow D)', () => {
  it('renders itineraries compactly from a results array', () => {
    const body = JSON.stringify({
      flights: [
        { airline: 'Kenya Airways', price: '$512', stops: 1, duration: '9h 40m', url: 'https://x/1' },
      ],
    });
    const ev = extractFlightEvidence('Flights', body);
    expect(ev[0]!.source).toBe('Flights');
    expect(ev[0]!.excerpt).toContain('Kenya Airways');
    expect(ev[0]!.excerpt).toContain('512');
    expect(ev[0]!.url).toBe('https://x/1');
  });

  it('never throws on an unexpected shape', () => {
    expect(() => extractFlightEvidence('Flights', 'not json')).not.toThrow();
  });
});
