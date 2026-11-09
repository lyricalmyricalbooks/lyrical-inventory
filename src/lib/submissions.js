/**
 * submissions.js — read an artist's pending sales and expenses safely.
 *
 * Each pending submission is a cloud document whose `data` field holds the
 * record as JSON text. Every screen that lists them (History, Expenses, the
 * Dashboard's transfers, the approval banner) parsed that text itself, and
 * most did it bare: one document with a missing, non-text or garbled `data`
 * (an older client, a hand edit in the console, a write cut short) threw in
 * the middle of drawing and left the screen blank for the publisher AND the
 * artist, on every redraw.
 *
 * `readableSubmissions` cleans the whole set once, where it arrives from the
 * cloud: unreadable entries are left out (and listed, so they can be
 * reported), and every kept entry's `data` is JSON text of a plain object, so
 * the existing `JSON.parse(x.data)` readers can no longer throw.
 */

/**
 * @param {unknown} data the record as stored: JSON text, or (older writers) an object
 * @returns {Record<string, unknown> | null} the record, or null if unreadable
 */
export function parseSubmissionData(data) {
  let value = data;
  if (typeof value === 'string') {
    try { value = JSON.parse(value); } catch (_) { return null; }
  }
  return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
}

/**
 * @param {unknown} subs `{ sales?: { [key]: { data, ts } }, expenses?: … }` as the watcher delivers it
 * @returns {{ clean: Record<string, Record<string, any>>, dropped: string[] }}
 */
export function readableSubmissions(subs) {
  const clean = {};
  const dropped = [];
  if (!subs || typeof subs !== 'object') return { clean, dropped };
  for (const [type, entries] of Object.entries(subs)) {
    if (!entries || typeof entries !== 'object') { dropped.push(type); continue; }
    const kept = {};
    for (const [key, sub] of Object.entries(entries)) {
      const record = sub && typeof sub === 'object' ? parseSubmissionData(sub.data) : null;
      if (!record) { dropped.push(`${type}/${key}`); continue; }
      kept[key] = { ...sub, data: typeof sub.data === 'string' ? sub.data : JSON.stringify(record) };
    }
    // Same shape the watcher gives: a type with nothing left is absent.
    if (Object.keys(kept).length) clean[type] = kept;
  }
  return { clean, dropped };
}
