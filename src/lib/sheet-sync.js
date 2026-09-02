/**
 * sheet-sync.js — how a Google Sheets write describes itself, and what order
 * the rows belong in.
 *
 * Two separate things used to go wrong here, and both were invisible until you
 * looked at the sheet itself.
 *
 * 1. Every write that was not a website order was announced as a
 *    *consignment*. The sync log built its badge with a single ternary —
 *    `type === 'order' ? 'Order' : 'Consignment'` — so a customer-paid postage
 *    row (`type: 'shipping'`), which carries no store, no event and no
 *    quantity, was filed under a store partner and summarised as
 *    "undefined · undefined · ×". A real sale and a consignment movement are
 *    different events against different money, and the log has to say which
 *    one it just wrote.
 *
 * 2. The sheet is appended to in the order writes happen to arrive, which is
 *    not the order the sales happened in. A backdated fair sale entered on
 *    Tuesday lands underneath Monday's website orders, and the restore path
 *    (`restoreBookDataFromSheets`) explicitly assumes the opposite — its own
 *    comment reads "they are in chronological order".
 *
 * Everything here is pure: it reads a sync payload and returns strings or an
 * ordering. It never touches the DOM, the queue, or the network, so the wording
 * the publisher reads and the order the rows land in are both testable without
 * a browser or a spreadsheet.
 */

/**
 * The kinds of row this app writes to the sheet.
 *
 * `ORDER` and `SHIPPING` are two halves of the same website sale — the book,
 * and the postage the customer paid on top of it — but they are separate rows
 * with separate money, so they are separate kinds. `CONSIGNMENT` is stock
 * moving to, selling at, or coming back from a store partner. `CONTROL` and
 * `BATCH` are envelopes rather than records: a sheet-clearing instruction, and
 * a bundle of many rows delivered in one call.
 */
export const SHEET_ROW_KINDS = Object.freeze({
  ORDER: 'order',
  SHIPPING: 'shipping',
  CONSIGNMENT: 'consignment',
  CONTROL: 'control',
  BATCH: 'batch',
});

/** Badge text per kind — the shop owner's word for what was written. */
const KIND_LABELS = Object.freeze({
  [SHEET_ROW_KINDS.ORDER]: 'Order',
  [SHEET_ROW_KINDS.SHIPPING]: 'Shipping',
  [SHEET_ROW_KINDS.CONSIGNMENT]: 'Consignment',
  [SHEET_ROW_KINDS.CONTROL]: 'Rebuild',
  [SHEET_ROW_KINDS.BATCH]: 'Batch',
});

