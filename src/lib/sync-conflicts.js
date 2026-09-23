// Edits made on two devices at once — keeping the version the merge set aside.
//
// Why this exists: when a device saves a book and the cloud copy moved on since
// it last looked, _fbSave three-way merges each part (src/lib/merge-state.js).
// If the SAME record was changed on both sides, this device's version wins and
// the other device's version is reported in `conflicts` — and until now that
// report went to a 7-second toast and the console, then was gone for good. A
// sale corrected on the laptop could be silently undone by the shop desktop,
// with nothing left anywhere to bring it back from.
//
// This module keeps a small, device-local record of each conflict (both
// versions), decides which conflicts a person actually needs to see, and
// describes a record in plain words. It also locates and restores a record in
// a book's state. It is pure: storage, dates and the state object are passed
// in, so the rules below can be unit-tested without a browser or Firebase.

import { stableStringify, keyRows, DERIVED_METADATA_KEYS, COUNTER_METADATA_KEYS } from './merge-state.js';
import { fmt, fmtD } from './money.js';
import { escapeHtml } from './html.js';

export const SYNC_CONFLICTS_KEY = 'lyrical_sync_conflicts_v1';

// Newest-first cap. Each entry holds two copies of one record, so 50 is a few
// dozen KB at most — small enough that it can never crowd out the offline save
// queue in localStorage, large enough to cover a long offline stretch.
export const MAX_SYNC_CONFLICTS = 50;

// ── WHAT COUNTS AS A REAL CONFLICT ──────────────────────────────────────────
//
// The merge compares whole rows, including fields the app recomputes from the
// rows themselves after every merge (recomputeAfters() in main.js, which
// window._normalizeMergedState runs on the merged state before it is saved).
// A difference confined to those fields is not an edit anybody made — it is
// the two devices having done the arithmetic over different sets of rows, and
// the recompute has already overwritten both versions with the right answer.
// Showing it would ask the owner to choose between two numbers the app is
// about to replace anyway.
//
// Per part, the recomputed fields are:
//   hist    `after` — the running stock balance, rewritten for every row by
//           buildOrderTimeline(). `consignmentLink` — re-derived from `chan`
//           by deduplicateDirectConsignmentSales().
//   ledger  `invoiceNum` — copied from the linked invoice by
//           reconcileConsignmentMirrors() (the invoice is the real record).
//   stores  `sent` / `sold` / `returned` / `outstanding` — rebuilt from the
//           consignment ledger by reconcileStores(). `amountOwed` is NOT on
//           this list: payments are settled by hand, not from ledger rows.
//
// A History row that mirrors a consignment sale (`consignmentLink`, or
// channel "Consignment") is a copy of its ledger row: syncHistMirrorFromLedger()
// rewrites its copies, price, date, cancelled flag and sheet link, and
// reconcileConsignmentMirrors() its invoice link, from the ledger on every
// recompute. Those are derived for mirrors only — on an ordinary sale they are
// the record. If the ledger row itself was edited on both devices, that shows
// up as its own ledger conflict, which is the one to act on.
//
// Metadata: `stock`, `sold`, `revenue`, `chStats` are totals recomputed from
// the rows (merge-state's DERIVED_METADATA_KEYS), and `invoiceSeq` is a counter
// the merge resolves by taking the highest (COUNTER_METADATA_KEYS). The merge
// never reports these today; they are filtered here as well so a future change
// to the merge can't start surfacing them.
export const DERIVED_ROW_FIELDS = {
  hist: ['after', 'consignmentLink'],
  ledger: ['invoiceNum'],
  stores: ['sent', 'sold', 'returned', 'outstanding'],
};
export const HIST_MIRROR_DERIVED_FIELDS = ['qty', 'price', 'date', 'voided', 'sheetsId', 'invoiceId', 'invoiceNum'];

// Identity fields: equal on both sides by construction (they are how the merge
// matched the two versions up), so they are never worth a row in the compare.
const IDENTITY_FIELDS = ['id', 'uid'];

const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

const isHistMirror = (row) => isPlainObject(row) && (row.consignmentLink === true || row.chan === 'Consignment');

