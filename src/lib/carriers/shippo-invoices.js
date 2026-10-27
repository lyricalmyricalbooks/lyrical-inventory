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
  // The documented shape nests money as { amount, currency }.
  const charged = pick(raw, 'total_charged', 'total_invoiced');

  return {
    id: String(id),
    date: isoDate(pick(raw, 'invoice_date', 'object_created', 'created', 'date')),
    periodStart: isoDate(pick(raw, 'period_start', 'start_date')),
    periodEnd: isoDate(pick(raw, 'period_end', 'end_date')),
    total: num(pick(raw, 'total', 'amount', 'total_amount', 'gross_amount') ?? charged?.amount),
    currency: String(pick(raw, 'currency', 'currency_code') || charged?.currency || '').toUpperCase() || 'USD',
    status: String(pick(raw, 'status', 'state') || '').toUpperCase(),
    number: String(pick(raw, 'invoice_number', 'number') || ''),
    url: String(pick(raw, 'invoice_url', 'pdf_url', 'download_url', 'url') || '') || shippoInvoicePageUrl(id),
  };
}

/**
 * The invoice's page in the Shippo dashboard.
 *
 * Shippo's documented invoice object has no PDF or download field — the
 * dashboard page is the receipt, and it is exactly where Shippo's own receipt
 * email links. So an invoice id is all it takes to point at the receipt.
 */
export function shippoInvoicePageUrl(invoiceId) {
  const id = String(invoiceId || '').trim();
  return /^[A-Za-z0-9]{8,64}$/.test(id) ? `https://apps.goshippo.com/settings/account/billing/invoices/${id}` : '';
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

// LABEL URLS EXPIRE — WHY A STORED ONE IS NOT A RECEIPT
//
// A Shippo label_url is a signed CloudFront link:
//
//   https://deliver.goshippo.com/<id>.pdf?Expires=1806787827&Signature=…
//
// Checked against a real transaction: created 2026-04-03T21:30:24Z, signature
// expiring 2027-04-03T21:30:27Z — one year to the second. So a label URL stored
// in the ledger is a link that dies on its own first birthday, silently, long
// before the six years of records the CRA expects.
//
// The transaction id is already kept on every imported expense as
// `ref: "shippo:<id>"`, so a fresh link can be minted on demand instead. That
// is what shippoTxIdFromRef exists for.

/** The transaction id behind an imported Shippo expense, or ''. */
export function shippoTxIdFromRef(ref) {
  const m = String(ref || '').match(/^shippo:([A-Za-z0-9]+)$/);
  return m ? m[1] : '';
}

/** A signed Shippo label link — the kind that expires. */
export function isExpiringLabelUrl(url) {
  return typeof url === 'string'
    && /deliver\.goshippo\.com/i.test(url)
    && /[?&]Expires=\d+/.test(url);
}

/** When a signed label link stops working, or null if it isn't one. */
export function labelUrlExpiry(url) {
  if (!isExpiringLabelUrl(url)) return null;
  const m = String(url).match(/[?&]Expires=(\d+)/);
  if (!m) return null;
  const d = new Date(Number(m[1]) * 1000);
  return isNaN(d.getTime()) ? null : d;
}

/** True once a stored label link can no longer be opened. */
export function isLabelUrlExpired(url, now = new Date()) {
  const expiry = labelUrlExpiry(url);
  return !!expiry && expiry.getTime() <= now.getTime();
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

/**
 * Put the Shippo invoice in front of each label as the receipt of record.
 *
 * `itemIndex` maps a transaction to its invoice item (invoiceIndexByTransaction)
 * and `invoicesById` optionally maps an invoice id to a parsed invoice; without
 * one, the receipt is the invoice's Shippo dashboard page. The label stays
 * attached after the invoice, and in `supportingFiles`, because it is still the
 * evidence of what was shipped. Only expenses that change are returned, so the
 * caller can save once and report an honest count. Idempotent: an invoice
 * already attached is not added twice.
 */
export function attachInvoiceReceipts(expenses, itemIndex, invoicesById) {
  const changed = [];
  let noInvoice = 0;
  (expenses || []).forEach(e => {
    const txId = shippoTxIdFromRef(e?.ref);
    if (!txId) return;
    const invoiceId = e.invoiceId || itemIndex?.get(txId)?.invoiceId || '';
    const url = invoiceId ? (invoicesById?.get(invoiceId)?.url || shippoInvoicePageUrl(invoiceId)) : '';
    if (!url) { noInvoice++; return; }
    const files = Array.isArray(e.receiptFiles) && e.receiptFiles.length
      ? e.receiptFiles.filter(r => typeof r === 'string' && r)
      : (e.receipt ? [e.receipt] : []);
    if (files.includes(url) && e.invoiceId === invoiceId) return;
    const others = files.filter(r => r !== url);
    e.invoiceId = invoiceId;
    e.receiptFiles = [url, ...others];
    e.receipt = url;
    const support = Array.isArray(e.supportingFiles) ? e.supportingFiles : [];
    e.supportingFiles = [...new Set([...support, ...others])];
    changed.push(e);
  });
  return { changed, noInvoice };
}

// ── Receipts from email ─────────────────────────────────────────────────────
//
// Shippo's invoices endpoint is not reachable from the browser on every
// account, but Shippo emails a "Your Shippo Invoice Receipt" for every payment.
// Those emails are read through the connected Google Sheet and matched back to
// the postage expenses they paid for.

/** Gmail search that finds Shippo's payment receipts. */
export const SHIPPO_RECEIPT_EMAIL_QUERY = 'from:noreply@shippo.com subject:"Shippo Invoice Receipt"';

const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };

function decodeBase64Url(s) {
  try {
    const b64 = s.replace(/-/g, '+').replace(/_/g, '/');
    return typeof atob === 'function' ? atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4)) : '';
  } catch (_) { return ''; }
}

