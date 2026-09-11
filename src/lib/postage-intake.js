// Where a label bought anywhere else becomes one record.
//
// Postage reaches this app by four routes now. One is solved: a label bought
// inside the app is finished the moment the purchase returns. A second is
// solved: a Shippo label bought on Shippo's own site is polled for. The other
// two are what this module is for — a label bought from Canada Post or another
// courier, which arrives as a shipment on an account, an email in an inbox, or
// a PDF in a downloads folder.
//
// Those three can all describe the same parcel, and they are not equally
// trustworthy. Canada Post asked directly is authoritative: the recipient and
// the amount charged come from the carrier's own record. An email is read, and
// reading can be wrong. So this module does three things and nothing else:
// turns each source into one common shape, decides when two of them are the
// same label, and decides which one wins when they disagree.
//
// THE MONEY RULE, and the reason this file exists at all rather than each
// source building its own expense: an amount is either read confidently or left
// `null`. Never zero, never a guess. A blank is honestly missing and shows up
// in a "needs an amount" list; a plausible-but-wrong figure silently poisons
// postage costs, shipping margin and the profit the owner files tax on, and
// nothing downstream can tell it was invented. That was the owner's explicit
// choice when asked, and it is enforced here so no source can bypass it.
//
// Pure — no DOM, no network, no storage.

import { carrierFromTracking, normalizeTrackingNumber } from './postage-matching.js';

const clean = (value) => String(value ?? '').trim();

/**
 * Which source to believe when two describe the same label.
 *
 * Canada Post asked directly beats anything read off a document, because it is
 * the carrier's own record of what it charged. A confirmation email beats a
 * photographed receipt for the same reason at one remove: it is the carrier's
 * text rather than a camera's impression of it.
 */
export const POSTAGE_SOURCE_RANK = Object.freeze({
  canadapost: 3,
  email: 2,
  receipt: 1,
});

/**
 * A money figure, or null when it cannot be trusted.
 *
 * Returns null — not 0 — for anything unreadable, and rejects zero and
 * negatives outright: a label costs something, so 0.00 is a failed read rather
 * than a free parcel, and a negative is a refund, which is a different record
 * with its own ref namespace.
 */
export function readMoney(value) {
  if (value == null || value === '') return null;
  const amount = typeof value === 'number'
    ? value
    : Number.parseFloat(clean(value).replace(/[^0-9.\-]/g, ''));
  if (!Number.isFinite(amount) || amount <= 0) return null;
  return Math.round(amount * 100) / 100;
}

/** An ISO date, or '' — a wrong date puts a label outside every match window. */
export function readDate(value) {
  const text = clean(value);
  if (!text) return '';
  const iso = text.match(/^(\d{4}-\d{2}-\d{2})/);
  if (iso) return iso[1];
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? '' : parsed.toISOString().slice(0, 10);
}

function candidate(fields) {
  const trackingNumber = normalizeTrackingNumber(fields.trackingNumber);
  return {
    trackingNumber,
    // The number's own shape is a better carrier witness than a source's label,
    // and carrierFromTracking answers '' rather than guessing wrong.
    carrier: carrierFromTracking(trackingNumber) || clean(fields.carrier),
    date: readDate(fields.date),
    amount: readMoney(fields.amount),
    currency: (clean(fields.currency) || 'CAD').toUpperCase(),
    recipientName: clean(fields.recipientName),
    recipientPostal: clean(fields.recipientPostal),
    description: clean(fields.description),
    source: clean(fields.source),
    reference: clean(fields.reference),
    receipt: clean(fields.receipt),
  };
}

/**
 * One Canada Post shipment, as the carrier describes it.
 *
 * Three calls feed this: the shipment itself, `/details` for who it went to,
 * and `/receipt` for what was actually charged. The receipt is documented as
 * covering shipments "paid by credit card and did not require a manifest", so
 * a contract shipment has no receipt to read — `/price` is passed in as the
 * fallback, and when neither answers, the amount stays null rather than
 * becoming a plausible guess from the rate table.
 */
export function normalizeCanadaPostShipment(shipment = {}, details = {}, receipt = {}, price = {}) {
  const ship = shipment || {};
  const detail = details?.['shipment-detail'] || details?.shipmentDetail || details || {};
  const destination = detail.destination || detail.recipient || {};
  const address = destination.addressDetails || destination['address-details'] || {};
  const cc = receipt?.ccReceiptDetails || receipt?.['cc-receipt-details'] || {};

  return candidate({
    trackingNumber: ship.trackingPin || ship['tracking-pin'] || ship.trackingNumber || '',
    carrier: 'Canada Post',
    date: cc.authTimestamp || ship.createdAt || ship['created-at'] || ship.date || '',
    amount: cc.chargeAmount ?? price?.dueAmount ?? price?.['due-amount'] ?? null,
    currency: cc.currency || 'CAD',
    recipientName: destination.name || destination.company || '',
    recipientPostal: address.postalZipCode || address['postal-zip-code'] || '',
    description: 'Canada Post shipping label',
    source: 'canadapost',
    reference: ship.shipmentId || ship['shipment-id'] || ship.id || '',
  });
}

/**
 * One carrier confirmation email, as the AI read it.
 *
 * The parse is the same one the receipt scanner already uses, so its output is
 * whatever that returns; everything here is defensive about field naming
 * because an email is a document and documents vary. The attachment, when
 * there is one, is the label PDF and becomes the receipt on the expense.
 */
