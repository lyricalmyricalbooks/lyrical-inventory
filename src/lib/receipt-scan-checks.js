// What the receipt reader's answer is checked against before the owner logs it.
//
// The reader is good at finding the words on a receipt and less good at
// knowing which of three similar numbers is the one that matters. Asking it
// for the breakdown as well as the total — and then doing the arithmetic here,
// in plain code — turns "the AI said $38.50" into "the items and tax on this
// receipt come to $43.49, so $38.50 is probably the price before tax". The
// same goes for a date that lands in the future and a shop the owner has
// always filed one particular way.
//
// Nothing here writes to the ledger or changes a figure on its own. Each check
// says what it found; the screen decides what to show and the owner decides
// what to do about it. Pure, so every rule can be tested without a browser.

import { fmt, getSym } from './money.js';

const str = (v) => (v == null ? '' : String(v)).trim();

/**
 * A figure off a receipt, however the reader wrote it.
 *
 * The reader is asked for a plain number, and Google's reader always sends
 * one. The backup reader does not always: "1,234.56", "$45.00 CAD" and the
 * French-Canadian "12,50 $" all come back as text. Stripping everything but
 * digits and dots — the old way — read "12,50" as 1250: a hundred times the
 * real amount. The separator that comes last is the decimal point, unless it
 * is a comma grouping thousands.
 *
 * @returns {number} the amount, or 0 when nothing usable is there.
 */
export function parseScannedAmount(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const raw = str(value);
  if (!raw) return 0;
  // A leading minus (or the Unicode one), or accounting brackets.
  const negative = /^[-−]|^\(.*\)$/.test(raw);
  let text = raw.replace(/[^\d.,]/g, '');
  if (!/\d/.test(text)) return 0;

  const lastDot = text.lastIndexOf('.');
  const lastComma = text.lastIndexOf(',');
  if (lastDot >= 0 && lastComma >= 0) {
    // Both appear: whichever comes last is the decimal point.
    if (lastDot > lastComma) text = text.replace(/,/g, '');
    else text = text.replace(/\./g, '').replace(',', '.');
  } else if (lastComma >= 0) {
    if (/^\d+,\d{1,2}$/.test(text)) text = text.replace(',', '.'); // 12,50
    else text = text.replace(/,/g, ''); // 1,234 or 1,234,567
  } else if (/^\d{1,3}(\.\d{3}){2,}$/.test(text)) {
    text = text.replace(/\./g, ''); // 1.234.567 — dots grouping thousands
  }

  const n = Number(text);
  if (!Number.isFinite(n)) return 0;
  return negative ? -n : n;
}

/**
 * Whether `code` is a real currency the exchange-rate lookups can convert.
 * The browser's own list where it has one; otherwise any three letters.
 */
export function isCurrencyCode(code) {
  const c = str(code).toUpperCase();
  if (!/^[A-Z]{3}$/.test(c)) return false;
  try {
    const known = Intl.supportedValuesOf?.('currency');
    if (Array.isArray(known) && known.length) return known.includes(c);
  } catch (_) { /* older browser: fall through */ }
  return true;
}

// A receipt that prints tax per line can be a cent or two out once added up.
const CENT_SLACK = 2;

/**
 * Do the figures on the receipt add up to the total the reader picked?
 *
 * @param {{amount, subtotal?, tax?, tip?, shipping?, discount?, taxIncluded?}} reading
 * @returns {{status: 'adds-up'|'before-tax'|'mismatch'|'unchecked',
 *            expected?: number, total?: number, subtotal?: number, tax?: number,
 *            tip?: number, shipping?: number, discount?: number, taxIncluded?: boolean}}
 *   - adds-up    — the breakdown comes to the total.
 *   - before-tax — the total matches the breakdown WITHOUT the tax, and the
 *                  receipt does not say its prices include tax: the reader has
 *                  very likely taken the pre-tax figure. `expected` is the
 *                  total with tax.
 *   - mismatch   — the breakdown comes to something else entirely.
 *   - unchecked  — there is no breakdown to check against.
 */
