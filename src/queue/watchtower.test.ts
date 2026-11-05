import { describe, it, expect } from 'vitest';
import { normalizeUrl, fingerprint, newItems, mergeSeen } from './watchtower.js';

describe('watchtower diffing', () => {
  it('normalizes trailing slash, query, fragment and case', () => {
    expect(normalizeUrl('https://X.com/Post/1?utm=a#frag')).toBe('https://x.com/post/1');
    expect(normalizeUrl('https://x.com/post/1/')).toBe('https://x.com/post/1');
  });

  it('fingerprints evidence by normalized url, deduped, ignoring url-less items', () => {
    const fp = fingerprint([
      { source: 'X', excerpt: 'a', url: 'https://x.com/1' },
      { source: 'X', excerpt: 'b', url: 'https://x.com/1/' }, // same after normalize
      { source: 'Reddit', excerpt: 'c' }, // no url -> skipped
      { source: 'YouTube', excerpt: 'd', url: 'https://yt.com/v' },
    ]);
    expect(fp.sort()).toEqual(['https://x.com/1', 'https://yt.com/v']);
  });

  it('newItems returns only fingerprints not already seen', () => {
    expect(newItems(['a', 'b', 'c'], ['b'])).toEqual(['a', 'c']);
    expect(newItems(['a'], ['a'])).toEqual([]);
  });

  it('mergeSeen unions and caps the stored set', () => {
    const merged = mergeSeen(['b', 'c'], ['a', 'b']);
    expect(new Set(merged)).toEqual(new Set(['a', 'b', 'c']));
    const big = mergeSeen(Array.from({ length: 600 }, (_, i) => `s${i}`), ['new']);
    expect(big.length).toBeLessThanOrEqual(500);
    expect(big[0]).toBe('new'); // current kept first
  });
});
