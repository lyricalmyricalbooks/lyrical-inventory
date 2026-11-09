// The sale ledger: the one way a sale enters or leaves a book's history.
//
// writeOrderToLedger is the single write path for a sale (order form, Stripe
// payment, register, website link): stock, sold, revenue, channel totals,
// the invoice-discount note, the running Stock After and the Google Sheet
// row all move together. addSaleToState is its state half, which the website
// orders from the scan, recovered orders and spreadsheet imports share, since
// they send their Sheet rows their own way. recordOrder is its on-screen wrapper (the open book,
// then repaint); recordOrderPendingTransfer is the direct-to-artist variant
// that counts the copies sold but holds the revenue until the artist forwards
// it. voidHistEntry / unvoidHistEntry are the exact reverse and its undo, and
// syncHistoryVoidDeletion keeps the Sheet in step with a void.
//
// Lifted out of src/main.js verbatim, apart from the applied-order-number
// cache, which this module can't reassign: it calls main.js's
// invalidateAppliedIds() instead. The active book stays owned by main.js;
// callers that need a different book use withActiveBook() there. Nothing here
// runs at module-evaluation time, which is what makes the main.js <-> feature
// import cycle safe.
//
// eslint's no-undef (an error, checked in CI) is what keeps the import list
// honest: an identifier that isn't imported fails the build rather than
// throwing at click time.
import {
  invalidateAppliedIds,
  isAuthor,
  recomputeAfters,
  renderHist,
  saveState,
  sheetsUrl,
  syncHistRowToSheets,
  today,
} from '../main.js';
import { BOOKS, states, activeBook, getState, getBook } from '../core/store.js';
import { notesWithInvoiceDiscount } from '../lib/consignment.js';
import { bookCurrencyCode } from '../lib/currency-migration.js';
import { authorStockToReturn, deductSaleFromStockBreakdown, noteAuthorTaken, stockToReturn, takeSaleStock } from '../lib/inventory.js';
import { channelStats, hasOwnChannel } from '../lib/channel-mix.js';
import { cadEquivalentForSale, getBookCurrencyCode, heldTransferIndexForSale, normalizeCurrencyCode } from '../lib/money.js';
import { updateDash } from './dashboard.js';
import { makeEventId, syncToSheets } from './sheets-bridge.js';

function recordOrder(num, chan, qty, price, notes, payment = null, { date, enteredBy: enteredByOverride, extra } = {}) {
  const enteredBy = enteredByOverride || (isAuthor() ? 'Artist' : 'Publisher');
  writeOrderToLedger(activeBook, { num, chan, qty, price, notes, payment, enteredBy, date, extra });
  // The sale is saved by now. A repaint that fails must not turn into an
  // error on the form, which invites saving the same sale a second time.
  // Rethrown on its own so the error log still gets it.
  try { renderHist(); updateDash(); } catch (err) { setTimeout(() => { throw err; }, 0); }
}

/**
 * The one way a sale enters a book's ledger. A sale typed into the order form
 * and a card payment picked up from Stripe both come through here, so they land
 * as the same kind of row: same stock and earnings effect, same invoice-discount
 * note, same running Stock After, same Google Sheet row. Callers repaint.
 *
 * `sheetsId` and `date` default to a fresh id and today; a Stripe payment
 * passes its own (the charge id keeps it from being recorded twice, and the
 * payment's date is when the sale happened). `extra` is merged onto the row.
 */
function writeOrderToLedger(bookId, opts = {}) {
  const s = states[bookId], book = BOOKS[bookId];
  if (!s || !book) throw new Error('Unknown book');
  const row = addSaleToState(s, book, opts);
  recomputeAfters(s, book);
  saveState(bookId);
  const { num, chan, qty, price, notes, date, payment, sheetsId } = row;
  const nativeCur = normalizeCurrencyCode(getBookCurrencyCode(book), 'CAD');
  const totalNative = qty * price;
  const cadEquiv = cadEquivalentForSale({ nativeCurrency: nativeCur, totalNative, payment });
  syncToSheets({
    // The row's own running balance: a backdated sale (a Stripe payment from
    // last week) sits earlier in the timeline than today's on-hand count.
    type: 'order', book: book.title, date, num, chan, qty, price, total: totalNative, stockAfter: row.after ?? s.stock, notes,
    sheetsId,
    currency: nativeCur,
    paymentCurrency: normalizeCurrencyCode(payment?.currency || nativeCur, 'CAD'),
    paymentAmount: payment?.amount ?? totalNative,
    paymentRate: payment?.rate ?? '',
    convertedTotal: cadEquiv
  });
  return row;
}