export function checkReceiptMath(reading = {}) {
  const cents = (v) => Math.round(parseScannedAmount(v) * 100);
  const total = cents(reading.amount);
  const subtotal = cents(reading.subtotal);
  if (total <= 0 || subtotal <= 0) return { status: 'unchecked' };

  const tax = Math.max(0, cents(reading.tax));
  const tip = Math.max(0, cents(reading.tip));
  const shipping = Math.max(0, cents(reading.shipping));
  const discount = Math.abs(cents(reading.discount));
  // A receipt that only prints one figure has nothing to check: "the subtotal
  // equals the total" would be reported as a check passed when none was made.
  if (!tax && !tip && !shipping && !discount && subtotal === total) return { status: 'unchecked' };

  const beforeTax = subtotal - discount + shipping + tip;
  const withTax = beforeTax + tax;
  const near = (a, b) => Math.abs(a - b) <= CENT_SLACK;
  const facts = {
    total: total / 100, subtotal: subtotal / 100, tax: tax / 100, tip: tip / 100,
    shipping: shipping / 100, discount: discount / 100, expected: withTax / 100,
  };

  if (near(total, withTax)) return { status: 'adds-up', ...facts };
  if (tax > 0 && near(total, beforeTax)) {
    // VAT-style receipts print a tax line that is already inside the prices.
    if (reading.taxIncluded === true) return { status: 'adds-up', taxIncluded: true, ...facts };
    return { status: 'before-tax', ...facts };
  }
  return { status: 'mismatch', ...facts };
}

/** A real calendar date written YYYY-MM-DD (rejects 2026-02-30). */
export function isIsoDate(s) {
  const text = str(s);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return false;
  const d = new Date(`${text}T12:00:00Z`);
  return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === text;
}

const DAY_MS = 86_400_000;
const daysBetween = (a, b) => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / DAY_MS);
const pad = (n) => String(n).padStart(2, '0');

/**
 * Whether the date the reader found is one to double-check.
 *
 * - future — more than a day ahead of today. `suggestion` is the date it most
 *            likely is: day and month swapped (03/11 read the American way
 *            round), or last year's (a December receipt read in January with
 *            no year printed on it). Empty when neither fits.
 * - old    — more than two years back: a misread year, usually.
 *
 * @returns {{kind: 'future', suggestion: string}|{kind: 'old'}|null}
 */
export function scanDateConcern(date, today) {
  if (!isIsoDate(date) || !isIsoDate(today)) return null;
  const ahead = daysBetween(today, date);
  if (ahead > 1) {
    const [y, m, d] = date.split('-').map(Number);
    const swapped = `${y}-${pad(d)}-${pad(m)}`;
    if (d <= 12 && d !== m && isIsoDate(swapped) && swapped <= today) return { kind: 'future', suggestion: swapped };
    const lastYear = `${y - 1}-${pad(m)}-${pad(d)}`;
    if (isIsoDate(lastYear) && lastYear <= today && daysBetween(lastYear, today) <= 200) {
      return { kind: 'future', suggestion: lastYear };
    }
    return { kind: 'future', suggestion: '' };
  }
  if (-ahead > 2 * 365) return { kind: 'old' };
  return null;
}

// Words that change from one receipt to the next for the same shop, or that
// every company name carries: store numbers, legal suffixes, web domains.
const VENDOR_NOISE = /\b(?:inc|incorporated|ltd|limited|llc|llp|corp|corporation|co|company|ltee|gmbh|plc|sa|the)\b/g;
const VENDOR_DOMAIN_TAIL = /(?:\s(?:com|ca|net|org|io|uk|us))+$/;

/**
 * One spelling for a shop, so "STAPLES #1234", "Staples Inc." and
 * "staples.ca" are all "staples".
 */
