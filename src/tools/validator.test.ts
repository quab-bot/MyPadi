import { describe, it, expect } from 'vitest';
import { validateStep } from './validator.js';

describe('allowlist', () => {
  it('rejects an unknown tool', () => {
    const r = validateStep({ tool: 'evil.exfiltrate', input: {} });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors[0]).toMatch(/not in the allowlist/i);
  });
});

describe('x.posts.search', () => {
  it('accepts a valid query and builds the request', () => {
    const r = validateStep({ tool: 'x.posts.search', input: { query: 'celo', type: 'latest' } });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.request.method).toBe('POST');
      expect(r.request.url).toBe('https://gateway.usebuy.ai/v1/social/x/posts/search');
      expect(r.request.body).toEqual({ query: 'celo', type: 'latest' });
    }
  });

  it('rejects an unknown field (strict schema)', () => {
    const r = validateStep({ tool: 'x.posts.search', input: { query: 'celo', evil: 1 } });
    expect(r.ok).toBe(false);
  });

  it('rejects an invalid enum value', () => {
    const r = validateStep({ tool: 'x.posts.search', input: { query: 'celo', type: 'nope' } });
    expect(r.ok).toBe(false);
  });

  it('rejects an empty query', () => {
    const r = validateStep({ tool: 'x.posts.search', input: { query: '' } });
    expect(r.ok).toBe(false);
  });
});

describe('youtube transcript bundle guard', () => {
  it('accepts a single-video request with maxResults=1', () => {
    const r = validateStep({
      tool: 'monid.youtube.apify.starvibe-youtube-video-transcript',
      input: { body: { youtube_url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' }, maxResults: 1 },
    });
    expect(r.ok).toBe(true);
  });

  it('rejects maxResults not in {1,5,10}', () => {
    const r = validateStep({
      tool: 'monid.youtube.apify.starvibe-youtube-video-transcript',
      input: { body: { youtube_url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' }, maxResults: 3 },
    });
    expect(r.ok).toBe(false);
  });

  it('rejects providing both youtube_url and channel_url', () => {
    const r = validateStep({
      tool: 'monid.youtube.apify.starvibe-youtube-video-transcript',
      input: {
        body: {
          youtube_url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
          channel_url: 'https://www.youtube.com/@celoorg',
        },
        maxResults: 1,
      },
    });
    expect(r.ok).toBe(false);
  });

  it('rejects a malformed youtube url', () => {
    const r = validateStep({
      tool: 'monid.youtube.apify.starvibe-youtube-video-transcript',
      input: { body: { youtube_url: 'https://example.com/not-a-video' }, maxResults: 1 },
    });
    expect(r.ok).toBe(false);
  });
});

describe('chainstack.celo guards', () => {
  it('is refused in sandbox mode (no sandbox offer)', () => {
    const r = validateStep(
      { tool: 'chainstack.celo', input: { calls: [{ jsonrpc: '2.0', id: 1, method: 'eth_blockNumber' }] } },
      { sandbox: true },
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors[0]).toMatch(/no sandbox offer/i);
  });

  it('accepts a read-only batch on mainnet and sends a raw JSON-RPC array', () => {
    const r = validateStep(
      {
        tool: 'chainstack.celo',
        input: {
          calls: [
            { jsonrpc: '2.0', id: 1, method: 'eth_blockNumber' },
            { jsonrpc: '2.0', id: 2, method: 'eth_getBalance', params: ['0xabc', 'latest'] },
          ],
        },
      },
      { sandbox: false },
    );
    expect(r.ok).toBe(true);
    if (r.ok) expect(Array.isArray(r.request.body)).toBe(true);
  });

  it('rejects a write method', () => {
    const r = validateStep(
      {
        tool: 'chainstack.celo',
        input: { calls: [{ jsonrpc: '2.0', id: 1, method: 'eth_sendRawTransaction', params: ['0xdead'] }] },
      },
      { sandbox: false },
    );
    expect(r.ok).toBe(false);
  });

  it('rejects a batch larger than 2000 calls', () => {
    const calls = Array.from({ length: 2001 }, (_, i) => ({ jsonrpc: '2.0', id: i, method: 'eth_blockNumber' }));
    const r = validateStep({ tool: 'chainstack.celo', input: { calls } }, { sandbox: false });
    expect(r.ok).toBe(false);
  });
});

describe('free SQD reads', () => {
  it('builds a dataset head URL with the path param', () => {
    const r = validateStep({ tool: 'sqd.head', input: { dataset: 'celo-mainnet' } });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.request.method).toBe('GET');
      expect(r.request.url).toBe('https://gateway.usebuy.ai/sqd/datasets/celo-mainnet/head');
      expect(r.request.body).toBeUndefined();
    }
  });

  it('is allowed in sandbox mode because it is free', () => {
    const r = validateStep({ tool: 'sqd.datasets', input: {} }, { sandbox: true });
    expect(r.ok).toBe(true);
  });
});
