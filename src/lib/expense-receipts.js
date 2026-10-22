// The receipts already on a logged expense: naming them, removing one, and an
// artist's request to add more.
//
// An artist cannot write the publisher's ledger, so a receipt they forgot is
// sent the same way as a new expense — through the approval queue — carrying
// `addReceiptsTo` with the id of the expense it belongs to. Approving it adds
// the files to that expense instead of logging a second one. Reusing the
// expense queue means nothing new is needed in the cloud's rules, and an older
// copy of the app that doesn't know the marker still shows it for approval.

import { receiptRefsOf, writeReceiptRefs, isOurCloudReceipt } from './receipt-storage.js';

/** True for a queued request to add receipts to an existing expense. */
export function isReceiptAddition(raw) {
  return !!raw && raw.addReceiptsTo != null && raw.addReceiptsTo !== '';
}

/**
 * The queue entry an artist sends to add `refs` to `expense`. Amount is zero
 * so no total that happens to read the queue can count the expense twice.
 */
export function receiptAdditionPayload(expense, refs, now = new Date()) {
  const clean = (refs || []).filter(r => typeof r === 'string' && r);
  const out = {
    id: now.getTime(),
    addReceiptsTo: expense.id,
    desc: `Receipts for: ${expense.desc || 'an expense'}`,
    targetDesc: expense.desc || '',
    cat: expense.cat || '',
    date: expense.date || '',
    amount: 0,
    currency: expense.currency || '',
    ref: '',
  };
  writeReceiptRefs(out, clean);
  return out;
}

/**
 * Approve an addition: put its receipts on the expense it names. Files already
 * on the expense are not added twice. `subRef` is recorded on the expense so a
 * second approval of the same entry can be recognised and refused.
 *
 * Returns { ok: true, expense, added } or { ok: false, reason } where reason is
 * 'missing' (the expense is gone) or 'empty' (nothing to add).
 */
export function applyReceiptAddition(expenses, raw, subRef) {
  const target = (expenses || []).find(e => e && String(e.id) === String(raw?.addReceiptsTo));
  if (!target) return { ok: false, reason: 'missing' };
  const incoming = receiptRefsOf(raw);
  if (!incoming.length) return { ok: false, reason: 'empty' };
  const existing = receiptRefsOf(target);
  const fresh = incoming.filter(r => !existing.includes(r));
  writeReceiptRefs(target, [...existing, ...fresh]);
  if (fresh.some(isOurCloudReceipt) && !target.receiptCloudAt) target.receiptCloudAt = new Date().toISOString();
  if (subRef) target.receiptSubmissions = [...(Array.isArray(target.receiptSubmissions) ? target.receiptSubmissions : []), subRef];
  return { ok: true, expense: target, added: fresh.length };
}

/** Whether this queue entry has already been folded into an expense. */
export function receiptAdditionApplied(expenses, subRef) {
  return (expenses || []).some(e => Array.isArray(e?.receiptSubmissions) && e.receiptSubmissions.includes(subRef));
}

/**
 * Take one receipt off an expense. Only the link is removed: the file stays in
 * the folder or the cloud, so a mistaken removal can be undone by attaching
 * it again. Returns false when the receipt was not on the expense.
 */
export function removeExpenseReceipt(expense, ref) {
  const refs = receiptRefsOf(expense);
  if (!refs.includes(ref)) return false;
  writeReceiptRefs(expense, refs.filter(r => r !== ref));
  if (!receiptRefsOf(expense).some(isOurCloudReceipt)) delete expense.receiptCloudAt;
  return true;
}

/**
 * A readable name for a receipt: the file name, without the folder, the cloud
 * path's encoding, or the upload timestamp the cloud puts in front of it.
 */
export function receiptRefName(ref) {
  const s = String(ref || '');
  if (!s) return '';
  let tail;
  if (s.startsWith('local://')) {
    tail = s.slice('local://'.length);
  } else if (/^blob:/i.test(s)) {
    return 'Receipt';
  } else {
    let path = s;
    try { path = new URL(s).pathname; } catch (_) { /* not a URL: use as is */ }
    // Firebase keeps the whole storage path, encoded, after /o/.
    const o = path.indexOf('/o/');
    tail = o >= 0 ? path.slice(o + 3) : path;
    try { tail = decodeURIComponent(tail); } catch (_) { /* keep encoded */ }
  }
  const base = tail.split('/').filter(Boolean).pop() || '';
  return base.replace(/^\d{10,}_/, '') || 'Receipt';
}

/** Whether a receipt is a picture (worth a thumbnail) rather than a PDF. */
export function receiptLooksLikeImage(ref, type = '') {
  if (type) return /^image\//i.test(type);
  return /\.(jpe?g|png|gif|webp|heic|heif|avif|bmp)$/i.test(receiptRefName(ref));
}