export function normalizeShippingEmail(parsed = {}, { messageId = '', receipt = '' } = {}) {
  const p = parsed || {};
  return candidate({
    trackingNumber: p.trackingNumber || p.tracking || p.trackingPin || '',
    carrier: p.carrier || p.merchant || p.vendor || '',
    date: p.date || p.shippedAt || '',
    amount: p.amount ?? p.total ?? p.cost ?? null,
    currency: p.currency || 'CAD',
    recipientName: p.recipientName || p.recipient || p.shipTo || '',
    recipientPostal: p.recipientPostal || p.postal || p.postalCode || '',
    // Left blank when the email said nothing, rather than defaulted to
    // "Shipping label" here: buildPostageExpense names it from the carrier and
    // tracking number, which is more use on a ledger row than a generic phrase.
    description: clean(p.desc || p.description),
    source: 'email',
    reference: clean(messageId),
    receipt,
  });
}

/**
 * What makes two records the same label.
 *
 * The tracking number, whenever there is one: it is issued by the carrier, it
 * is on the email and on the shipment and on the PDF, and it is the only thing
 * all three sources agree about verbatim. Without one, fall back to the source's
 * own id, and only then to content — two different labels almost never agree on
 * carrier, date and amount at once, and the fallback is only reached for a
 * document that named no tracking number at all.
 */
export function postageCandidateKey(entry = {}) {
  const tracking = normalizeTrackingNumber(entry.trackingNumber);
  if (tracking) return `track:${tracking}`;
  const reference = clean(entry.reference);
  if (reference) return `${clean(entry.source) || 'src'}:${reference}`;
  return `x:${clean(entry.carrier)}|${clean(entry.date)}|${entry.amount ?? ''}`;
}

/** The ledger `ref`, in the same namespaced shape `shippo:<id>` established. */
export function postageCandidateRef(entry = {}) {
  const tracking = normalizeTrackingNumber(entry.trackingNumber);
  if (tracking) return `postage:${tracking}`;
  const reference = clean(entry.reference);
  return reference ? `postage-${clean(entry.source) || 'src'}:${reference}` : '';
}

/**
 * Fold two records of the same label into the better one.
 *
 * Field by field rather than wholesale, because the better source is not better
 * at everything: Canada Post knows the amount and the recipient, but an email
 * carries the PDF that Canada Post's JSON does not. Taking the higher-ranked
 * record whole would throw the receipt away.
 *
 * A known value never loses to a blank, whichever source it came from — that is
 * the rule that lets an authoritative amount land on a record an email opened,
 * and stops a sparse authoritative record erasing what was already read.
 */
export function mergePostageCandidates(existing, incoming) {
  if (!existing) return incoming || null;
  if (!incoming) return existing;

  const existingRank = POSTAGE_SOURCE_RANK[existing.source] || 0;
  const incomingRank = POSTAGE_SOURCE_RANK[incoming.source] || 0;
  const preferred = incomingRank >= existingRank ? incoming : existing;
  const other = preferred === incoming ? existing : incoming;

  const pick = (field) => {
    const first = preferred[field];
    const second = other[field];
    if (first == null || first === '') return second == null ? first : second;
    return first;
  };

  return {
    trackingNumber: pick('trackingNumber'),
    carrier: pick('carrier'),
    date: pick('date'),
    amount: pick('amount'),
    currency: pick('currency'),
    recipientName: pick('recipientName'),
    recipientPostal: pick('recipientPostal'),
    description: pick('description'),
    source: preferred.source,
    reference: pick('reference'),
    receipt: pick('receipt'),
  };
}

/** A label filed with no readable amount. Shown, never silently zeroed. */
export function needsAmount(entry = {}) {
  return entry.amount == null;
}

/**
 * The expense row, in the shape the rest of the app already reads.
 *
 * Deliberately the same fields processShippoTxToExpense produces, because the
 * shipping P&L, the carrier scorecard, the reconciliation worklist and the
 * order's own shipping summary all read that one shape. `recipientName` and
 * `recipientPostal` are the part that matters most: without them the matcher
 * has nothing to work with, and a hand-typed expense's absence of them is why
 * linking has always been manual.
 *
 * `amountUnknown` is the flag, and `amount` stays 0 alongside it so every
 * existing total keeps arithmetic that works — a null in an accumulator would
 * turn a whole column into NaN. The flag is what the UI reads; the zero is
 * never presented as the price.
 */
export function buildPostageExpense(entry = {}, { id = Date.now() } = {}) {
  const unknown = needsAmount(entry);
  const carrier = clean(entry.carrier);
  const tracking = normalizeTrackingNumber(entry.trackingNumber);
  return {
    id,
    desc: clean(entry.description)
      || `${carrier || 'Shipping'} label${tracking ? ` #${tracking}` : ''}`,
    cat: 'Shipping & Postage',
    currency: entry.currency || 'CAD',
    amount: unknown ? 0 : entry.amount,
    origCurrency: entry.currency || 'CAD',
    origAmount: unknown ? 0 : entry.amount,
    baseAmount: unknown ? 0 : entry.amount,
    amountUnknown: unknown,
    date: entry.date,
    ref: postageCandidateRef(entry),
    receipt: clean(entry.receipt),
    trackingNumber: tracking,
    trackingCarrier: carrier,
    recipientName: clean(entry.recipientName),
    recipientPostal: clean(entry.recipientPostal),
    postageSource: clean(entry.source),
    trip: '',
  };
}
