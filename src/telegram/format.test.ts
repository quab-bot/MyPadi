import { describe, it, expect } from 'vitest';
import { formatReportForTelegram, escapeHtml } from './format.js';

describe('formatReportForTelegram', () => {
  it('converts **bold** to <b> and bullets to •', () => {
    const out = formatReportForTelegram('**Summary**\n- point one\n- point two');
    expect(out).toContain('<b>Summary</b>');
    expect(out).toContain('• point one');
    expect(out).not.toContain('**');
  });

  it('degrades a Markdown table to bullet lines and drops the separator', () => {
    const table = '| Theme | Evidence |\n|-------|----------|\n| Payments | [1] |\n| Buybacks | [7] |';
    const out = formatReportForTelegram(table);
    expect(out).not.toMatch(/\|-+\|/); // separator row gone
    expect(out).toContain('• Theme · Evidence');
    expect(out).toContain('• Payments · [1]');
  });

  it('escapes HTML special characters so a stray < cannot break the send', () => {
    const out = formatReportForTelegram('price < 5 & rising > fast');
    expect(out).toContain('&lt;');
    expect(out).toContain('&amp;');
    expect(out).toContain('&gt;');
  });

  it('converts # headings to bold', () => {
    expect(formatReportForTelegram('# Overview')).toBe('<b>Overview</b>');
  });

  it('leaves bare URLs intact for Telegram auto-linking', () => {
    const out = formatReportForTelegram('[1] X - https://t.co/abc123');
    expect(out).toContain('https://t.co/abc123');
  });

  it('escapeHtml handles the three special chars', () => {
    expect(escapeHtml('a<b>&c')).toBe('a&lt;b&gt;&amp;c');
  });
});
