// Matching bank and card lines to the receipts already filed.
//
// Two ways in, one shape out: a statement file the bank lets you download
// (CSV), or transactions Plaid sends after the publisher connects a bank.
// Either becomes a list of lines {id, date, description, amount, currency,
// source}, where amount is money that LEFT the account, in dollars (money in
// is negative and is never matched to a receipt).
//
// The match itself is deliberately cautious: a ledger with a wrong link is
// worse than one with a gap. A line and a receipt match only on the exact
// amount, within a few days (cards post a day or three after the purchase).
// The shop's name only breaks ties and raises confidence. A charge in another
// currency can't match on amount, so it is offered as "possible" when the
// shop's name and the day agree, for the publisher to confirm.
// Pure, no dependencies beyond the shared helpers.

import { splitDelimitedRecords } from './csv.js';
import { textSimilarity } from './receipt-match.js';

const cents = value => (typeof value === 'number' && Number.isFinite(value) ? Math.round(value * 100) : null);

/** Whole days from a to b (b − a), or null. */
function daysBetween(a, b) {
  const x = Date.parse(`${String(a || '').slice(0, 10)}T00:00:00Z`);
  const y = Date.parse(`${String(b || '').slice(0, 10)}T00:00:00Z`);
  return Number.isFinite(x) && Number.isFinite(y) ? Math.round((y - x) / 86400000) : null;
}

// ── Reading a statement file ────────────────────────────────────────────────
const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12 };

/**
 * A statement date as YYYY-MM-DD, or ''. Canadian banks write 11/20/2026
 * (month first, RBC and TD), 2026-11-20, 20261120 or "Nov 20, 2026". A first
 * number above 12 can only be a day, so 20/11/2026 is read day first.
 * `dayFirst` forces day-first for a file whose other rows proved it.
 */
