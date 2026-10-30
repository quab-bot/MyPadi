import { describe, it, expect } from 'vitest';
import {
  BuyAdapter,
  BuyQuoteError,
  parseBuyError,
  classifyError,
  type BuyRunner,
  type BuyRunResult,
} from './adapter.js';

/** A runner that returns a scripted result and records the argv it was called with. */
function scriptedRunner(result: BuyRunResult): { runner: BuyRunner; calls: string[][] } {
  const calls: string[][] = [];
  const runner: BuyRunner = async (argv) => {
    calls.push(argv);
    return result;
  };
  return { runner, calls };
}

// A realistic sandbox quote payload (trimmed to two offers: mainnet + sandbox USDC).
const QUOTE_STDOUT = JSON.stringify({
  x402Version: 1,
  accepts: [
    {
      scheme: 'exact',
      network: 'celo',
      maxAmountRequired: '5000',
      resource: 'https://gateway.usebuy.ai/v1/social/x/posts/search',
      asset: '0xcebA9300f2b948710d2653dD7B07f33A8B32118C',
      extra: { name: 'USDC', gateway: { capability: 'x.posts.search', pricingModel: 'per_call' } },
    },
    {
      scheme: 'exact',
      network: 'celo-sepolia',
      maxAmountRequired: '5000',
      resource: 'https://gateway.usebuy.ai/v1/social/x/posts/search',
      asset: '0x01C5C0122039549AD1493B8220cABEdD739BC44E',
      extra: { name: 'USDC', gateway: { capability: 'x.posts.search', pricingModel: 'per_call', sandbox: true } },
    },
  ],
  error: '',
});

describe('quote', () => {
  it('selects the sandbox offer and returns micro-USD when sandbox=true', async () => {
    const { runner, calls } = scriptedRunner({ code: 0, stdout: QUOTE_STDOUT, stderr: '' });
    const adapter = new BuyAdapter({ sandbox: true, token: 'USDC', runner });
    const q = await adapter.quote({ url: 'https://gateway.usebuy.ai/v1/social/x/posts/search', bodyJson: { query: 'celo' } });

    expect(q.network).toBe('celo-sepolia');
    expect(q.atomic).toBe('5000');
    expect(q.micro).toBe(5000);
    // argv must put --sandbox and --json before the quote subcommand.
    const argv = calls[0]!;
    expect(argv.slice(0, 3)).toEqual(['--sandbox', '--json', 'quote']);
    expect(argv).toContain('-d');
    expect(argv).toContain(JSON.stringify({ query: 'celo' }));
  });

  it('selects the mainnet offer when sandbox=false', async () => {
    const { runner } = scriptedRunner({ code: 0, stdout: QUOTE_STDOUT, stderr: '' });
    const adapter = new BuyAdapter({ sandbox: false, token: 'USDC', runner });
    const q = await adapter.quote({ url: 'x', bodyJson: {} });
    expect(q.network).toBe('celo');
  });

  it('throws if no offer matches the network', async () => {
    const onlyMainnet = JSON.stringify({ accepts: [{ network: 'celo', maxAmountRequired: '5000' }] });
    const { runner } = scriptedRunner({ code: 0, stdout: onlyMainnet, stderr: '' });
    const adapter = new BuyAdapter({ sandbox: true, token: 'USDC', runner });
    await expect(adapter.quote({ url: 'x' })).rejects.toBeInstanceOf(BuyQuoteError);
  });

  it('throws if stdout is not JSON', async () => {
    const { runner } = scriptedRunner({ code: 0, stdout: 'not json', stderr: '' });
    const adapter = new BuyAdapter({ sandbox: true, token: 'USDC', runner });
    await expect(adapter.quote({ url: 'x' })).rejects.toBeInstanceOf(BuyQuoteError);
  });
});

describe('pay — success', () => {
  it('returns ok with the body and caps --max-amount at the reserved USD', async () => {
    const { runner, calls } = scriptedRunner({ code: 0, stdout: '{"posts":[]}', stderr: '' });
    const adapter = new BuyAdapter({ sandbox: true, token: 'USDC', runner });
    const out = await adapter.pay({ url: 'x', bodyJson: { query: 'celo' } }, 5000);

    expect(out.status).toBe('ok');
    if (out.status === 'ok') expect(out.body).toBe('{"posts":[]}');
    const argv = calls[0]!;
    expect(argv.slice(0, 3)).toEqual(['--sandbox', '--json', 'curl']);
    const i = argv.indexOf('--max-amount');
    expect(i).toBeGreaterThan(-1);
    expect(argv[i + 1]).toBe('0.005'); // 5000 micro-USD
    expect(argv).toContain('--token');
  });
});

describe('pay — error classification', () => {
  const cases: Array<{ name: string; stderr: string; expect: 'pre_settlement' | 'unresolved' }> = [
    { name: '504 timeout stays held', stderr: '{"error":{"code":"timeout","httpStatus":504,"retryable":false}}', expect: 'unresolved' },
    { name: 'settle_uncertain stays held', stderr: '{"error":{"code":"settle_uncertain","httpStatus":500}}', expect: 'unresolved' },
    { name: 'provision_failed stays held', stderr: '{"error":{"code":"provision_failed","httpStatus":500}}', expect: 'unresolved' },
    { name: '400 bad request is pre-settlement', stderr: '{"error":{"code":"bad_request","httpStatus":400}}', expect: 'pre_settlement' },
    { name: '402 handled before settlement', stderr: '{"error":{"code":"payment_required","httpStatus":402}}', expect: 'pre_settlement' },
    { name: '503 is pre-settlement', stderr: '{"error":{"code":"unavailable","httpStatus":503}}', expect: 'pre_settlement' },
    { name: 'unknown error is held (conservative)', stderr: '{"error":{"code":"weird_thing"}}', expect: 'unresolved' },
    { name: 'non-JSON stderr is held (conservative)', stderr: 'segfault', expect: 'unresolved' },
  ];

  for (const c of cases) {
    it(c.name, async () => {
      const { runner } = scriptedRunner({ code: 1, stdout: '', stderr: c.stderr });
      const adapter = new BuyAdapter({ sandbox: true, token: 'USDC', runner });
      const out = await adapter.pay({ url: 'x' }, 5000);
      expect(out.status).toBe(c.expect);
    });
  }

  it('treats a non-zero exit with stderr as a failure, never ok', async () => {
    const { runner } = scriptedRunner({ code: 1, stdout: 'partial', stderr: '{"error":{"code":"timeout","httpStatus":504}}' });
    const adapter = new BuyAdapter({ sandbox: true, token: 'USDC', runner });
    const out = await adapter.pay({ url: 'x' }, 5000);
    expect(out.status).not.toBe('ok');
  });
});

describe('parseBuyError / classifyError units', () => {
  it('parses the retryable flag', () => {
    const e = parseBuyError('{"error":{"code":"timeout","httpStatus":504,"retryable":false}}');
    expect(e.retryable).toBe(false);
    expect(e.httpStatus).toBe(504);
    expect(classifyError(e)).toBe('unresolved');
  });
});