/**
 * The state half of a sale: stock, copies sold, revenue and the channel
 * totals, plus the history row (invoice-discount note, book currency, a
 * Sheets id) and the applied-order-number cache. It doesn't save, recompute
 * Stock After or send anything to the Sheet: writeOrderToLedger does all
 * three for one sale; a website order adds its postage row, and an import
 * sends its rows as one batch.
 *
 * `stamp: false` leaves out recordedAt, for a sale filled in after the fact
 * (an order from the scan, a recovered order, an import), so the activity
 * feed files it under the sale's own date rather than the moment it was typed.
 * Returns the new row.
 */
function addSaleToState(s, book, { num = '', chan, qty, price, notes = '', payment = null, enteredBy = 'Publisher', date, sheetsId, extra = {}, stamp = true } = {}) {
  // Copies actually taken (fewer than qty when the sale oversold), recorded
  // on the row so a void gives back exactly those.
  const authorTaken = enteredBy === 'Artist' ? deductSaleFromStockBreakdown(s, qty, true) : null;
  const taken = {};
  takeSaleStock(s, taken, qty);
  s.sold += qty; s.revenue += qty * price;
  const cs = channelStats(s, chan);
  cs.txns++; cs.units += qty; cs.revenue += qty * price;
  const row = {
    ...(stamp ? { recordedAt: new Date().toISOString() } : {}),
    ...extra,
    num, chan, qty, price, after: s.stock, notes: notesWithInvoiceDiscount(s.invoices, num, notes),
    date: date || today(), payment, enteredBy, sheetsId: sheetsId || makeEventId(), cur: bookCurrencyCode(book),
    ...taken,
  };
  if (authorTaken !== null) noteAuthorTaken(row, authorTaken);
  s.hist.unshift(row);
  // Its order number now counts as applied (the Orders tab hides applied ones).
  invalidateAppliedIds();
  return row;
}

function recordOrderPendingTransfer(num, chan, qty, price, notes, payment = null, date = null, fromSubmission = null) {
  const s = getState(), book = getBook();
  const when = date || today();
  const authorTaken = deductSaleFromStockBreakdown(s, qty, true);
  // Reduce stock and count as sold, but do NOT add to revenue yet
  const taken = {};
  takeSaleStock(s, taken, qty);
  s.sold += qty;
  const cs = channelStats(s, chan);
  cs.txns++; cs.units += qty;
  const updatedNotes = notesWithInvoiceDiscount(s.invoices, num, notes);

  // Add to history with pending flag. directToArtist marks this as cash the
  // artist collected directly (these only ever come from direct-to-artist sales).
  const sheetsId = makeEventId();
  const row = { ...(fromSubmission ? { fromSubmission } : {}), num, chan, qty, price, after: s.stock, notes: updatedNotes, date: when, artistPending: true, directToArtist: true, payment, sheetsId, cur: bookCurrencyCode(book), ...taken };
  noteAuthorTaken(row, authorTaken);
  s.hist.unshift(row);
  // Add to artistTransfers queue (share sheetsId so receipt updates the same sheet row)
  s.artistTransfers.push({ id: Date.now(), num, chan, qty, price, total: qty * price, notes: updatedNotes, date: when, payment, sheetsId, cur: bookCurrencyCode(book) });
  recomputeAfters(s, book);
  renderHist(); updateDash(); saveState(activeBook);
  const nativeCur = normalizeCurrencyCode(getBookCurrencyCode(book), 'CAD');
  const totalNative = qty * price;
  const cadEquiv = cadEquivalentForSale({ nativeCurrency: nativeCur, totalNative, payment });
  syncToSheets({
    type: 'order', book: book.title, date: when, num, chan, qty, price, total: totalNative, stockAfter: s.stock, notes: updatedNotes + ' [PENDING ARTIST TRANSFER]',
    sheetsId,
    currency: nativeCur,
    paymentCurrency: normalizeCurrencyCode(payment?.currency || nativeCur, 'CAD'),
    paymentAmount: payment?.amount ?? totalNative,
    paymentRate: payment?.rate ?? '',
    convertedTotal: cadEquiv
  });
}

