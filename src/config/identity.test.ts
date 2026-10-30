import { describe, it, expect, afterEach } from 'vitest';
import { codeFromRepo } from '@celo/attribution-tags';
import {
  TAG,
  REPO_URL,
  EVENT_SLUG,
  FORBIDDEN_CELODESK,
  DERIVED_REPO_TAG_DO_NOT_USE,
  checkIdentity,
} from './identity.js';

const ORIGINAL_WALLET = process.env.AGENT_WALLET;

afterEach(() => {
  if (ORIGINAL_WALLET === undefined) delete process.env.AGENT_WALLET;
  else process.env.AGENT_WALLET = ORIGINAL_WALLET;
});

describe('identity constants', () => {
  it('uses the Loops-issued tag, not the repo-derived one', () => {
    expect(TAG).toBe('celo_c42607f62b5b');
    // The repo-derived tag is a DIFFERENT value and must never be the live tag.
    expect(codeFromRepo('quab-bot/MyPadi')).toBe(DERIVED_REPO_TAG_DO_NOT_USE);
    expect(TAG).not.toBe(DERIVED_REPO_TAG_DO_NOT_USE);
  });

  it('points at the MyPadi repo and the right event', () => {
    expect(REPO_URL).toBe('https://github.com/quab-bot/MyPadi');
    expect(EVENT_SLUG).toBe('agents-on-open-rails');
  });
});

describe('checkIdentity', () => {
  it('passes a clean config (no wallet set yet)', () => {
    delete process.env.AGENT_WALLET;
    const r = checkIdentity();
    expect(r.ok).toBe(true);
    expect(r.errors).toEqual([]);
  });

  it('rejects any CeloDesk identifier found in scanned config', () => {
    const r = checkIdentity({ scan: [{ note: `wallet ${FORBIDDEN_CELODESK.wallet}` }] });
    expect(r.ok).toBe(false);
    expect(r.errors.join(' ')).toContain('Forbidden CeloDesk identifier');
  });

  it('rejects the CeloDesk email appearing in config', () => {
    const r = checkIdentity({ scan: ['contact: quadribello3@gmail.com'] });
    expect(r.ok).toBe(false);
  });

  it('rejects a derived address that does not match AGENT_WALLET', () => {
    process.env.AGENT_WALLET = '0x1111111111111111111111111111111111111111';
    const r = checkIdentity({ derivedAddress: '0x2222222222222222222222222222222222222222' });
    expect(r.ok).toBe(false);
    expect(r.errors.join(' ')).toContain('does not match');
  });

  it('accepts a derived address that matches AGENT_WALLET (case-insensitive)', () => {
    process.env.AGENT_WALLET = '0xAbC0000000000000000000000000000000000001';
    const r = checkIdentity({ derivedAddress: '0xabc0000000000000000000000000000000000001' });
    expect(r.ok).toBe(true);
  });
});