export function statementDate(text, dayFirst = false) {
  const s = String(text || '').trim();
  let y, m, d, hit;
  if ((hit = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/.exec(s))) [, y, m, d] = hit;
  else if ((hit = /^(\d{4})(\d{2})(\d{2})$/.exec(s))) [, y, m, d] = hit;
  else if ((hit = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/.exec(s))) {
    const [, a, b, yy] = hit;
    y = yy.length === 2 ? `20${yy}` : yy;
    if (dayFirst || Number(a) > 12) { d = a; m = b; } else { m = a; d = b; }
  } else if ((hit = /^([A-Za-z]{3,4})[a-z]*\.?\s+(\d{1,2}),?\s+(\d{4})$/.exec(s))) {
    m = MONTHS[hit[1].toLowerCase()]; d = hit[2]; y = hit[3];
  } else if ((hit = /^(\d{1,2})[\s-]([A-Za-z]{3,4})[a-z]*\.?[\s-](\d{4})$/.exec(s))) {
    d = hit[1]; m = MONTHS[hit[2].toLowerCase()]; y = hit[3];
  } else return '';
  const mm = Number(m), dd = Number(d), yyyy = Number(y);
  if (!mm || mm > 12 || !dd || dd > 31 || yyyy < 1990 || yyyy > 2100) return '';
  const iso = `${yyyy}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;
  return statementDateValid(iso) ? iso : '';
}

function statementDateValid(iso) {
  const t = new Date(`${iso}T00:00:00Z`);
  return !Number.isNaN(t.getTime()) && t.toISOString().slice(0, 10) === iso;
}

/** "$1,234.56", "(12.00)", "-12.00", "12.00 CR" → dollars; null when blank. */
export function statementAmount(text) {
  let s = String(text ?? '').trim();
  if (!s) return null;
  let negative = false;
  if (/^\(.*\)$/.test(s)) { negative = true; s = s.slice(1, -1); }
  if (/\bCR$/i.test(s)) { negative = true; s = s.replace(/\s*CR$/i, ''); }
  if (/\bDR$/i.test(s)) s = s.replace(/\s*DR$/i, '');
  s = s.replace(/[$€£\s]|CAD|USD/gi, '');
  if (s.startsWith('-')) { negative = !negative; s = s.slice(1); }
  if (s.endsWith('-')) { negative = !negative; s = s.slice(0, -1); }
  // 1.234,56 (European) → 1234.56; 1,234.56 → 1234.56
  if (/^\d{1,3}(\.\d{3})+,\d{2}$/.test(s)) s = s.replace(/\./g, '').replace(',', '.');
  else s = s.replace(/,/g, '');
  if (!/^\d+(\.\d+)?$/.test(s)) return null;
  const n = Number(s);
  return negative ? -n : n;
}

const HEAD = {
  date: /^(?:transaction |trans\.? |posted |posting |post )?date$|^date (?:posted|of transaction)$/i,
  description: /^(?:description(?: 1)?|payee|merchant|name|details|transaction details|memo|narrative)$/i,
  description2: /^(?:description 2|memo 2|details 2)$/i,
  amount: /^(?:amount|transaction amount|cad\$?|amount \(cad\)|value)$/i,
  usd: /^usd\$?$|^amount \(usd\)$/i,
  debit: /^(?:debit|debits|withdrawal|withdrawals|money out|paid out|charges?)(?: amount)?(?: \(\$\))?$/i,
  credit: /^(?:credit|credits|deposit|deposits|money in|paid in|payments?)(?: amount)?(?: \(\$\))?$/i,
  currency: /^(?:currency|ccy)$/i,
};

/**
 * Lines from a bank or card statement file. Returns {lines, problem}: a
 * `problem` sentence when the file cannot be read as a statement.
 * With an Amount column, the bank's sign is unknown; `debitsPositive` says
 * charges are positive (card statements) — otherwise the more common bank
 * convention, charges negative, is assumed and detected from the rows.
 */
export function parseStatement(text, { currency = 'CAD', fileName = '' } = {}) {
  const rows = splitDelimitedRecords(text).slice(0, 20000);
  if (!rows.length) return { lines: [], problem: 'The file is empty.' };
  let header = -1, cols = null;
  for (let r = 0; r < Math.min(rows.length, 15) && header < 0; r++) {
    const found = {};
    rows[r].forEach((cell, i) => {
      const name = String(cell || '').trim();
      for (const [key, re] of Object.entries(HEAD)) if (found[key] === undefined && re.test(name)) found[key] = i;
    });
    if (found.date !== undefined && found.description !== undefined && (found.amount !== undefined || found.debit !== undefined || found.usd !== undefined)) {
      header = r; cols = found;
    }
  }
  // TD and some card exports have no header: date, description, debit, credit[, balance].
  if (!cols) {
    const first = rows[0] || [];
    if (first.length >= 4 && statementDate(first[0]) && !statementDate(first[1])) {
      cols = { date: 0, description: 1, debit: 2, credit: 3 };
    } else {
      return { lines: [], problem: 'This does not look like a bank statement. Download the CSV version from your bank’s website, with columns for the date, the description and the amount.' };
    }
  }
  const body = rows.slice(header + 1);
  // A day above 12 in the first place anywhere proves the file is day first.
  const dayFirst = body.some(row => {
    const m = /^(\d{1,2})[-/.](\d{1,2})[-/.]\d{2,4}$/.exec(String(row[cols.date] || '').trim());
    return m && Number(m[1]) > 12;
  });
  const raw = [];
  for (const row of body) {
    const date = statementDate(row[cols.date], dayFirst);
    if (!date) continue;
    const description = [row[cols.description], cols.description2 !== undefined ? row[cols.description2] : '']
      .map(x => String(x || '').trim()).filter(Boolean).join(' ').slice(0, 300);
    let amount = null, lineCurrency = cols.currency !== undefined && /^[A-Z]{3}$/i.test(String(row[cols.currency] || '').trim())
      ? String(row[cols.currency]).trim().toUpperCase() : currency;
    if (cols.debit !== undefined) {
      const out = statementAmount(row[cols.debit]);
      const back = cols.credit !== undefined ? statementAmount(row[cols.credit]) : null;
      if (out !== null && out !== 0) amount = Math.abs(out);
      else if (back !== null && back !== 0) amount = -Math.abs(back);
    } else {
      amount = cols.amount !== undefined ? statementAmount(row[cols.amount]) : null;
      if ((amount === null || amount === 0) && cols.usd !== undefined) {
        amount = statementAmount(row[cols.usd]);
        if (amount !== null) lineCurrency = 'USD';
      }
      if (amount !== null) amount = -amount; // bank convention: charges negative
    }
    if (amount === null || amount === 0) continue;
    raw.push({ date, description, amount, currency: lineCurrency });
  }
  // A card statement lists charges as positive amounts: when nearly every row
  // came out as money in, the file uses that convention and is flipped back.
  if (cols.debit === undefined && raw.length >= 3) {
    const incoming = raw.filter(line => line.amount < 0).length;
    if (incoming / raw.length > 0.6) raw.forEach(line => { line.amount = -line.amount; });
  }
  if (!raw.length) return { lines: [], problem: 'No dated amounts were found in this file.' };
  const counts = new Map();
  const lines = raw.map(line => {
    const base = `csv:${line.date}:${cents(line.amount)}:${line.description.toLowerCase().replace(/[^a-z0-9]+/g, '').slice(0, 40)}`;
    const n = (counts.get(base) || 0) + 1;
    counts.set(base, n);
    return { id: n > 1 ? `${base}:${n}` : base, ...line, source: fileName ? `file:${fileName.slice(0, 80)}` : 'file' };
  });
  return { lines, problem: '' };
}

// ── Plaid transactions ──────────────────────────────────────────────────────
/** Plaid transactions → lines. Plaid already counts money out as positive. */
export function plaidLines(transactions, institution = '') {
  return (transactions || []).filter(t => t && typeof t.amount === 'number' && Number.isFinite(t.amount) && !t.pending)
    .map(t => ({
      id: `plaid:${String(t.transaction_id || '').slice(0, 80)}`,
      date: statementDateValid(String(t.date || '')) ? t.date : '',
      description: String(t.merchant_name || t.name || '').slice(0, 300),
      amount: t.amount,
      currency: /^[A-Z]{3}$/.test(String(t.iso_currency_code || '')) ? t.iso_currency_code : 'CAD',
      source: `bank:${String(institution || 'Plaid').slice(0, 80)}`,
    }))
    .filter(line => line.date && line.id !== 'plaid:');
}

/** Keep `lines` up to date with one Plaid sync page: added, modified, removed. */
export function applyPlaidSync(lines, { added = [], modified = [], removed = [] }, institution = '') {
  const gone = new Set([...removed.map(r => `plaid:${r.transaction_id || r}`), ...plaidLines(modified, institution).map(l => l.id)]);
  const kept = (lines || []).filter(line => !gone.has(line.id));
  return [...kept, ...plaidLines([...added, ...modified], institution)];
}

/** Add newly read lines, skipping any already held (same id). Newest first. */
export function mergeLines(existing, incoming) {
  const seen = new Set((existing || []).map(line => line.id));
  const merged = [...(existing || [])];
  for (const line of incoming || []) if (!seen.has(line.id)) { seen.add(line.id); merged.push(line); }
  return merged.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0)).slice(0, 5000);
}

// ── Matching ────────────────────────────────────────────────────────────────
const SHOP_NOISE = /\b(?:pos|purchase|debit|credit|card|visa|mastercard|mc|interac|payment|pmt|www|com|ca|inc|ltd|llc|corp|online|store|recurring|preauthorized|pre-authorized|pap|ach|sq|tst|pp)\b|\*|#\d+|\d{4,}/gi;

/** The shop part of a bank description: "SQ *PAPER SUPPLY CO 4421 TORONTO" → "paper supply co toronto". */
export function shopWords(text) {
  return String(text || '').toLowerCase().replace(SHOP_NOISE, ' ').replace(/[^a-zÀ-ɏ]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function expenseShop(expense) {
  return [expense.vendor, expense.desc].filter(Boolean).join(' ');
}

const MATCH_DAYS_BEFORE = 2;   // a pre-authorisation can post before the receipt's date
const MATCH_DAYS_AFTER = 5;    // cards post up to a few business days later

/**
 * Pair statement lines with filed expenses. Returns
 * {matched:[{line, expense, sure, why}], missing:[line], unmatched:[expense]}.
 * `missing` are charges with no receipt — what the publisher needs to chase.
 * `links` holds choices already made: {lineId: expenseId | 'none'}.
 * Each expense matches at most one line, and the reverse.
 */
export function matchBankLines(lines, expenses, { links = {}, from = '', to = '' } = {}) {
  const out = (lines || []).filter(line => line.amount > 0 && (!from || line.date >= from) && (!to || line.date <= to));
  const pool = (expenses || []).filter(e => e && !e.deleted && !e.voided && cents(Number(e.amount)) > 0);
  const byId = new Map(pool.map(e => [String(e.id), e]));
  const usedExpense = new Set(), usedLine = new Set();
  const matched = [];
  // Choices the publisher already made win.
  for (const line of out) {
    const choice = links[line.id];
    if (choice === 'none') { usedLine.add(line.id); continue; }
    const expense = choice && byId.get(String(choice));
    if (expense && !usedExpense.has(String(expense.id))) {
      matched.push({ line, expense, sure: true, why: 'You matched these' });
      usedExpense.add(String(expense.id)); usedLine.add(line.id);
    }
  }
  const candidates = [];
  for (const line of out) {
    if (usedLine.has(line.id)) continue;
    const lineCents = cents(line.amount);
    const lineShop = shopWords(line.description);
    for (const expense of pool) {
      if (usedExpense.has(String(expense.id))) continue;
      const gap = daysBetween(expense.date, line.date);
      if (gap === null || gap < -MATCH_DAYS_BEFORE || gap > MATCH_DAYS_AFTER) continue;
      const name = textSimilarity(lineShop, shopWords(expenseShop(expense)));
      const sameCurrency = !expense.currency || expense.currency === line.currency;
      const amountCents = sameCurrency ? cents(Number(expense.amount))
        : (expense.fxRate && line.currency === 'CAD' ? cents(Number(expense.baseAmount)) : null);
      let score = 0, sure = false, why = '';
      if (amountCents !== null && amountCents === lineCents) {
        score = 100 + name * 20 - Math.abs(gap) * 2;
        sure = sameCurrency || name >= 0.5;
        why = name >= 0.5 ? 'Same amount, shop and week' : 'Same amount within a few days';
      } else if (!sameCurrency && name >= 0.5 && Math.abs(gap) <= 3) {
        // Charged in another currency: the bank's rate never equals the
        // receipt's, so only the shop and the day can suggest it.
        const near = amountCents !== null && Math.abs(amountCents - lineCents) <= Math.max(100, lineCents * 0.04);
        if (amountCents === null || near) { score = 50 + name * 20 - Math.abs(gap) * 2; why = `Same shop, paid in ${expense.currency}`; }
      }
      if (score > 0) candidates.push({ line, expense, score, sure, why });
    }
  }
  candidates.sort((a, b) => b.score - a.score || (a.line.date < b.line.date ? -1 : 1));
  for (const c of candidates) {
    if (usedLine.has(c.line.id) || usedExpense.has(String(c.expense.id))) continue;
    usedLine.add(c.line.id); usedExpense.add(String(c.expense.id));
    matched.push({ line: c.line, expense: c.expense, sure: c.sure, why: c.why });
  }
  const missing = out.filter(line => !usedLine.has(line.id));
  const span = out.length ? [out.reduce((m, l) => (l.date < m ? l.date : m), out[0].date), out.reduce((m, l) => (l.date > m ? l.date : m), out[0].date)] : null;
  // Receipts in the statement's own dates that no line paid: paid another
  // way (cash, another card), or a line the file did not include.
  const unmatched = span ? pool.filter(e => !usedExpense.has(String(e.id)) && e.date >= span[0] && e.date <= span[1]) : [];
  return { matched, missing, unmatched };
}

/** One line of summary for the screen. */
export function describeBankCheck({ matched, missing }) {
  const sure = matched.filter(m => m.sure).length;
  const maybe = matched.length - sure;
  const parts = [`${sure} charge${sure === 1 ? '' : 's'} matched to a receipt`];
  if (maybe) parts.push(`${maybe} to confirm`);
  parts.push(missing.length ? `${missing.length} with no receipt yet` : 'none missing a receipt');
  return parts.join(', ') + '.';
}