/** Splits a conflict's part into where it lives: a top-level list, a list inside metadata, or one metadata value. */
export function conflictLocation(conflict) {
  const part = String(conflict && conflict.part || '');
  const key = conflict ? conflict.key : undefined;
  if (part.startsWith('metadata.')) {
    const field = part.slice('metadata.'.length);
    // mergeMetadata reports a whole-value conflict with key === the field name,
    // and a row inside an id-keyed metadata list with the row's `id:` key.
    if (key === field) return { kind: 'value', field };
    return { kind: 'row', list: field, inMetadata: true };
  }
  return { kind: 'row', list: part, inMetadata: false };
}

/** Fields of this record that are recomputed rather than entered (see above). */
export function derivedFieldsFor(part, a, b) {
  const set = new Set(IDENTITY_FIELDS);
  (DERIVED_ROW_FIELDS[part] || []).forEach(f => set.add(f));
  if (part === 'hist' && (isHistMirror(a) || isHistMirror(b))) {
    HIST_MIRROR_DERIVED_FIELDS.forEach(f => set.add(f));
  }
  return set;
}

/**
 * The fields a person would see as different between two versions of a record,
 * leaving out anything the app recomputes. Nested plain objects (a sale's
 * `payment` details) are compared one level down, as `payment.method` etc, so
 * the screen can point at the one sub-field that changed.
 */
export function changedFields(part, a, b) {
  if (!isPlainObject(a) || !isPlainObject(b)) {
    return stableStringify(a) === stableStringify(b) ? [] : ['value'];
  }
  const fa = flattenRecord(part, a, b);
  const fb = flattenRecord(part, b, a);
  const keys = new Set([...fa.keys(), ...fb.keys()]);
  const out = [];
  for (const k of keys) {
    if (stableStringify(fa.get(k)) !== stableStringify(fb.get(k))) out.push(k);
  }
  return sortFields(out);
}

// One level of flattening, derived fields removed, missing/empty values kept
// as undefined so "blank on one side" still compares as a difference.
function flattenRecord(part, row, other) {
  const skip = derivedFieldsFor(part, row, other);
  const out = new Map();
  for (const [k, v] of Object.entries(row)) {
    if (skip.has(k)) continue;
    if (isPlainObject(v) && Object.keys(v).length) {
      for (const [k2, v2] of Object.entries(v)) out.set(`${k}.${k2}`, normalizeEmpty(v2));
    } else {
      out.set(k, normalizeEmpty(v));
    }
  }
  return out;
}

// '' / null / undefined all read as "blank" to a person; a record that went
// from notes: '' to no notes field at all has not been edited.
const normalizeEmpty = (v) => (v === '' || v === null || v === undefined ? undefined : v);

// Fields a person recognises a record by go first, the rest alphabetically.
const FIELD_ORDER = ['date', 'type', 'storeName', 'name', 'desc', 'num', 'chan', 'qty', 'price', 'amount', 'amountDue', 'total', 'paid', 'status', 'voided', 'notes'];
function sortFields(fields) {
  const rank = (f) => { const i = FIELD_ORDER.indexOf(f.split('.')[0]); return i === -1 ? FIELD_ORDER.length : i; };
  return [...fields].sort((x, y) => rank(x) - rank(y) || x.localeCompare(y));
}

/** Every visible field of a record pair, differing ones first — what the compare table lists. */
export function comparedFields(part, a, b) {
  if (!isPlainObject(a) || !isPlainObject(b)) return ['value'];
  const keys = new Set([...flattenRecord(part, a, b).keys(), ...flattenRecord(part, b, a).keys()]);
  const diff = new Set(changedFields(part, a, b));
  const rest = sortFields([...keys].filter(k => !diff.has(k)));
  return [...sortFields([...diff]), ...rest];
}

/** Reads one (possibly flattened, `payment.method`) field off a record. */
export function fieldValue(record, field) {
  if (field === 'value') return record;
  if (!isPlainObject(record)) return undefined;
  const dot = field.indexOf('.');
  if (dot === -1) return record[field];
  const parent = record[field.slice(0, dot)];
  return isPlainObject(parent) ? parent[field.slice(dot + 1)] : undefined;
}