// `book` is the sale's own book. These used to read the open book, so a Stripe
// refund or a website order taken back to New for another title sent its row
// under the wrong title — and an un-void wrote it into the wrong book's tab, in
// that book's currency.
function syncHistoryVoidDeletion(h, isVoided, book = getBook()) {
  if (!h || !sheetsUrl) return;
  // Consignment-mirrored hist entries are handled via the ledger row.
  if (h.consignmentLink) return;
  if (isVoided) {
    // Hard delete by stable sheetsId so the backend removes the exact row.
    // Without an id we can't safely target one (an empty id risks matching
    // unrelated legacy rows), so skip — a later rebuild clears it.
    if (!h.sheetsId) return;
    syncToSheets({
      action: 'delete',
      type: 'order',
      book: book.title,
      sheetsId: h.sheetsId
    });
    if ((Number(h.shippingPaid || 0) || 0) > 0) {
      syncToSheets({
        action: 'delete',
        type: 'shipping',
        book: book.title,
        sheetsId: h.sheetsId + '-shipping'
      });
    }
    return;
  }
  // Unvoid: re-sync the full entry (upsert will replace the row)
  syncHistRowToSheets(h, book);
}

/**
 * Void one sale in a book's history: stock back, revenue and channel totals
 * out, the Sheets row queued for deletion. Shared by the Void button and the
 * Stripe refund alert, so a refunded sale is reversed exactly the way a
 * hand-voided one is.
 */
function voidHistEntry(s, book, h, { recompute = true } = {}) {
  // A held-cash (direct-to-artist) sale never added revenue; it only sits in
  // the pending-transfer queue. Pull that transfer so the artist is not left
  // owing a cut (and a later "received" can't add revenue) for a voided sale.
  let pendingRev = false;
  if (h.artistPending) {
    pendingRev = true;
    const ti = heldTransferIndexForSale(s.artistTransfers, h);
    if (ti !== -1) h.voidedTransfer = s.artistTransfers.splice(ti, 1)[0];
  }
  // Only the copies the sale actually took go back (an oversold sale took
  // fewer than its quantity); older rows give back the full quantity.
  s.stock += stockToReturn(h);
  if (!h.gratuity) {
    s.sold = Math.max(0, s.sold - h.qty);
    if (!pendingRev) s.revenue = Math.max(0, s.revenue - h.qty * h.price);
  }
  const cs = hasOwnChannel(s, h.chan) ? s.chStats[h.chan] : null;
  if (cs) {
    cs.txns = Math.max(0, cs.txns - 1);
    cs.units = Math.max(0, cs.units - h.qty);
    if (!pendingRev) cs.revenue = Math.max(0, cs.revenue - h.qty * h.price);
    if (cs.txns <= 0) delete s.chStats[h.chan];
  }
  // A gratuity's (or comp's) marketing expense comes off with it, kept on the
  // row so an un-void puts the same expense back.
  if (h.gratuity) {
    const ei = (s.expenses || []).findIndex(e => e && e.gratuity === true && e.ref === h.num);
    if (ei !== -1) h.voidedExpense = s.expenses.splice(ei, 1)[0];
  }
  // Author-fulfilled sales took copies from the author's held stock; give them back.
  if (h.directToArtist || h.enteredBy === 'Artist') s.authorStock = (Number.isFinite(s.authorStock) ? s.authorStock : 0) + authorStockToReturn(h);
  h.voided = true;
  h.voidedAt = Date.now();
  // Voiding many at once (undoing an import) recomputes once at the end.
  if (recompute) recomputeAfters(s, book);
  syncHistoryVoidDeletion(h, true, book);
}

/** The exact reverse of voidHistEntry: the sale counts again. */
function unvoidHistEntry(s, book, h) {
  // Re-take the copies against today's shelf, recording afresh how many
  // were actually there.
  takeSaleStock(s, h, h.qty);
  if (!h.gratuity) {
    s.sold += h.qty;
    if (!h.artistPending) s.revenue += h.qty * h.price;
  }
  const cs = channelStats(s, h.chan);
  cs.txns++;
  cs.units += h.qty;
  if (!h.artistPending) cs.revenue += h.qty * h.price;
  // The expense was spliced out of this state's expenses list, so the list
  // exists; if it somehow doesn't, the expense stays parked on the row.
  if (h.voidedExpense && Array.isArray(s.expenses)) {
    s.expenses.unshift(h.voidedExpense);
    delete h.voidedExpense;
  }
  if (h.voidedTransfer) {
    s.artistTransfers = s.artistTransfers || [];
    s.artistTransfers.push(h.voidedTransfer);
    delete h.voidedTransfer;
  }
  if (h.directToArtist || h.enteredBy === 'Artist') noteAuthorTaken(h, deductSaleFromStockBreakdown(s, h.qty, true));
  h.voided = false;
  delete h.voidedAt;
  delete h.voidedReason;
  recomputeAfters(s, book);
  syncHistoryVoidDeletion(h, false, book);
}

export {
  addSaleToState,
  recordOrder,
  writeOrderToLedger,
  voidHistEntry,
  unvoidHistEntry,
  recordOrderPendingTransfer,
  syncHistoryVoidDeletion,
};
