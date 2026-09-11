// What the Intelligence panel is allowed to change, and what counts as a valid
// value for each field.
//
// "General" here means declarative, not arbitrary. The panel can edit any field
// listed below, and adding another is one entry in this table — but it can
// never set a property that isn't here, because the alternative is a language
// model writing free-form keys into a financial ledger. A typo'd field name
// would not error; it would quietly add a property nothing reads, and the real
// one would still be wrong.
//
// Three things every entry carries, and why:
//   - `key`      the stored property, which is often NOT what the field is
//                called in an answer. The read tools say `printRun` and
//                `publisherSplitPct`; the records say `maxPrint` and
//                `pubGratuity`. Naming the public side consistently in both
//                directions is what stops the model asking to change a field it
//                just read about under a different name.
//   - `coerce`   text in, stored type out. Everything arrives as a string from
//                a language model, including "1,299.00" and "CA$40".
//   - `risk`     'descriptive' or 'money'. A wrong ISBN is an inconvenience; a
//                wrong commission rate silently changes what an author is owed
//                for every future sale. The panel warns differently for each.
//
// Deliberately absent: an author's email address and password. Those decide who
// can read a book's whole sales history — settings/bookOwners is built from
// them and firestore.rules reads it — so they are an access-control boundary,
// not a data field, and they are not something to change by describing a change
// in a chat box. They stay on the Edit Book form.

import { CURRENCY_SYMBOL_TO_CODE, CODE_TO_SYMBOL, normalizeCurrencyCode } from './money.js';
import { canonicalExpenseCategory } from './expense-categories.js';

/** Record families the panel can write to, and how each one is saved. */
export const WRITE_TARGETS = {
  book: { label: 'Book', save: 'catalog' },
  businessExpense: { label: 'Business expense', save: 'taxCenter' },
  bookExpense: { label: 'Book expense', save: 'bookState' },
  store: { label: 'Consignment shop', save: 'bookState' },
  tripBudget: { label: 'Trip budget', save: 'taxCenter' },
};

const str = (v) => (v == null ? '' : String(v)).trim();

/**
 * Read a number out of whatever a language model produced.
 *
 * "1,299.00", "CA$40", "40 %" and " 40 " all have to land on 40 — a value the
 * publisher clearly meant, rejected on formatting, is a worse outcome than
 * accepting it, because they will simply type it into the form by hand instead
 * and the check that would have caught a real mistake never runs.
 */
function toNumber(raw) {
  const cleaned = str(raw).replace(/[^\d.,-]/g, '').replace(/,/g, '');
  if (!cleaned || !/\d/.test(cleaned)) return NaN;
  return Number(cleaned);
}

/**
 * ISBN-10 and ISBN-13 check digits.
 *
 * Worth doing rather than storing whatever arrives: an ISBN is exactly the kind
 * of long digit string that gets a character transposed on its way from a
 * publisher's email into a chat message, and a wrong one is invisible until a
 * shop cannot order the book. The checksum catches almost every single-digit
 * slip and every transposition.
 */
export function isbnCheckDigitValid(raw) {
  const s = str(raw).replace(/[\s-]/g, '').toUpperCase();
  if (s.length === 10) {
    if (!/^\d{9}[\dX]$/.test(s)) return false;
    let sum = 0;
    for (let i = 0; i < 9; i++) sum += (10 - i) * Number(s[i]);
    sum += s[9] === 'X' ? 10 : Number(s[9]);
    return sum % 11 === 0;
  }
  if (s.length === 13) {
    if (!/^\d{13}$/.test(s)) return false;
    let sum = 0;
    for (let i = 0; i < 12; i++) sum += Number(s[i]) * (i % 2 ? 3 : 1);
    return (10 - (sum % 10)) % 10 === Number(s[12]);
  }
  return false;
}

const text = (opts = {}) => ({
  type: 'text',
  coerce: str,
  validate: (v) => {
    if (opts.required && !v) return 'it cannot be left empty';
    if (opts.max && v.length > opts.max) return `it is longer than ${opts.max} characters`;
    return null;
  },
  format: (v) => str(v) || '—',
  ...opts,
});