/**
 * The link to the invoice on Shippo's billing page. The email wraps it in a
 * click-tracking redirect whose payload carries the real address, so look in
 * both the plain text and the decoded payloads.
 */
function shippoInvoiceLink(body) {
  const pattern = /billing\W{1,12}invoices\W{1,12}([a-f0-9]{16,64})/i;
  const plain = String(body).match(pattern);
  if (plain) return `https://apps.goshippo.com/settings/account/billing/invoices/${plain[1]}`;
  for (const m of String(body).matchAll(/[?&]p=([A-Za-z0-9_-]{20,})/g)) {
    const hit = decodeBase64Url(m[1]).match(pattern);
    if (hit) return `https://apps.goshippo.com/settings/account/billing/invoices/${hit[1]}`;
  }
  return '';
}

/**
 * Read one "Your Shippo Invoice Receipt" email. Returns null for anything that
 * isn't one, so other Shippo mail never lands in the ledger.
 */
export function parseShippoReceiptEmail({ id = '', body = '', date = '' } = {}) {
  const text = String(body || '');
  const totalMatch = text.match(/total of\W*\$?\s*([0-9][0-9,]*\.?[0-9]*)\s*([A-Z]{3})/i);
  if (!totalMatch) return null;
  const total = num(totalMatch[1]);
  if (total === null) return null;
  const invoiceNumber = (text.match(/Invoice\s*#\s*(\d+)/i) || [])[1] || '';
  const countMatch = text.match(/for\s+(\d+)\s+transactions?/i);
  const paidOn = text.match(/payment for\W*([A-Za-z]{3})[a-z]*\.?\s+(\d{1,2}),\s*(\d{4})/i);
  let paidDate = '';
  if (paidOn && MONTHS[paidOn[1].toLowerCase()]) {
    paidDate = `${paidOn[3]}-${String(MONTHS[paidOn[1].toLowerCase()]).padStart(2, '0')}-${paidOn[2].padStart(2, '0')}`;
  }
  return {
    messageId: String(id || ''),
    invoiceNumber,
    date: paidDate || isoDate(date),
    total,
    currency: totalMatch[2].toUpperCase(),
    count: countMatch ? Number(countMatch[1]) : 1,
    // When Shippo sent it, to the second. It arrives seconds after the label is
    // bought, which is what ties it to a label it was charged in another currency for.
    sentAt: /T\d{2}:\d{2}/.test(String(date)) && !isNaN(Date.parse(date)) ? new Date(date).toISOString() : '',
    url: shippoInvoiceLink(text) || (id ? `https://mail.google.com/mail/u/0/#all/${id}` : ''),
  };
}

function dayGap(a, b) {
  const ta = Date.parse(a); const tb = Date.parse(b);
  return Number.isFinite(ta) && Number.isFinite(tb) ? Math.abs(ta - tb) / 86400000 : Infinity;
}

/** Put a receipt in front of an expense's files, keeping the label behind it. */
function attachReceipt(e, url, invoiceId) {
  const files = Array.isArray(e.receiptFiles) && e.receiptFiles.length
    ? e.receiptFiles.filter(r => typeof r === 'string' && r)
    : (e.receipt ? [e.receipt] : []);
  const others = files.filter(r => r !== url);
  e.invoiceId = invoiceId;
  e.receiptFiles = [url, ...others];
  e.receipt = url;
  const support = Array.isArray(e.supportingFiles) ? e.supportingFiles : [];
  e.supportingFiles = [...new Set([...support, ...others])];
}

/** How long after a label is bought its receipt email can still be its own. */
export const RECEIPT_EMAIL_WINDOW_MS = 2 * 60 * 1000;

/**
 * The one label a single-label receipt email was sent for, judged by time.
 *
 * Shippo charges in US dollars even when the label is priced in Canadian
 * dollars (a CA$11.28 label arrives as a $7.97 USD receipt), so amounts cannot
 * be compared. But it bills each purchase on its own and emails the receipt
 * within seconds, so the label bought just before the email is the one it paid
 * for. Two labels bought within half a minute of each other are too close to
 * tell apart, and are left alone rather than guessed.
 */
function closestByPurchaseTime(candidates, sentAt) {
  const sent = Date.parse(sentAt || '');
  if (!Number.isFinite(sent)) return null;
  const fits = candidates
    .map(e => ({ e, lag: sent - Date.parse(e?.labelCreatedAt || '') }))
    .filter(c => Number.isFinite(c.lag) && c.lag >= -60000 && c.lag <= RECEIPT_EMAIL_WINDOW_MS)
    .sort((a, b) => Math.abs(a.lag) - Math.abs(b.lag));
  if (!fits.length) return null;
  if (fits.length > 1 && Math.abs(fits[1].lag) - Math.abs(fits[0].lag) < 30000) return null;
  return fits[0].e;
}

/**
 * Match emailed Shippo receipts to the postage expenses they paid for.
 *
 * A single-label receipt is matched first by when it was sent against when each
 * label was bought (closestByPurchaseTime), which works across currencies.
 * Otherwise matching is by what the receipt states: its date (a day either side, for time
 * zones), its currency and its total. A receipt covering one label must equal
 * that label's original amount; one covering several must equal the sum of
 * exactly that many unreceipted labels from the same day. Anything ambiguous is
 * left alone rather than guessed. Each receipt is used once, and an expense
 * that already has a receipt is never touched.
 */
export function attachEmailReceipts(expenses, receipts) {
  const changed = [];
  const taken = new Set();
  const open = (expenses || []).filter(e => shippoTxIdFromRef(e?.ref) && !e.invoiceId);
  const cents = v => Math.round(Number(v) * 100);
  const amountOf = e => cents(e.origAmount ?? e.amount);
  const currencyOf = e => String(e.origCurrency || e.currency || '').toUpperCase();

  // A receipt already on any expense was matched on an earlier run.
  const used = new Set((expenses || []).map(e => e?.invoiceId).filter(Boolean));
  for (const r of receipts || []) {
    if (!r || !r.url || !r.date) continue;
    if (used.has(r.invoiceNumber || r.messageId)) continue;
    // Filter out already-matched labels once per receipt, with a Set lookup
    // instead of scanning the matched list for every label.
    const available = open.filter(e => !taken.has(e));
    const pool = available.filter(e => currencyOf(e) === r.currency && dayGap(e.date, r.date) <= 1);
    let picked = null;
    const byTime = r.count === 1 ? closestByPurchaseTime(available, r.sentAt) : null;
    // In the same currency the amounts must still agree; only a cross-currency
    // charge is taken on timing alone.
    if (byTime && (currencyOf(byTime) !== r.currency || amountOf(byTime) === cents(r.total))) {
      picked = [byTime];
    } else if (r.count === 1) {
      const hits = pool.filter(e => amountOf(e) === cents(r.total));
      // Two identical labels on the same day: either fits, so take the closest
      // date; the receipt is honest proof for the amount either way.
      if (hits.length) picked = [hits.sort((a, b) => dayGap(a.date, r.date) - dayGap(b.date, r.date))[0]];
    } else if (pool.length === r.count
      && pool.reduce((s, e) => s + amountOf(e), 0) === cents(r.total)) {
      picked = pool;
    }
    if (!picked) continue;
    const invoiceId = r.invoiceNumber || r.messageId;
    picked.forEach(e => { attachReceipt(e, r.url, invoiceId); changed.push(e); taken.add(e); });
  }
  return { changed, unmatched: open.length - changed.length };
}