export function normalizeVendorKey(name) {
  return str(name)
    .normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/#\s*\d+/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(VENDOR_NOISE, ' ')
    .replace(/\b\d+\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(VENDOR_DOMAIN_TAIL, '')
    .trim();
}

/**
 * Every past expense reduced to who it was paid to and where it was filed,
 * built once so a pile of receipts can each be looked up against it.
 *
 * Uses the expense's own `vendor` where it has one (an email import), and
 * otherwise its description — which starts with the shop's name whenever the
 * reader filled it in ("Staples — printer paper"), and very often when it was
 * typed by hand too.
 *
 * @param {Array<{vendor?: string, desc?: string, cat?: string, _cat?: string}>} expenses
 */
export function vendorHabitIndex(expenses) {
  const out = [];
  for (const e of expenses || []) {
    if (!e || e.voided) continue;
    const cat = str(e._cat || e.cat);
    const key = normalizeVendorKey(e.vendor || e.desc);
    if (cat && key) out.push({ key, cat });
  }
  return out;
}

// "staples" is the same shop as "staples business depot" (and the other way
// round) only on a whole-word boundary, so "post" never matches "postnet".
const sameVendor = (a, b) => a === b || b.startsWith(`${a} `) || a.startsWith(`${b} `);

/** At least this many past receipts from the shop before it counts as a habit. */
const HABIT_MIN = 2;

/**
 * How this business has filed receipts from `vendor` before, when that is
 * settled enough to follow: at least two of them, at least two thirds under
 * the same category.
 *
 * A fact about this ledger, not a guess about the shop — the same footing as
 * category-fit.js. "Other" is never a habit worth repeating: it is where an
 * expense lands when nobody chose.
 *
 * @param {string} vendor
 * @param {Array<{key: string, cat: string}>} index  from vendorHabitIndex()
 * @param {{allowed?: string[]}} [opts]  only categories this form offers
 * @returns {{category: string, count: number, of: number}|null}
 */
export function vendorFilingHabit(vendor, index, { allowed = null } = {}) {
  const key = normalizeVendorKey(vendor);
  if (key.length < 3) return null;
  const counts = new Map();
  let matched = 0;
  for (const row of index || []) {
    if (!sameVendor(key, row.key)) continue;
    matched++;
    counts.set(row.cat, (counts.get(row.cat) || 0) + 1);
  }
  if (matched < HABIT_MIN) return null;
  const [category, count] = [...counts].sort((a, b) => b[1] - a[1])[0];
  if (count < HABIT_MIN || count * 3 < matched * 2) return null;
  if (category === 'Other') return null;
  if (Array.isArray(allowed) && !allowed.includes(category)) return null;
  return { category, count, of: matched };
}

/** The fields a reading may name as hard to read. */
export const SCAN_FIELDS = ['vendor', 'date', 'amount', 'currency', 'category', 'reference'];

/** The reader's own list of fields it could not read clearly, cleaned up. */
export function scanUncertainFields(reading) {
  const list = Array.isArray(reading?.uncertain) ? reading.uncertain : [];
  return new Set(list.map(f => str(f).toLowerCase()).filter(f => SCAN_FIELDS.includes(f)));
}

/** Money as the summary prints it: "$43.49", or "AUD 50.00" where there is no symbol. */
export function scanMoney(n, cur) {
  const code = str(cur).toUpperCase();
  const value = Number(n) || 0;
  return code && getSym(code) === code ? `${code} ${value.toFixed(2)}` : fmt(value, code || 'CAD');
}

/**
 * The plain-language checks shown under a scanned receipt, most important
 * first. Each is `{ tone: 'ok' | 'warn', text, fix? }`, where a fix is one
 * figure the owner can accept with a tap: `{ field: 'amount' | 'date', value, label }`.
 *
 * @param {object} f
 * @param {ReturnType<typeof checkReceiptMath>} [f.math]
 * @param {ReturnType<typeof scanDateConcern>} [f.dateConcern]
 * @param {{desc?: string, date?: string}|null} [f.duplicate]  an expense already logged
 * @param {ReturnType<typeof vendorFilingHabit>} [f.habit]
 * @param {boolean} [f.habitOverrode]  the habit replaced a different AI guess
 * @param {string} [f.vendor]
 * @param {string} [f.currency]  the currency now on the form
 * @param {string} [f.currencyAdded]  a currency added to the form's list for this receipt
 * @param {string} [f.currencyRefused]  a currency the reader named that is not a real one
 * @param {string[]} [f.missing]  fields the reader could not fill at all
 * @param {boolean} [f.lowConfidence]
 * @param {string[]} [f.unsure]  boxes the AI flagged that no other check explains, in words
 * @param {string} [f.date]  the date the AI read, for the date checks
 * @param {string} [f.home]  the ledger's own currency
 * @param {(d: string) => string} [f.formatDate]
 */
export function scanReadChecks(f = {}) {
  const checks = [];
  const cur = f.currency || 'CAD';
  const formatDate = f.formatDate || ((d) => d);
  const money = (n) => scanMoney(n, cur);
  const readDate = f.date ? formatDate(f.date) : 'that';

  if (f.duplicate) {
    const what = str(f.duplicate.desc) || 'an expense';
    checks.push({
      tone: 'warn',
      text: `This looks like it is already in your ledger: “${what}” on ${formatDate(f.duplicate.date)} for the same amount. Make sure you are not logging it twice.`,
    });
  }

  const m = f.math || { status: 'unchecked' };
  if (m.status === 'before-tax') {
    checks.push({
      tone: 'warn',
      text: `This total may be the price before tax. With the ${money(m.tax)} tax on the receipt added, it comes to ${money(m.expected)}.`,
      fix: { field: 'amount', value: m.expected.toFixed(2), label: `Use ${money(m.expected)}` },
    });
  } else if (m.status === 'mismatch') {
    checks.push({
      tone: 'warn',
      text: `The figures on the receipt add up to ${money(m.expected)}, not ${money(m.total)}. Check the total against the receipt.`,
    });
  }

  if (f.dateConcern?.kind === 'future') {
    checks.push({
      tone: 'warn',
      text: f.dateConcern.suggestion
        ? `The AI read the date as ${readDate}, which hasn't happened yet. It's probably ${formatDate(f.dateConcern.suggestion)}.`
        : `The AI read the date as ${readDate}, which hasn't happened yet. Check the day, month and year on the receipt.`,
      ...(f.dateConcern.suggestion
        ? { fix: { field: 'date', value: f.dateConcern.suggestion, label: `Use ${formatDate(f.dateConcern.suggestion)}` } }
        : {}),
    });
  } else if (f.dateConcern?.kind === 'old') {
    checks.push({ tone: 'warn', text: `The AI read the date as ${readDate}, more than two years ago. Check the year on the receipt.` });
  }

  if (f.currencyRefused) {
    checks.push({ tone: 'warn', text: `The AI read the currency as “${f.currencyRefused}”, which isn't a real currency. Pick the right one before logging.` });
  }

  const missing = (f.missing || []).filter(Boolean);
  if (missing.length) {
    checks.push({ tone: 'warn', text: `The AI couldn't read the ${joinWords(missing)}. Type ${missing.length > 1 ? 'them' : 'it'} in from the receipt.` });
  } else if (f.lowConfidence) {
    checks.push({ tone: 'warn', text: 'The photo was hard to read. Check the boxes outlined in amber against the receipt.' });
  }
  // Every amber outline gets a sentence: a box the AI flagged that no check
  // above already explains is named here, never left to the colour alone.
  const unsure = (f.unsure || []).filter(w => w && !missing.includes(w));
  if (unsure.length && !f.lowConfidence) {
    checks.push({ tone: 'warn', text: `The AI wasn't sure about the ${joinWords(unsure)}. Check ${unsure.length > 1 ? 'those boxes' : 'that box'} against the receipt.` });
  }

  if (m.status === 'adds-up') {
    const parts = [`items ${money(m.subtotal - m.discount)}`];
    if (m.shipping) parts.push(`shipping ${money(m.shipping)}`);
    if (m.tip) parts.push(`tip ${money(m.tip)}`);
    if (m.tax && !m.taxIncluded) parts.push(`tax ${money(m.tax)}`);
    checks.push({
      tone: 'ok',
      text: m.taxIncluded
        ? `The total matches the receipt, tax of ${money(m.tax)} included.`
        : `The total matches the receipt: ${parts.join(' + ')}.`,
    });
  }

  if (f.habit) {
    const name = str(f.vendor) || 'this shop';
    checks.push({
      tone: 'ok',
      text: f.habitOverrode
        ? `Filed under ${f.habit.category}, the way you filed your last ${f.habit.count} ${name} receipts.`
        : `${f.habit.category} matches how you usually file ${name}.`,
    });
  }

  if (f.currencyAdded) {
    checks.push({ tone: 'ok', text: `The receipt is in ${f.currencyAdded}, so ${f.currencyAdded} was added to the currency list. It is converted to ${f.home || 'your own currency'} when you log it.` });
  }

  return checks;
}

function joinWords(list) {
  if (list.length < 2) return list[0] || '';
  return `${list.slice(0, -1).join(', ')} and ${list[list.length - 1]}`;
}