const number = (opts = {}) => ({
  type: 'number',
  coerce: toNumber,
  validate: (v) => {
    if (!Number.isFinite(v)) return 'it is not a number';
    if (opts.min != null && v < opts.min) return `it cannot be below ${opts.min}`;
    if (opts.max != null && v > opts.max) return `it cannot be above ${opts.max}`;
    if (opts.integer && !Number.isInteger(v)) return 'it has to be a whole number';
    return null;
  },
  format: (v) => (Number.isFinite(v) ? String(v) : '—'),
  ...opts,
});

const isoDate = () => ({
  type: 'date',
  coerce: str,
  validate: (v) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return 'it is not a date in year-month-day form';
    // Rejects 2026-02-30, which matches the pattern but is not a real day.
    const d = new Date(`${v}T00:00:00Z`);
    if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== v) return 'that is not a real date';
    return null;
  },
  format: (v) => str(v) || '—',
});

/** Books store a currency SYMBOL ('CA$'); expenses store a CODE ('CAD'). */
const currencySymbol = () => ({
  type: 'currency',
  coerce: (raw) => {
    const s = str(raw);
    if (CURRENCY_SYMBOL_TO_CODE[s]) return s;
    const asCode = s.toUpperCase();
    return CODE_TO_SYMBOL[asCode] || s;
  },
  validate: (v) => (CURRENCY_SYMBOL_TO_CODE[v] ? null : `"${v}" is not a currency this app knows`),
  format: (v) => str(v) || '—',
});

const currencyCode = () => ({
  type: 'currency',
  coerce: (raw) => {
    const s = str(raw);
    return CURRENCY_SYMBOL_TO_CODE[s] || normalizeCurrencyCode(s.toUpperCase(), '');
  },
  validate: (v) => (CODE_TO_SYMBOL[v] ? null : `"${v}" is not a currency this app knows`),
  format: (v) => str(v) || '—',
});

const boolean = () => ({
  type: 'boolean',
  coerce: (raw) => {
    const s = str(raw).toLowerCase();
    return s === 'true' || s === 'yes' || s === '1';
  },
  validate: (v, _rec, raw) => {
    const s = str(raw).toLowerCase();
    return ['true', 'false', 'yes', 'no', '1', '0'].includes(s) ? null : 'it has to be yes or no';
  },
  format: (v) => (v ? 'Yes' : 'No'),
});

const link = () => ({
  type: 'text',
  coerce: str,
  validate: (v) => {
    if (!v) return null;                      // clearing a link is allowed
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return null;
    try {
      const u = new URL(v);
      return (u.protocol === 'http:' || u.protocol === 'https:') ? null : 'it has to be a web address or an email';
    } catch (_) {
      return 'it has to be a web address or an email';
    }
  },
  format: (v) => str(v) || '—',
});

/**
 * Every writable field, keyed by the name the read tools already use for it.
 *
 * `risk: 'money'` marks a field where a wrong value changes what someone is
 * paid or charged, rather than how a record reads.
 */