/**
 * Whether a conflict is worth putting in front of a person — false when the
 * two versions differ only in values the app recomputes (see the list above).
 */
export function isMeaningfulConflict(conflict) {
  if (!conflict || typeof conflict !== 'object') return false;
  const loc = conflictLocation(conflict);
  if (loc.kind === 'value') {
    if (DERIVED_METADATA_KEYS.has(loc.field) || COUNTER_METADATA_KEYS.has(loc.field)) return false;
    return stableStringify(conflict.local) !== stableStringify(conflict.remote);
  }
  return changedFields(loc.list, conflict.local, conflict.remote).length > 0;
}

// ── DURABLE RECORD ──────────────────────────────────────────────────────────
// Storage is anything with getItem/setItem (localStorage in the app, a Map
// shim in tests). Every access is guarded: a private window, a full quota or a
// blocked storage must never stop a save from completing — losing this record
// is bad, but breaking the save that produced it would be far worse.

/** All stored conflicts, newest first. Never throws; bad data reads as none. */
export function listConflicts(storage) {
  try {
    const raw = storage && storage.getItem(SYNC_CONFLICTS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    const entries = Array.isArray(parsed) ? parsed : (parsed && Array.isArray(parsed.entries) ? parsed.entries : []);
    return entries.filter(e => e && typeof e === 'object' && e.id && e.bookId);
  } catch {
    return [];
  }
}

/**
 * Writes the list, newest first, capped. If the browser refuses (quota), the
 * oldest half is dropped and it tries again rather than losing the newest.
 * Returns the list actually stored ([] if nothing could be).
 */
export function writeConflicts(storage, entries, max = MAX_SYNC_CONFLICTS) {
  let list = (entries || []).slice(0, Math.max(0, max));
  while (true) {
    try {
      if (!storage) return list;
      storage.setItem(SYNC_CONFLICTS_KEY, JSON.stringify({ v: 1, entries: list }));
      return list;
    } catch {
      if (list.length <= 1) return [];
      list = list.slice(0, Math.floor(list.length / 2));
    }
  }
}

// JSON round-trip: the conflict's versions are live rows in the merged state,
// which later edits (and the post-merge recompute) mutate in place. The record
// has to be a snapshot, not a reference.
const snapshot = (v) => (v === undefined ? null : JSON.parse(JSON.stringify(v)));

const sameConflict = (e, bookId, c) =>
  e.bookId === bookId && e.part === c.part && e.key === c.key &&
  stableStringify(e.other) === stableStringify(snapshot(c.remote));

/**
 * Records the meaningful conflicts from one merge. Skips derived-only ones; an
 * identical conflict already on file (same record, same set-aside version —
 * a retried save reporting it twice) is refreshed rather than duplicated.
 *
 * @returns {{ added: object[], entries: object[] }} what was recorded, and the full stored list
 */
export function recordConflicts(storage, { bookId, bookTitle = '', cur = '', conflicts = [], now = Date.now() } = {}) {
  const meaningful = (Array.isArray(conflicts) ? conflicts : []).filter(isMeaningfulConflict);
  if (!bookId || !meaningful.length) return { added: [], entries: listConflicts(storage) };
  let entries = listConflicts(storage);
  const added = [];
  meaningful.forEach((c, i) => {
    entries = entries.filter(e => !sameConflict(e, bookId, c));
    const entry = {
      id: `${now.toString(36)}-${i}-${Math.random().toString(36).slice(2, 8)}`,
      bookId: String(bookId),
      bookTitle: String(bookTitle || ''),
      cur: cur || '',
      at: now,
      part: c.part,
      key: c.key,
      kept: snapshot(c.local),
      other: snapshot(c.remote),
    };
    added.push(entry);
  });
  // Newest first: this batch (in report order) ahead of everything older.
  entries = writeConflicts(storage, [...added, ...entries]);
  return { added, entries };
}

/** Removes one entry by id. Returns the remaining list. */
export function dismissConflict(storage, id) {
  const entries = listConflicts(storage);
  const rest = entries.filter(e => e.id !== id);
  if (rest.length === entries.length) return entries;
  return writeConflicts(storage, rest);
}

// ── LOCATE / RESTORE ────────────────────────────────────────────────────────

function listFor(state, loc) {
  if (!state) return null;
  const arr = state[loc.list];
  return Array.isArray(arr) ? arr : null;
}

const sameMeaning = (part, a, b) => changedFields(part, a, b).length === 0;

/**
 * Finds the record a conflict is about in a book's current state and says how
 * it compares with the version that was kept at merge time.
 *
 * status:
 *   'unchanged'  still exactly the kept version — safe to swap
 *   'restored'   already matches the other device's version — nothing to do
 *   'changed'    edited again since the merge
 *   'missing'    no longer in the book (deleted since)
 */
export function locateConflictTarget(state, entry) {
  const loc = conflictLocation(entry);
  if (loc.kind === 'value') {
    const has = !!state && Object.prototype.hasOwnProperty.call(state, loc.field);
    const cur = has ? state[loc.field] : undefined;
    const status = !has ? 'missing'
      : stableStringify(cur) === stableStringify(entry.other) ? 'restored'
      : stableStringify(cur) === stableStringify(entry.kept) ? 'unchanged' : 'changed';
    return { status, loc, index: -1, current: cur };
  }

  const rows = listFor(state, loc) || [];
  const part = loc.list;
  const key = String(entry.key || '');
  let candidates;
  if (key.startsWith('id:')) {
    const id = key.slice(3);
    candidates = rows.map((r, i) => i).filter(i => rows[i] && rows[i].id != null && String(rows[i].id) === id);
  } else if (key.startsWith('uid:')) {
    const uid = key.slice(4);
    candidates = rows.map((r, i) => i).filter(i => rows[i] && String(rows[i].uid) === uid);
  } else {
    // Content-keyed rows (hist rows without a uid): match on the merge's own
    // key so "the same row" means exactly what it meant to the merge. keyRows
    // suffixes duplicates with #n; any of them is a candidate.
    const keys = keyRows(part, rows);
    candidates = keys.map((k, i) => (k.replace(/#\d+$/, '') === key ? i : -1)).filter(i => i !== -1);
  }
  if (!candidates.length) return { status: 'missing', loc, index: -1, current: undefined };
  const kept = candidates.find(i => sameMeaning(part, rows[i], entry.kept));
  if (kept !== undefined) return { status: 'unchanged', loc, index: kept, current: rows[kept] };
  const restored = candidates.find(i => sameMeaning(part, rows[i], entry.other));
  if (restored !== undefined) return { status: 'restored', loc, index: restored, current: rows[restored] };
  return { status: 'changed', loc, index: candidates[0], current: rows[candidates[0]] };
}

/**
 * Puts the other device's version into `state` in place of whatever is there
 * now (re-adding it if it was deleted). Mutates `state`; the caller recomputes
 * derived totals and saves. Returns true if anything was written.
 */
export function applyConflictRestore(state, entry, target = locateConflictTarget(state, entry)) {
  if (!state || !entry) return false;
  const loc = target.loc;
  const value = snapshot(entry.other);
  if (loc.kind === 'value') {
    state[loc.field] = value;
    return true;
  }
  if (!Array.isArray(state[loc.list])) state[loc.list] = [];
  const rows = state[loc.list];
  if (target.index >= 0 && target.index < rows.length) {
    rows[target.index] = value;
    return true;
  }
  // Deleted since: put it back. History reads newest-first, so a sale goes at
  // its date position (same rule as merge-state's insertRow); lists that are
  // append-ordered get it on the end.
  if (loc.list === 'hist' && value && value.date) {
    const at = rows.findIndex(r => String((r && r.date) || '') < String(value.date));
    if (at === -1) rows.push(value); else rows.splice(at, 0, value);
  } else {
    rows.push(value);
  }
  return true;
}

// ── PLAIN-WORDS DESCRIPTIONS ────────────────────────────────────────────────

const FIELD_LABELS = {
  value: 'Value',
  date: 'Date', type: 'Kind', num: 'Order number', chan: 'Sold through', qty: 'Copies',
  price: 'Price each', notes: 'Notes', voided: 'Cancelled', cur: 'Currency', payment: 'Payment',
  enteredBy: 'Entered by', sheetsId: 'Google Sheet link', gratuity: 'Gifted copy',
  artistPending: 'Waiting on the artist', directToArtist: 'Paid to the artist',
  storeName: 'Store', storeId: 'Store number', rate: "Store's cut (%)", amountDue: 'Amount due',
  paid: 'Payment status', status: 'Status', invoiceId: 'Invoice link', invoiceNum: 'Invoice number',
  desc: 'Description', cat: 'Category', amount: 'Amount', currency: 'Currency',
  origAmount: 'Original amount', origCurrency: 'Original currency', baseAmount: 'Amount in CAD',
  ref: 'Reference', name: 'Name', contact: 'Contact', email: 'Email', phone: 'Phone',
  address: 'Address', city: 'City', region: 'Province / state', postal: 'Postal code',
  country: 'Country', website: 'Website', terms: 'Terms', amountOwed: 'Amount owed',
  method: 'Method', total: 'Total', edited: 'Edited', editedAt: 'Last edited',
  sourceNum: 'From order', rateCad: 'Exchange rate', fxRate: 'Exchange rate',
  artistPaymentLink: 'Artist payment link', authorStock: 'Copies the author holds',
};

// Top-level amounts recorded in the record's own currency (`cur`/`currency`,
// else the book's). Deliberately not: `origAmount` (in `origCurrency`) or
// anything nested — a sale's `payment.amount` is in `payment.currency`, which
// may be a foreign currency. Those print as plain numbers rather than wearing
// a symbol that would misstate them.
const MONEY_FIELDS = new Set(['price', 'amount', 'amountDue', 'total', 'amountOwed']);
// Customer-paid shipping is always CAD, whatever the book sells in (see the
// ledger-auditor skill) — so it is labelled CAD, never the book's currency.
const CAD_MONEY_FIELDS = new Set(['shippingPaid', 'customerShipping']);
// Nested fields (a sale's `payment`) mean something different from the
// top-level field of the same name — `rate` there is an exchange rate, not a
// store's commission.
const NESTED_LABELS = {
  rate: 'Exchange rate', amount: 'Amount paid', currency: 'Currency paid',
  convertedTotal: 'Converted total', method: 'Method',
};
const DATE_FIELDS = new Set(['date', 'editedAt', 'createdAt', 'updatedAt', 'paidAt', 'dueDate', 'sentAt']);

const humanize = (k) => {
  const words = String(k).replace(/[_-]+/g, ' ').replace(/([a-z0-9])([A-Z])/g, '$1 $2').trim().toLowerCase();
  return words ? words[0].toUpperCase() + words.slice(1) : '';
};

/** Plain label for a (possibly nested) field name. */
export function fieldLabel(field) {
  const parts = String(field).split('.');
  return parts.map((p, i) => (i > 0 && NESTED_LABELS[p]) || FIELD_LABELS[p] || humanize(p)).join(' · ');
}
const nestedLabel = (k) => NESTED_LABELS[k] || FIELD_LABELS[k] || humanize(k);

const clip = (s, n = 160) => (s.length > n ? s.slice(0, n - 1) + '…' : s);

/** A field's value as a person would read it — never "undefined" or "[object Object]". */
export function formatFieldValue(field, value, cur = '') {
  if (value === undefined || value === null || value === '') return '—';
  const path = String(field);
  const nested = path.includes('.');
  const leaf = path.split('.').pop();
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'number' && !nested && CAD_MONEY_FIELDS.has(leaf)) return fmt(value, 'CAD');
  if (typeof value === 'number' && !nested && MONEY_FIELDS.has(leaf)) return fmt(value, cur || '$');
  if (DATE_FIELDS.has(leaf) && (typeof value === 'string' || typeof value === 'number')) {
    const d = fmtD(value);
    return d === '—' ? clip(String(value)) : d;
  }
  if (Array.isArray(value)) {
    if (!value.length) return '—';
    if (value.every(v => v === null || typeof v !== 'object')) return clip(value.join(', '));
    return `${value.length} item${value.length === 1 ? '' : 's'}`;
  }
  if (typeof value === 'object') {
    const bits = Object.entries(value)
      .filter(([, v]) => v !== undefined && v !== null && v !== '')
      .map(([k, v]) => `${nestedLabel(k)}: ${typeof v === 'object' ? '…' : v}`);
    return bits.length ? clip(bits.join(' · ')) : '—';
  }
  return clip(String(value));
}

const plural = (n, one, many = one + 's') => `${n} ${n === 1 ? one : many}`;
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : Number(v));
const on = (date) => { const d = fmtD(date); return d === '—' ? '' : ` on ${d}`; };

/**
 * One line naming the record in plain words, e.g.
 * "Sale on 12 Sep 2026 — 2 × Book title at $20.00".
 */
export function describeRecord(entry) {
  if (!entry) return 'A record';
  const loc = conflictLocation(entry);
  const row = isPlainObject(entry.kept) ? entry.kept : (isPlainObject(entry.other) ? entry.other : null);
  const title = entry.bookTitle || 'this book';
  const cur = (row && (row.cur || row.currency)) || entry.cur || '';
  const money = (v) => (Number.isFinite(num(v)) ? fmt(num(v), cur || '$') : '');

  if (loc.kind === 'value') return `Book setting — ${fieldLabel(loc.field)}`;
  if (!row) return `${fieldLabel(loc.list)} record`;

  switch (loc.list) {
    case 'hist': {
      const qty = num(row.qty) || 0;
      const label = row.gratuity ? 'Gifted copy' : isHistMirror(row) ? 'Consignment sale' : 'Sale';
      const price = row.gratuity ? '' : money(row.price);
      const order = row.num ? ` · order ${row.num}` : '';
      return `${label}${on(row.date)} — ${qty} × ${title}${price ? ` at ${price}` : ''}${order}`;
    }
    case 'ledger': {
      const qty = plural(num(row.qty) || 0, 'copy', 'copies');
      const store = row.storeName || 'a store';
      if (row.type === 'Shipment') return `Sent to ${store}${on(row.date)} — ${qty}`;
      if (row.type === 'Return') return `Returned from ${store}${on(row.date)} — ${qty}`;
      if (row.type === 'Sale') {
        const due = money(row.amountDue);
        return `Sold at ${store}${on(row.date)} — ${qty}${due ? `, ${due} due to you` : ''}`;
      }
      return `${row.type || 'Consignment entry'} · ${store}${on(row.date)}`;
    }
    case 'expenses': {
      const amt = money(row.amount);
      return `Expense${on(row.date)} — ${row.desc || row.cat || 'no description'}${amt ? `, ${amt}` : ''}`;
    }
    case 'stores':
      return `Store details — ${row.name || 'unnamed store'}`;
    case 'artistTransfers': {
      const qty = num(row.qty) || 0;
      const price = money(row.price);
      return `Sale paid straight to the artist${on(row.date)} — ${qty} × ${title}${price ? ` at ${price}` : ''}`;
    }
    case 'artistPayouts': {
      const amt = money(row.amount);
      return `Payment to the artist${on(row.date)}${amt ? ` — ${amt}` : ''}`;
    }
    case 'invoices':
      return `Invoice ${row.num || ''}${on(row.date)}`.replace(/\s+/g, ' ').trim();
    case 'payoutRequests': {
      const amt = money(row.amount);
      return `Artist payout request${on(row.date || row.createdAt)}${amt ? ` — ${amt}` : ''}`;
    }
    case 'stockTransfers':
      return `Stock handed over${on(row.date)} — ${plural(num(row.qty) || 0, 'copy', 'copies')}`;
    default:
      return `${fieldLabel(loc.list)}${on(row.date)}`;
  }
}

/** "22 Sep 2026, 14:05" — when the clash was noticed on this device. */
export function formatConflictWhen(at) {
  const d = new Date(Number(at));
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

// ── REVIEW SCREEN MARKUP ────────────────────────────────────────────────────
// Built here rather than in main.js so the exact words and structure the owner
// sees are testable. Buttons call window.keepSyncConflict / restoreSyncConflict
// (wired in main.js), matching the app's inline-handler convention.

const partOf = (entry) => { const loc = conflictLocation(entry); return loc.kind === 'value' ? '' : loc.list; };

/** The compare table for one entry: every visible detail, the ones that differ first and flagged. */
export function renderCompareTableHtml(entry) {
  const loc = conflictLocation(entry);
  const part = partOf(entry);
  const cur = (isPlainObject(entry.other) && (entry.other.cur || entry.other.currency))
    || (isPlainObject(entry.kept) && (entry.kept.cur || entry.kept.currency)) || entry.cur || '';
  const diff = new Set(changedFields(part, entry.kept, entry.other));
  const fields = comparedFields(part, entry.kept, entry.other);
  const rows = fields.map((f) => {
    const isDiff = diff.has(f);
    const name = loc.kind === 'value' ? loc.field : f;
    const mine = formatFieldValue(name, fieldValue(entry.kept, f), cur);
    const theirs = formatFieldValue(name, fieldValue(entry.other, f), cur);
    return `<tr class="${isDiff ? 'is-diff' : 'is-same'}">`
      + `<th scope="row">${escapeHtml(fieldLabel(name))}${isDiff ? ' <span class="chip-status amber sm sc-diff-chip">Differs</span>' : ''}</th>`
      + `<td data-label="This device">${escapeHtml(mine)}</td>`
      + `<td data-label="Other device">${escapeHtml(theirs)}</td>`
      + '</tr>';
  }).join('');
  return '<div class="sc-compare-wrap"><table class="sc-compare">'
    + '<thead><tr><th scope="col">Detail</th>'
    + '<th scope="col">This device <span class="sc-col-sub">in your records now</span></th>'
    + '<th scope="col">Other device <span class="sc-col-sub">set aside</span></th></tr></thead>'
    + `<tbody>${rows}</tbody></table></div>`;
}

/** One review card. */
export function renderConflictItemHtml(entry) {
  const id = escapeHtml(entry.id);
  const nDiff = changedFields(partOf(entry), entry.kept, entry.other).length;
  return `<article class="sc-item" data-conflict-id="${id}" aria-labelledby="sc-sum-${id}">`
    + '<div class="sc-item-meta">'
    + `<span class="chip-status gray sm sc-book">${escapeHtml(entry.bookTitle || 'A book')}</span>`
    + `<span class="sc-when">Noticed ${escapeHtml(formatConflictWhen(entry.at))}</span>`
    + '</div>'
    + `<h3 class="sc-item-summary" id="sc-sum-${id}">${escapeHtml(describeRecord(entry))}</h3>`
    + '<p class="sc-item-note">This was changed on this device and on another one before they caught up with each other. '
    + `This device's version is the one in your records now${nDiff ? ` — ${plural(nDiff, 'detail differs', 'details differ')}` : ''}.</p>`
    + renderCompareTableHtml(entry)
    + '<div class="sc-actions">'
    + `<button type="button" class="btn sm sys-target" onclick="keepSyncConflict('${id}')">Keep this device's version</button>`
    + `<button type="button" class="btn sm ink sys-target" onclick="restoreSyncConflict('${id}')">Use the other device's version</button>`
    + '</div>'
    + '</article>';
}

/** The whole list, or the all-clear empty state. */
export function renderConflictListHtml(entries) {
  const list = Array.isArray(entries) ? entries : [];
  if (!list.length) {
    return '<div class="empty-state sc-empty">'
      + '<div class="e-icon" aria-hidden="true">✓</div>'
      + '<strong class="sc-empty-title">Nothing to review</strong>'
      + '<p class="sc-empty-sub">Every record your devices changed at the same time has been sorted out. If it happens again, the version that was set aside will wait here for you.</p>'
      + '</div>';
  }
  return `<div class="sc-list">${list.map(renderConflictItemHtml).join('')}</div>`;
}

/** Short status line for the Backups card. */
export function describeConflictCount(n) {
  const count = Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
  if (!count) return 'Nothing needs review.';
  return `${plural(count, 'record')} changed on two devices at once ${count === 1 ? 'needs' : 'need'} a look.`;
}
