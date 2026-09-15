// The other place a background process reads someone else's numbers off a
// document it didn't ask to see: an emailed receipt Gemini could not fully
// price. Same rule as postage-intake.js, and the same reason — an amount is
// either read with confidence or left visibly unknown. Never a guess that
// looks like a real number, and never a row that quietly disappears because
// one field couldn't be read.
//
// The other job this file does is give a receipt scan found automatically, in
// the background, a stable identity. Today's manual import keys a filed
// expense's `ref` on whatever free-text "reference" Gemini happened to read
// off the document — an invoice number, or nothing — so the same receipt
// scanned twice has no certain way to be recognized as the same receipt. A
// background sweep runs unattended and repeatedly, so that uncertainty stops
// being a rare inconvenience and starts being how a receipt gets filed twice.
// A Gmail message id is durable and exists before any parsing happens; this
// keys on that instead.
//
// Pure — no DOM, no network, no storage.

const clean = (value) => String(value ?? '').trim();

/**
 * A receipt row with no trustworthy total. Zero and negative are treated the
 * same as missing: a real receipt essentially never costs exactly $0.00, so a
 * 0 here is almost always a failed read, not a free purchase. Treating it as
 * unknown costs nothing — the rare genuine $0 row gets unchecked and typed in
 * by hand, the same one extra step a wrongly-priced row would have cost her
 * to catch anyway.
 */
export function needsReceiptAmount(row = {}) {
  const amount = Number(row?.amount);
  return !(Number.isFinite(amount) && amount > 0);
}

/**
 * The stable ledger `ref` for a Gmail-sourced draft, replacing
 * `item.reference || 'email-import'` — Gemini's free-text guess at an invoice
 * number, falling back to a literal every unreferenced receipt shares.
 *
 * One email can hold more than one receipt (an order confirmation listing
 * several charges, a forwarded digest), so `totalForMsg` — how many rows THIS
 * email produced — decides the shape: a single-receipt email keeps the plain
 * `receipt-email:<id>` form, and only a genuinely multi-receipt email pays for
 * the `:<index>` disambiguator, so the common case stays readable.
 *
 * A pasted or uploaded draft has no message id and therefore no durable
 * identity to key on — there is no document this app can later ask "have I
 * seen you before?" the way a Gmail message id lets it. Rather than invent one,
 * this keeps today's actual fallback: whatever `reference` Gemini or the
 * owner typed, blank or not.
 */
export function receiptDraftRef({ msgId, rowIndex, reference } = {}, { totalForMsg = 1 } = {}) {
  const id = clean(msgId);
  if (!id) return clean(reference);
  return totalForMsg > 1 ? `receipt-email:${id}:${Number(rowIndex) || 0}` : `receipt-email:${id}`;
}

/** A drafted-but-unreviewed row whose amount needs the owner's attention. */
export function needsReceiptReview(draft = {}) {
  return !!draft?.amountUnknown && String(draft?.ref || '').startsWith('receipt-email:');
}

/**
 * Fold freshly-found drafts into what is already on screen without disturbing
 * it. `existing` always wins on a key collision — a row already in the table
 * may carry an hour of the owner's own hand-edits, and an automated re-scan
 * must never silently replace it, only add to what she hasn't seen yet. New
 * keys are appended, never prepended, so nothing already visible moves under
 * her while she's looking at it.
 */
export function mergeReceiptDrafts(existing = [], incoming = [], keyOf = (d) => d?.ref || d?._inboxId || '') {
  const seen = new Set((existing || []).map(keyOf));
  const additions = [];
  (incoming || []).forEach((d) => {
    const key = keyOf(d);
    if (seen.has(key)) return;
    seen.add(key);
    additions.push(d);
  });
  return [...(existing || []), ...additions];
}

/**
 * How far back the next sweep should search Gmail.
 *
 * Reads like the Canada Post and shipping-email sweeps' own from-date helpers,
 * with one addition those don't need: a receipt this sweep already found and
 * drafted is not durable. It lives only in memory until the owner imports it —
 * that's the whole point of a review gate — so if the tab reloads before she
 * gets to it, the sweep is the only thing that can rediscover it. Letting the
 * search window close past that receipt's date would make losing it permanent
 * and silent, which is exactly what this feature exists to not do. So the
 * window is clamped to the oldest still-unresolved find, never just to the
 * last time the sweep ran.
 */
export function receiptSweepWindowStart({
  lastStamp = 0, pendingFoundAts = [], coldStartDays = 14, now = Date.now(),
} = {}) {
  const coldStart = now - coldStartDays * 86400000;
  // A day of overlap, same reasoning as every other sweep: a receipt can land
  // between one run starting and finishing, and a duplicate costs nothing
  // (the ref above is what stops it being filed twice) where a missed one is
  // silent.
  const withOverlap = lastStamp ? lastStamp - 86400000 : coldStart;
  const oldestPending = pendingFoundAts.length ? Math.min(...pendingFoundAts) : Infinity;
  return Math.min(withOverlap, oldestPending);
}
