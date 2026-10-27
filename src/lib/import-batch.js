// Spreadsheet import (main.js handleImportFile / confirmImport): reading each
// row's date without guessing quietly, and telling one import's rows apart so
// the whole import can be undone in one step.

const pad = n => String(n).padStart(2, '0');
const isoOf = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`;

function validDay(y, m, d) {
  if (!(m >= 1 && m <= 12 && d >= 1 && d <= 31)) return false;
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
}

/**
 * One cell's date as YYYY-MM-DD, and what (if anything) the owner should check.
 * `issue` is null when the date is certain, 'ambiguous' when it could be read
 * day-first or month-first (03/04/2025) and was read the way `order` says,
 * 'unreadable' when it could not be read at all and `todayStr` was used, and
 * 'missing' when the cell was empty and `todayStr` was used, and 'shortYear'
 * when only one reading works but the year has two digits (26-10-01 could be
 * 2026-10-01 written year-first). It used to be
 * `new Date(text)`, which reads 03/04 as March 4th and turns anything it can't
 * read into today's date, with nothing on screen to say so.
 *
 * @param {unknown} raw
 * @param {{ order?: 'mdy'|'dmy', todayStr: string, excelSerial?: (n: number) => string|null }} opts
 * @returns {{ date: string, issue: null|'ambiguous'|'unreadable'|'missing'|'shortYear' }}
 */
export function parseImportDate(raw, { order = 'mdy', todayStr, excelSerial } = {}) {
  if (raw instanceof Date) {
    if (isNaN(raw)) return { date: todayStr, issue: 'unreadable' };
    return { date: raw.toISOString().split('T')[0], issue: null };
  }
  if (typeof raw === 'number') {
    const d = excelSerial ? excelSerial(raw) : null;
    return d ? { date: d, issue: null } : { date: todayStr, issue: 'unreadable' };
  }
  const text = typeof raw === 'string' ? raw.trim() : '';
  if (!text) return { date: todayStr, issue: 'missing' };

  let m = text.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[T\s].*)?$/);
  if (m) {
    const [y, mo, d] = [+m[1], +m[2], +m[3]];
    return validDay(y, mo, d) ? { date: isoOf(y, mo, d), issue: null } : { date: todayStr, issue: 'unreadable' };
  }

  m = text.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2}|\d{4})(?:\s.*)?$/);
  if (m) {
    const a = +m[1], b = +m[2];
    const y = m[3].length === 2 ? 2000 + +m[3] : +m[3];
    const mdy = validDay(y, a, b);
    const dmy = validDay(y, b, a);
    if (mdy && dmy && a !== b) {
      return order === 'dmy' ? { date: isoOf(y, b, a), issue: 'ambiguous' } : { date: isoOf(y, a, b), issue: 'ambiguous' };
    }
    const shortYear = m[3].length === 2 ? 'shortYear' : null;
    if (mdy) return { date: isoOf(y, a, b), issue: shortYear };
    if (dmy) return { date: isoOf(y, b, a), issue: shortYear };
    return { date: todayStr, issue: 'unreadable' };
  }

  // Written-out dates ("Oct 3, 2025", "3 October 2025") have no day/month
  // doubt; anything else the browser can't read is reported, not guessed.
  if (/[a-z]/i.test(text)) {
    const d = new Date(text);
    if (!isNaN(d)) return { date: isoOf(d.getFullYear(), d.getMonth() + 1, d.getDate()), issue: null };
  }
  return { date: todayStr, issue: 'unreadable' };
}

/** Counts of rows needing a look, for the preview's summary line. */
export function importDateIssues(rows) {
  const out = { ambiguous: 0, unreadable: 0, missing: 0, shortYear: 0 };
  for (const r of rows || []) if (r && r.dateIssue && out[r.dateIssue] != null) out[r.dateIssue]++;
  return out;
}

export function newImportId(now = Date.now(), rand = Math.random) {
  return `imp-${now.toString(36)}-${Math.floor(rand() * 1e9).toString(36)}`;
}

/**
 * The most recent import that still has rows counting in this book's history,
 * or null. Rows carry `importId`, `importedAt` (ISO) and `importName` (the
 * file's name) from confirmImport.
 */
export function latestImport(hist) {
  const groups = new Map();
  for (const h of hist || []) {
    if (!h || !h.importId || h.voided) continue;
    const g = groups.get(h.importId) || { id: h.importId, at: h.importedAt || '', name: h.importName || '', count: 0 };
    g.count++;
    groups.set(h.importId, g);
  }
  let best = null;
  for (const g of groups.values()) if (!best || g.at > best.at) best = g;
  return best;
}
