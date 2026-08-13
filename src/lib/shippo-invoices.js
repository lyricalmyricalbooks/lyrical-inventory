// Shippo invoices and refunds — the money side of shipping.
//
// The app has always saved the shipping *label* against a postage expense. A
// label proves a parcel was sent; it is not proof of payment, and it is not what
// an accountant wants to see. The document that proves payment is the Shippo
// invoice, and Shippo issues one weekly, or whenever the running balance passes
// $100 — so one invoice covers many labels.
//
// That shape matters for the ledger: the invoice is the receipt of record, and
// each label is supporting evidence attached to the expense it belongs to.
//
// TWO CAUTIONS, both deliberate:
//
// 1. The invoices API is in beta and Shippo says the contract is subject to
//    change. Everything here therefore accepts several plausible field names and
//    never throws on a shape it doesn't recognise — a changed API must degrade
//    to "invoices unavailable" and leave the existing label flow working, not
//    break the postage import.
//
// 2. Refunds were not handled at all. A refunded label was skipped on import,
//    which sounds harmless but isn't: if the label was imported *before* it was
//    refunded, the expense stays in the ledger at full price forever. Postage is
//    overstated and profit understated, silently. `refundExpense` below is the
//    correction.

/** First present, non-empty value among several candidate field names. */
function pick(obj, ...names) {
  for (const n of names) {
    const v = obj?.[n];
    if (v !== undefined && v !== null && v !== '') return v;
  }
  return undefined;
}

/** A number from whatever shape the API used, or null. */
function num(v) {
  if (v === undefined || v === null || v === '') return null;
  const n = Number(typeof v === 'string' ? v.replace(/[^0-9.\-]/g, '') : v);
  return Number.isFinite(n) ? n : null;
}

/** `YYYY-MM-DD` from an ISO-ish timestamp, or ''. */
export function isoDate(value) {
  const s = String(value || '');
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const d = s ? new Date(s) : null;
  return d && !isNaN(d.getTime()) ? d.toISOString().slice(0, 10) : '';
}

/**
 * Normalise one invoice.
 *
 * Returns null for anything that isn't recognisably an invoice, so a changed
 * response shape produces "no invoices" rather than a ledger full of rubbish.
 */
export function parseInvoice(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const id = pick(raw, 'object_id', 'id', 'invoice_id');
  if (!id) return null;

  return {
    id: String(id),
    date: isoDate(pick(raw, 'invoice_date', 'object_created', 'created', 'date')),
    periodStart: isoDate(pick(raw, 'period_start', 'start_date')),
    periodEnd: isoDate(pick(raw, 'period_end', 'end_date')),
    total: num(pick(raw, 'total', 'amount', 'total_amount', 'gross_amount')),
    currency: String(pick(raw, 'currency', 'currency_code') || '').toUpperCase() || 'USD',
    status: String(pick(raw, 'status', 'state') || '').toUpperCase(),
    url: String(pick(raw, 'invoice_url', 'pdf_url', 'download_url', 'url') || ''),
  };
}

/**
 * Normalise one invoice item — the line that ties a charge to a label.
 *
 * `transactionId` is the join back to a postage expense, which is the whole
 * reason to read items at all.
 */
export function parseInvoiceItem(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const invoiceId = pick(raw, 'invoice', 'invoice_id', 'invoice_object_id');
  const txId = pick(raw, 'transaction', 'transaction_id', 'object_id_transaction');
  if (!invoiceId && !txId) return null;

  return {
    id: String(pick(raw, 'object_id', 'id') || ''),
    invoiceId: invoiceId ? String(invoiceId) : '',
    transactionId: txId ? String(txId) : '',
    amount: num(pick(raw, 'amount', 'total', 'price')),
    currency: String(pick(raw, 'currency', 'currency_code') || '').toUpperCase() || 'USD',
    description: String(pick(raw, 'description', 'name', 'label') || ''),
    date: isoDate(pick(raw, 'object_created', 'created', 'date')),
  };
}

/** Index invoice items by the transaction they billed. */
export function invoiceIndexByTransaction(items) {
  const map = new Map();
  (items || []).forEach(raw => {
    const item = raw && raw.transactionId !== undefined ? raw : parseInvoiceItem(raw);
    if (item && item.transactionId) map.set(item.transactionId, item);
  });
  return map;
}

/**
 * Normalise a refund.
 *
 * Shippo's refund object points back at the transaction it reverses, which is
 * what lets the ledger cancel exactly the right postage entry.
 */
export function parseRefund(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const id = pick(raw, 'object_id', 'id');
  const txId = pick(raw, 'transaction', 'transaction_id');
  if (!id || !txId) return null;

  return {
    id: String(id),
    transactionId: String(txId),
    status: String(pick(raw, 'status', 'object_status', 'state') || '').toUpperCase(),
    date: isoDate(pick(raw, 'object_created', 'created', 'date')),
  };
}

/** Only refunds that actually returned money. */
export function isSettledRefund(refund) {
  return !!refund && (refund.status === 'SUCCESS' || refund.status === 'REFUNDED' || refund.status === 'COMPLETED');
}

/**
 * The negative postage entry that cancels a refunded label.
 *
 * Mirrors the original expense's amount and currency exactly rather than
 * recomputing, so the pair nets to zero in every column including the converted
 * base amount — a refund reconciled at a different exchange rate would leave a
 * permanent few-cent drift in the books.
 */
export function refundExpense(refund, original, idSeed = Date.now()) {
  if (!refund || !original) return null;
  const amount = Number(original.origAmount ?? original.amount);
  if (!Number.isFinite(amount) || amount === 0) return null;

  return {
    id: idSeed,
    desc: `Refund — ${original.desc || 'Shippo shipping label'}`,
    cat: original.cat || 'Shipping & Postage',
    currency: original.currency,
    amount: -amount,
    origCurrency: original.origCurrency || original.currency,
    origAmount: -amount,
    fxRate: original.fxRate ?? null,
    baseAmount: original.baseAmount != null ? -original.baseAmount : null,
    date: refund.date || original.date,
    ref: `shippo-refund:${refund.id}`,
    refundOf: original.ref || '',
    receipt: '',
    trip: '',
  };
}

/**
 * What to tell the owner when invoices can't be read.
 *
 * The endpoint is beta, so "not available" is an expected outcome rather than a
 * fault, and the message says what to do instead rather than reporting an error
 * they cannot act on.
 */
export function describeInvoiceAvailability(status) {
  if (status === 404 || status === 501) {
    return 'Shippo invoices aren\'t available on this account through the API. You can still download them from Shippo under Settings → Account → Billing, and attach them here like any other receipt.';
  }
  if (status === 401 || status === 403) {
    return 'Your Shippo token can\'t read invoices. A token with billing access is needed, or download them from Shippo under Settings → Account → Billing.';
  }
  return 'Shippo invoices couldn\'t be read just now. Shipping labels were imported as usual.';
}
