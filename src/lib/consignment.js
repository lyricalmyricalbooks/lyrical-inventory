// Pure helpers that keep a consignment sale cross-referenced across the three
// places it surfaces: the ledger Sale row (canonical), its History mirror
// (s.hist with consignmentLink), and the invoice that bills it.
//
// The ledger row is the record the Consignment tab edits; the mirror is the row
// every downstream report reads (Tax Center ledger and its Excel export, the
// tax CSV, channel revenue, on-hand reconciliation). Keeping the mirror derived
// from the ledger — never edited independently — is what stops the two from
// telling the publisher different numbers for the same sale.
//
// Kept DOM- and Firestore-free so the fragile join logic — which has to survive
// legacy rows whose sheetsId was backfilled independently — can be unit-tested
// without a browser. main.js imports these and owns the rendering / sync glue.

import { getBookCurrencyCode } from './money.js';

// The s.hist mirror row for a ledger Sale. The mirror and its ledger entry are
// minted sharing one sheetsId (see confirmSale), so that's the primary join.
// BUT legacy rows created before sheetsId existed were later backfilled with
// INDEPENDENT ids (backfillSheetsIds() mints a fresh one per record), which
// orphans the mirror from its ledger sale. Fall back to the mirror's stable
// shape — store + date + qty + due amount — so the join survives that split.
// Returns null when there's no resolvable mirror.
// `claimed` (optional) is a Set of mirrors already bound to another ledger row.
// Two identical sales at the same store on the same day are indistinguishable
// to the shape fallback, so a caller walking the whole ledger passes it to stop
// both rows from resolving to the same mirror.
export function histMirrorForLedger(s, e, claimed) {
  if (!e) return null;
  const hist = s.hist || [];
  const free = h => !claimed || !claimed.has(h);
  if (e.sheetsId) {
    const byId = hist.find(h => h.consignmentLink && h.sheetsId === e.sheetsId && free(h));
    if (byId) return byId;
  }
  if (e.type !== 'Sale') return null;
  return hist.find(h =>
    h.consignmentLink &&
    free(h) &&
    h.notes === e.storeName &&
    h.date === e.date &&
    (h.qty || 0) === (e.qty || 0) &&
    Math.abs((h.price || 0) * (h.qty || 0) - (e.amountDue || 0)) < 0.01
  ) || null;
}

// Re-derive a mirror's figures from its canonical ledger Sale. The Consignment
// tab edits the ledger row, but the Tax Center ledger, the channel stats, the
// tax CSV and the on-hand reconciliation all read the MIRROR — so without this
// an edited or voided sale keeps reporting its pre-edit amount everywhere
// outside the ledger table itself.
//
// `mirror` should be passed by callers that resolved it BEFORE mutating the
// ledger row: once the row's qty/date/amount change, the shape fallback in
// histMirrorForLedger can no longer match a legacy split-sheetsId pair.
//
// Deliberately does NOT touch `notes` — the mirror stores the store name there
// (it's the History "Notes" column, and the fallback join keys on it), whereas
// the ledger's notes are the entry's own free text. Returns true if it changed
// anything.
export function syncHistMirrorFromLedger(s, e, mirror) {
  if (!e || e.type !== 'Sale') return false;
  const h = mirror || histMirrorForLedger(s, e);
  if (!h) return false;

  const qty = e.qty || 0;
  // The mirror is a per-unit record of YOUR share, so amountDue (already net of
  // the store's commission) divided across the units it covers.
  const price = qty > 0 ? (e.amountDue || 0) / qty : 0;
  const voided = !!e.voided;

  let changed = false;
  // Heal a legacy split sheetsId so the next lookup is the O(1) id match rather
  // than a shape comparison that this very edit may have just invalidated.
  if (e.sheetsId && h.sheetsId !== e.sheetsId) { h.sheetsId = e.sheetsId; changed = true; }
  if ((h.qty || 0) !== qty) { h.qty = qty; changed = true; }
  if (Math.abs((h.price || 0) - price) > 1e-9) { h.price = price; changed = true; }
  if (e.date && h.date !== e.date) { h.date = e.date; changed = true; }
  if (!!h.voided !== voided) { h.voided = voided; changed = true; }
  return changed;
}

