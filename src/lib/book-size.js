// How close a book is to the size the cloud will store in one record.
//
// In Firestore mode a book is saved as one document per part (see
// splitState in merge-state.js), and each document is capped at 1 MiB. The
// sales history is the part that grows: a website order with its shipping
// details is about 600 bytes, a register sale about 220. Past the cap the
// whole save batch is refused, so the book stops saving everywhere, at the
// register too. In Realtime Database mode the whole book is one string,
// capped at 10 MB.
//
// bookSizeReport() says how full the fullest record is, so saveState can
// warn well before a book gets there and say plainly why a save can't go out
// once it does.
import { splitState } from './merge-state.js';

export const FIRESTORE_DOC_LIMIT = 1024 * 1024;
// Room for the document's own name, its `ts` field and Firestore's per-field
// overhead on top of the JSON string itself.
export const FIRESTORE_PART_LIMIT = FIRESTORE_DOC_LIMIT - 16 * 1024;
export const RTDB_STRING_LIMIT = 10 * 1024 * 1024;
export const WARN_SHARE = 0.7;

const utf8 = new TextEncoder();
const bytesOf = (text) => utf8.encode(text).length;

/** Bytes each stored part of `state` takes as the JSON string it's saved as. */
export function partSizes(state) {
  const parts = splitState(state);
  const out = {};
  for (const [name, value] of Object.entries(parts)) out[name] = bytesOf(JSON.stringify(value));
  return out;
}

/**
 * { level: 'ok' | 'warn' | 'over', part, bytes, limit, share } for the
 * fullest record. `json` is the state already stringified, when the caller
 * has it: a book that can't be near any limit is answered from its length
 * alone, without splitting it again.
 */
export function bookSizeReport(state, { firestore = true, json = null } = {}) {
  const limit = firestore ? FIRESTORE_PART_LIMIT : RTDB_STRING_LIMIT;
  const whole = json ?? JSON.stringify(state);
  // A UTF-8 byte count is at most three per UTF-16 code unit.
  if (whole.length * 3 < limit * WARN_SHARE) return { level: 'ok', part: null, bytes: 0, limit, share: 0 };
  let part = 'book';
  let bytes;
  if (firestore) {
    const sizes = partSizes(state);
    part = Object.keys(sizes).reduce((a, b) => (sizes[b] > sizes[a] ? b : a));
    bytes = sizes[part];
  } else {
    bytes = bytesOf(whole);
  }
  const share = bytes / limit;
  const level = share >= 1 ? 'over' : share >= WARN_SHARE ? 'warn' : 'ok';
  return { level, part, bytes, limit, share };
}

const PART_LABELS = {
  hist: 'sales history', ledger: 'consignment ledger', expenses: 'expenses', stores: 'store list',
  artistTransfers: 'artist transfers', artistPayouts: 'artist payouts', artistReceivables: 'artist receivables',
  doneIds: 'applied-order list', metadata: 'book settings', book: 'book record',
};

/** What to tell the owner about a 'warn' or 'over' report, or '' for 'ok'. */
export function bookSizeMessage(report, title) {
  if (!report || report.level === 'ok') return '';
  const what = PART_LABELS[report.part] || 'records';
  if (report.level === 'over') {
    return `⚠ The ${what} for ${title} is too big for one cloud record, so it can't save. Your changes are kept on this device. Older years need archiving.`;
  }
  return `⚠ The ${what} for ${title} is ${Math.round(report.share * 100)}% of what one cloud record holds. Older years need archiving before it fills.`;
}