export const WRITABLE_FIELDS = {
  // ── Books ────────────────────────────────────────────────────────────────
  'book.title': { target: 'book', key: 'title', label: 'Title', risk: 'descriptive', ...text({ required: true, max: 300 }) },
  'book.author': { target: 'book', key: 'author', label: 'Author', risk: 'descriptive', ...text({ max: 300 }) },
  'book.isbn': {
    target: 'book', key: 'isbn', label: 'ISBN', risk: 'descriptive',
    type: 'text',
    coerce: str,
    validate: (v) => {
      // '—' is the app's own "not set yet" placeholder and has to stay usable,
      // so it is the one non-ISBN this accepts.
      if (!v || v === '—') return null;
      return isbnCheckDigitValid(v)
        ? null
        : 'its check digit does not match, so at least one character is wrong';
    },
    format: (v) => str(v) || '—',
  },
  'book.listPrice': { target: 'book', key: 'listPrice', label: 'List price', risk: 'money', ...number({ min: 0, max: 100000 }) },
  'book.currency': { target: 'book', key: 'currency', label: 'Currency', risk: 'money', ...currencySymbol() },
  'book.productionCost': { target: 'book', key: 'productionCost', label: 'Total production cost', risk: 'money', ...number({ min: 0 }) },
  'book.printRun': { target: 'book', key: 'maxPrint', label: 'Print run', risk: 'money', ...number({ min: 0, integer: true }) },
  'book.lowStockThreshold': { target: 'book', key: 'threshold', label: 'Low-stock warning at', risk: 'descriptive', ...number({ min: 0, integer: true }) },
  'book.publisherSplitPct': { target: 'book', key: 'pubGratuity', label: 'Publisher share %', risk: 'money', ...number({ min: 0, max: 100 }) },
  'book.authorSplitPct': { target: 'book', key: 'authorGratuity', label: 'Author share %', risk: 'money', ...number({ min: 0, max: 100 }) },
  'book.paymentLink': { target: 'book', key: 'paymentLink', label: 'Payment link', risk: 'money', ...link() },
  'book.stripeLink': { target: 'book', key: 'stripeLink', label: 'Stripe link', risk: 'money', ...link() },
  'book.shipWeight': { target: 'book', key: 'shipWeight', label: 'Shipping weight', risk: 'descriptive', ...number({ min: 0 }) },
  'book.shipLength': { target: 'book', key: 'shipLength', label: 'Shipping length', risk: 'descriptive', ...number({ min: 0 }) },
  'book.shipWidth': { target: 'book', key: 'shipWidth', label: 'Shipping width', risk: 'descriptive', ...number({ min: 0 }) },
  'book.shipHeight': { target: 'book', key: 'shipHeight', label: 'Shipping height', risk: 'descriptive', ...number({ min: 0 }) },
  'book.shipHsCode': { target: 'book', key: 'shipHsCode', label: 'Customs code', risk: 'descriptive', ...text({ max: 40 }) },

  // ── Expenses (the same fields on both the business and the per-book ledger)
  'businessExpense.description': { target: 'businessExpense', key: 'desc', label: 'Description', risk: 'descriptive', ...text({ max: 400 }) },
  'businessExpense.category': {
    target: 'businessExpense', key: 'cat', label: 'Category', risk: 'descriptive',
    type: 'choice',
    coerce: (raw) => canonicalExpenseCategory(str(raw), ''),
    validate: (v, _rec, _raw, ctx) => {
      if (!v) return 'a category is required';
      const known = ctx && ctx.expenseCategories;
      if (Array.isArray(known) && known.length && !known.includes(v)) {
        return `"${v}" is not one of this app's categories`;
      }
      return null;
    },
    format: (v) => str(v) || '—',
  },
  'businessExpense.trip': { target: 'businessExpense', key: 'trip', label: 'Trip or event', risk: 'descriptive', ...text({ max: 200 }) },
  'businessExpense.date': { target: 'businessExpense', key: 'date', label: 'Date', risk: 'descriptive', ...isoDate() },
  'businessExpense.amount': { target: 'businessExpense', key: 'amount', label: 'Amount', risk: 'money', ...number({ min: 0 }) },
  'businessExpense.currency': { target: 'businessExpense', key: 'currency', label: 'Currency', risk: 'money', ...currencyCode() },
  'businessExpense.reference': { target: 'businessExpense', key: 'ref', label: 'Reference', risk: 'descriptive', ...text({ max: 200 }) },

  'bookExpense.description': { target: 'bookExpense', key: 'desc', label: 'Description', risk: 'descriptive', ...text({ max: 400 }) },
  'bookExpense.category': {
    target: 'bookExpense', key: 'cat', label: 'Category', risk: 'descriptive',
    type: 'choice',
    coerce: (raw) => canonicalExpenseCategory(str(raw), ''),
    validate: (v, _rec, _raw, ctx) => {
      if (!v) return 'a category is required';
      const known = ctx && ctx.expenseCategories;
      if (Array.isArray(known) && known.length && !known.includes(v)) {
        return `"${v}" is not one of this app's categories`;
      }
      return null;
    },
    format: (v) => str(v) || '—',
  },
  'bookExpense.trip': { target: 'bookExpense', key: 'trip', label: 'Trip or event', risk: 'descriptive', ...text({ max: 200 }) },
  'bookExpense.date': { target: 'bookExpense', key: 'date', label: 'Date', risk: 'descriptive', ...isoDate() },
  'bookExpense.amount': { target: 'bookExpense', key: 'amount', label: 'Amount', risk: 'money', ...number({ min: 0 }) },
  'bookExpense.currency': { target: 'bookExpense', key: 'currency', label: 'Currency', risk: 'money', ...currencyCode() },
  'bookExpense.reference': { target: 'bookExpense', key: 'ref', label: 'Reference', risk: 'descriptive', ...text({ max: 200 }) },
  'bookExpense.reimbursed': { target: 'bookExpense', key: 'received', label: 'Paid back', risk: 'money', ...boolean() },

  // ── Consignment shops ────────────────────────────────────────────────────
  'store.name': { target: 'store', key: 'name', label: 'Shop name', risk: 'descriptive', ...text({ required: true, max: 200 }) },
  'store.contact': { target: 'store', key: 'contact', label: 'Contact', risk: 'descriptive', ...text({ max: 200 }) },
  'store.email': { target: 'store', key: 'email', label: 'Email', risk: 'descriptive', ...text({ max: 200 }) },
  'store.phone': { target: 'store', key: 'phone', label: 'Phone', risk: 'descriptive', ...text({ max: 60 }) },
  'store.address': { target: 'store', key: 'address', label: 'Address', risk: 'descriptive', ...text({ max: 300 }) },
  'store.city': { target: 'store', key: 'city', label: 'City', risk: 'descriptive', ...text({ max: 120 }) },
  'store.region': { target: 'store', key: 'region', label: 'Province or state', risk: 'descriptive', ...text({ max: 120 }) },
  'store.postal': { target: 'store', key: 'postal', label: 'Postcode', risk: 'descriptive', ...text({ max: 40 }) },
  'store.country': { target: 'store', key: 'country', label: 'Country', risk: 'descriptive', ...text({ max: 120 }) },
  'store.website': { target: 'store', key: 'website', label: 'Website', risk: 'descriptive', ...text({ max: 300 }) },
  'store.terms': { target: 'store', key: 'terms', label: 'Terms', risk: 'descriptive', ...text({ max: 400 }) },
  'store.notes': { target: 'store', key: 'notes', label: 'Notes', risk: 'descriptive', ...text({ max: 800 }) },
  'store.commissionPct': { target: 'store', key: 'rate', label: 'Shop commission %', risk: 'money', ...number({ min: 0, max: 100 }) },

  // ── Trip budgets ─────────────────────────────────────────────────────────
  'tripBudget.amount': { target: 'tripBudget', key: null, label: 'Budget', risk: 'money', ...number({ min: 0 }) },
};