// The canonical ledger Sale behind a History mirror — the inverse of
// histMirrorForLedger, for the edit handlers that start from a hist row and
// need to redirect to the row that actually owns the numbers. Returns the index
// into s.ledger, or -1 when the mirror is orphaned.
export function ledgerSaleIndexForHistMirror(s, h) {
  if (!h || !h.consignmentLink || !Array.isArray(s && s.ledger)) return -1;
  if (h.sheetsId) {
    const byId = s.ledger.findIndex(e => e.type === 'Sale' && e.sheetsId === h.sheetsId);
    if (byId !== -1) return byId;
  }
  return s.ledger.findIndex(e =>
    e.type === 'Sale' &&
    e.storeName === h.notes &&
    e.date === h.date &&
    (e.qty || 0) === (h.qty || 0)
  );
}

// The only writer of the invoice back-pointers: sets (or clears, when inv===null)
// invoiceId/invoiceNum on a ledger entry AND its hist mirror in lockstep.
export function stampLedgerInvoiceLink(s, ledgerId, inv) {
  const e = (s.ledger || []).find(x => x.id === ledgerId);
  if (!e) return;
  e.invoiceId = inv ? inv.id : null;
  e.invoiceNum = inv ? inv.num : null;

  if (inv && inv.discount > 0) {
    const discStr = inv.discountType === 'percent'
      ? `Invoice Discount: ${inv.discountRate}%`
      : `Invoice Discount: flat`;
    let cleaned = e.notes || '';
    cleaned = cleaned.replace(/\s*·\s*Invoice Discount:\s*[^·]+/g, '').replace(/Invoice Discount:\s*[^·]+/g, '').trim();
    e.notes = cleaned ? `${cleaned} · ${discStr}` : discStr;
  } else if (!inv) {
    if (e.notes) {
      e.notes = e.notes.replace(/\s*·\s*Invoice Discount:\s*[^·]+/g, '').replace(/Invoice Discount:\s*[^·]+/g, '').trim();
    }
  }

  const h = histMirrorForLedger(s, e);
  if (h) {
    // Heal a legacy split sheetsId so future lookups stay O(1) and robust. The
    // consignment mirror is never synced to Sheets on its own (the ledger row is
    // canonical), so realigning its id has no sheet-side effect.
    if (e.sheetsId && h.sheetsId !== e.sheetsId) h.sheetsId = e.sheetsId;
    h.invoiceId = inv ? inv.id : null;
    h.invoiceNum = inv ? inv.num : null;
    h.notes = e.notes || '';
  }
}

// Re-derive every consignment Sale mirror from its canonical ledger entry: the
// amount, quantity, date and void state, plus the invoice fields resolved
// against the live invoice — healing legacy split sheetsIds along the way.
//
// This is what makes a ledger edit show up everywhere the mirror is read (the
// Tax Center ledger, the tax CSV, channel revenue) and an invoice rename reach
// the History tab, even for rows whose link was previously broken, without
// forcing a re-save. Idempotent and cheap; safe to call at the top of a render.
export function reconcileConsignmentMirrors(s) {
  if (!s || !Array.isArray(s.ledger)) return;
  const invoices = s.invoices || [];
  const claimed = new Set();
  for (const e of s.ledger) {
    if (e.type !== 'Sale') continue;
    // Keep the ledger's own denormalized number current with the live invoice
    // (renamed after the link was stamped → e.invoiceNum would be stale).
    if (e.invoiceId) {
      const inv = invoices.find(i => i.id === e.invoiceId);
      if (inv) e.invoiceNum = inv.num;
      else { e.invoiceId = null; e.invoiceNum = null; } // invoice was deleted
    }
    const h = histMirrorForLedger(s, e, claimed);
    if (!h) continue;
    claimed.add(h);
    syncHistMirrorFromLedger(s, e, h);
    h.invoiceId = e.invoiceId || null;
    h.invoiceNum = e.invoiceNum || null;
  }
}

// Build the Google Sheets payload for a consignment ledger row. Centralised so
// the invoice number (and every other field) syncs identically from confirmSale,
// edits, voids, invoice renames and the full resync.
export function consignmentSyncPayload(book, e) {
  return {
    type: 'consignment', book: book.title,
    date: e.date, store: e.storeName, event: e.type,
    qty: e.qty, rate: e.rate, amountDue: e.amountDue || 0,
    notes: e.notes || '', status: e.status || 'OK',
    invoiceNum: e.invoiceNum || '',
    sheetsId: e.sheetsId,
    currency: getBookCurrencyCode(book)
  };
}