/** Trim to a printable string, or '' for null/undefined/blank. */
function text(value) {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

/**
 * First non-blank of the candidates, or the fallback. Used so a summary never
 * renders the literal word "undefined" when a payload legitimately omits a
 * field — a shipping row has no store, a rebuild has no quantity.
 */
function firstText(candidates, fallback = '') {
  for (const candidate of candidates) {
    const value = text(candidate);
    if (value) return value;
  }
  return fallback;
}

/**
 * Which kind of row a sync payload is.
 *
 * The action is checked first because `reset`/`rebuild`/`batch` are envelopes
 * that may carry no `type` at all. Otherwise the payload's own `type` decides,
 * and anything unrecognised falls back to an order rather than a consignment:
 * an unknown row is far more likely to be a direct sale than stock sitting at
 * a store, and mislabelling a sale as consigned is the error that actually
 * misleads (it implies a store owes money that nobody owes).
 */
export function sheetRowKind(payload) {
  if (!payload || typeof payload !== 'object') return SHEET_ROW_KINDS.ORDER;

  const action = text(payload.action).toLowerCase();
  if (action === 'reset' || action === 'rebuild') return SHEET_ROW_KINDS.CONTROL;
  if (action === 'batch') return SHEET_ROW_KINDS.BATCH;

  const type = text(payload.type).toLowerCase();
  if (type === 'shipping') return SHEET_ROW_KINDS.SHIPPING;
  if (type === 'consignment') return SHEET_ROW_KINDS.CONSIGNMENT;
  if (type === 'control') return SHEET_ROW_KINDS.CONTROL;
  if (type === 'batch') return SHEET_ROW_KINDS.BATCH;
  return SHEET_ROW_KINDS.ORDER;
}

/** The badge shown beside a sync-log line. */
export function sheetLogLabel(payload) {
  return KIND_LABELS[sheetRowKind(payload)] || KIND_LABELS[SHEET_ROW_KINDS.ORDER];
}

/**
 * One line describing what this write did, in the terms of the kind of record
 * it is. Removal is spelled out rather than implied, because a delete and an
 * add otherwise read identically in the log.
 */
export function sheetLogSummary(payload) {
  if (!payload || typeof payload !== 'object') return 'Sheet write';

  const kind = sheetRowKind(payload);
  if (kind === SHEET_ROW_KINDS.CONTROL) return 'Clear sheet for rebuild';
  if (kind === SHEET_ROW_KINDS.BATCH) {
    const rows = Array.isArray(payload.rows) ? payload.rows.length : 0;
    return `Bulk sync · ${rows} record${rows === 1 ? '' : 's'}`;
  }

  const action = text(payload.action).toLowerCase();
  const isRemoval = action === 'delete' || action === 'void';

  if (kind === SHEET_ROW_KINDS.CONSIGNMENT) {
    const store = firstText([payload.store, payload.storeName], 'Store');
    if (isRemoval) return `${store} · remove row`;
    const event = firstText([payload.event, payload.type], 'Movement');
    const qty = firstText([payload.qty], '0');
    return `${store} · ${event} · ${qty}×`;
  }

  if (kind === SHEET_ROW_KINDS.SHIPPING) {
    const num = firstText([payload.num], 'order');
    if (isRemoval) return `${num} · remove postage row`;
    // Postage has no unit price and no quantity — the only number that means
    // anything on this row is what the customer actually paid.
    const paid = firstText([payload.total, payload.paymentAmount, payload.amountDue]);
    return paid ? `${num} · postage paid ${paid}` : `${num} · postage`;
  }

  const num = firstText([payload.num], 'order');
  if (isRemoval) return `${num} · remove row`;
  const chan = firstText([payload.chan, payload.channel], 'Direct');
  const qty = firstText([payload.qty], '0');
  return `${num} · ${chan} · ${qty}×`;
}

/**
 * Sortable form of a sheet date. The app writes plain `YYYY-MM-DD` strings,
 * which already sort correctly as text, but a payload restored from an older
 * backup can carry a Date or a full ISO timestamp. Anything unparseable sorts
 * last rather than first, so a row with a broken date never silently displaces
 * real history at the top of the sheet.
 */
export function sheetRowSortKey(payload) {
  const raw = payload && payload.date;
  if (raw instanceof Date && !Number.isNaN(raw.getTime())) {
    return raw.toISOString().slice(0, 10);
  }
  const value = text(raw);
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) return `${match[1]}-${match[2]}-${match[3]}`;
  const parsed = new Date(value);
  if (value && !Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
  return '9999-12-31';
}

/**
 * Chronological order for sheet payloads, oldest first — the order a person
 * reading the sheet top to bottom expects, and the order the restore path
 * already assumes it is given.
 *
 * Deletions sort ahead of additions on the same date so that a re-sync which
 * replaces a row never appends the new copy and then deletes it again.
 */
export function compareSheetPayloads(a, b) {
  const keyA = sheetRowSortKey(a);
  const keyB = sheetRowSortKey(b);
  if (keyA !== keyB) return keyA < keyB ? -1 : 1;

  const removalA = /^(delete|void)$/i.test(text(a && a.action)) ? 0 : 1;
  const removalB = /^(delete|void)$/i.test(text(b && b.action)) ? 0 : 1;
  if (removalA !== removalB) return removalA - removalB;
  return 0;
}

/**
 * Copy of `rows` in chronological order. Stable, so two rows sharing a date
 * keep the order they were recorded in — a book sale and the postage charged
 * on it stay adjacent instead of drifting apart.
 */
export function sortSheetPayloads(rows) {
  if (!Array.isArray(rows)) return [];
  return rows
    .map((row, index) => ({ row, index }))
    .sort((a, b) => compareSheetPayloads(a.row, b.row) || (a.index - b.index))
    .map(entry => entry.row);
}