export const WRITABLE_FIELD_NAMES = Object.keys(WRITABLE_FIELDS);

/** The fields available on one record family, for a prompt or an error. */
export function fieldsForTarget(target) {
  return WRITABLE_FIELD_NAMES
    .filter(n => WRITABLE_FIELDS[n].target === target)
    .map(n => n.slice(target.length + 1));
}

/**
 * Resolve a field the model named.
 *
 * Accepts both "book.isbn" and a bare "isbn" alongside a target, because a
 * model that has just read `isbn` off a catalogue answer will reach for the
 * bare name about half the time and there is nothing gained by refusing it.
 */
export function lookupField(target, field) {
  const bare = str(field).replace(/^.*\./, '');
  return WRITABLE_FIELDS[`${str(target)}.${bare}`] || null;
}

/**
 * Turn one requested change into a stored value, or say why it cannot be.
 *
 * @returns {{ok:true, value:*, spec:object} | {ok:false, error:string}}
 */
export function prepareFieldValue(target, field, rawValue, ctx = {}) {
  const spec = lookupField(target, field);
  if (!spec) {
    const known = fieldsForTarget(target);
    return {
      ok: false,
      error: known.length
        ? `"${str(field)}" is not something that can be changed on a ${WRITE_TARGETS[target]?.label.toLowerCase() || target}. Available: ${known.join(', ')}.`
        : `"${str(target)}" is not a kind of record this app can change.`,
    };
  }
  const value = spec.coerce(rawValue);
  const why = spec.validate(value, null, rawValue, ctx);
  if (why) return { ok: false, error: `${spec.label} could not be set to "${str(rawValue)}" — ${why}.` };
  return { ok: true, value, spec };
}
