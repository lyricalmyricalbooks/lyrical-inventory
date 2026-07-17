// Pure helpers that keep a consignment sale cross-referenced across the three
// places it surfaces: the ledger Sale row (canonical), its History mirror
// (s.hist with consignmentLink), and the invoice that bills it.
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
export function histMirrorForLedger(s, e) {
  if (!e) return null;
  const hist = s.hist || [];
  if (e.sheetsId) {
    const byId = hist.find(h => h.consignmentLink && h.sheetsId === e.sheetsId);
    if (byId) return byId;
  }
  if (e.type !== 'Sale') return null;
  return hist.find(h =>
    h.consignmentLink &&
    h.notes === e.storeName &&
    h.date === e.date &&
    (h.qty || 0) === (e.qty || 0) &&
    Math.abs((h.price || 0) * (h.qty || 0) - (e.amountDue || 0)) < 0.01
  ) || null;
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

// Re-derive every consignment Sale mirror's invoice fields from the canonical
// ledger entry + the live invoice, healing legacy split sheetsIds along the way.
// This makes an invoice rename reflect in the History tab and Tax Center even
// for rows whose mirror link was previously broken — without forcing a re-save.
// Idempotent and cheap; safe to call at the top of a render.
export function reconcileConsignmentInvoiceLinks(s) {
  if (!s || !Array.isArray(s.ledger)) return;
  const invoices = s.invoices || [];
  for (const e of s.ledger) {
    if (e.type !== 'Sale') continue;
    // Keep the ledger's own denormalized number current with the live invoice
    // (renamed after the link was stamped → e.invoiceNum would be stale).
    if (e.invoiceId) {
      const inv = invoices.find(i => i.id === e.invoiceId);
      if (inv) e.invoiceNum = inv.num;
      else { e.invoiceId = null; e.invoiceNum = null; } // invoice was deleted
    }
    const h = histMirrorForLedger(s, e);
    if (!h) continue;
    if (e.sheetsId && h.sheetsId !== e.sheetsId) h.sheetsId = e.sheetsId;
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
