/**
 * Turn a model-written report into a Telegram-safe HTML message.
 *
 * Telegram renders a tiny HTML subset (<b>, <i>, <a>, <code>…) and has NO table support, so a
 * Markdown table always looks broken. This formatter:
 *   - degrades any stray Markdown table into bullet lines (separator rows dropped),
 *   - converts **bold** and leading #-headings to <b>…</b>,
 *   - normalises "- "/"* " bullets to "• ",
 *   - HTML-escapes everything else so a stray '<' or '&' can never 400 the send.
 * Bare URLs are left as text; Telegram auto-links them.
 */

/** Escape the three characters Telegram's HTML parser treats specially. */
export function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

const TABLE_SEPARATOR = /^\|?[\s:|-]*-[\s:|-]*\|[\s:|-]*$/; // e.g. |---|:--:|

export function formatReportForTelegram(raw: string): string {
  // 1. Degrade Markdown tables line-by-line (before escaping, while pipes are intact).
  const lines = raw.trim().split('\n').flatMap((line) => {
    const t = line.trim();
    if (t.includes('|') && TABLE_SEPARATOR.test(t)) return []; // drop |---|---| rows
    if (/^\|.*\|$/.test(t)) {
      const cells = t.slice(1, -1).split('|').map((c) => c.trim()).filter(Boolean);
      return cells.length ? [`• ${cells.join(' · ')}`] : [];
    }
    return [line];
  });

  // 2. Escape HTML. The Markdown markers (** # - *) are plain chars and survive this.
  let text = escapeHtml(lines.join('\n'));

  // 3. Apply the safe subset.
  text = text
    .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>') // **bold** -> <b>
    .replace(/^\s{0,3}#{1,6}\s*(.+?)\s*$/gm, '<b>$1</b>') // # Heading -> <b>
    .replace(/^\s*[-*]\s+/gm, '• ') // bullets
    .replace(/\n{3,}/g, '\n\n') // collapse blank runs
    .trim();

  return text;
}
