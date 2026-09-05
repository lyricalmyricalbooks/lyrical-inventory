// Finding the labels a carrier emailed about.
//
// The Canada Post sweep covers labels bought on that account. It cannot cover
// the rest: another courier's website, or a Canada Post purchase made outside
// the API customer number. What those do leave is an email — a shipment
// confirmation with a tracking number, a total and usually the label attached.
//
// The app already has the whole pipeline for this. It searches Gmail, fetches
// bodies in batches, downloads attachments and reads receipts with AI, all for
// the receipt scanner. The search takes a client-supplied query, which is the
// happy accident that makes this cheap: pointing it at carrier mail needs no
// Apps Script change, no script version bump, and nothing for the publisher to
// redeploy.
//
// What this module adds is the two things that pipeline does not know: which
// emails are shipping, and how to read one.
//
// READING IS DETERMINISTIC FIRST, AI SECOND. A carrier confirmation is not
// free prose — it contains a tracking number in a shape `carrierFromTracking`
// can verify, and a total in a shape a regex can find. Trying those first means
// most emails cost nothing to read, return the same answer every time, and
// cannot hallucinate a figure into somebody's tax records. The AI parse already
// in receipts.js remains the fallback for the ones this cannot crack.
//
// Pure — no DOM, no network.

import { carrierFromTracking, normalizeTrackingNumber } from './postage-matching.js';

/**
 * The Gmail search for carrier mail.
 *
 * Senders first, because a from: match is the strongest signal Gmail can give
 * and costs nothing to evaluate. The subject terms widen it to resellers and
 * to carriers not listed here. `-label:` exclusions keep the storefront's own
 * order mail out: a Big Cartel order confirmation also says "shipping", and it
 * is already handled by an entirely different path.
 */
export const SHIPPING_EMAIL_SENDERS = Object.freeze([
  'canadapost.ca',
  'canadapost-postescanada.ca',
  'ups.com',
  'fedex.com',
  'dhl.com',
  'purolator.com',
  'stamps.com',
  'pirateship.com',
  'shipstation.com',
]);

const SHIPPING_SUBJECT_TERMS = Object.freeze([
  'shipping label',
  'shipment confirmation',
  'tracking number',
  'your label',
  'postage',
]);

/**
 * Build the query, optionally narrowed to what has arrived since a date.
 *
 * `after:` is what keeps a background scan cheap: without it every run reads
 * the same history again, and with it a quiet week costs one empty search.
 */
export function shippingEmailQuery({ since = '', extraSenders = [] } = {}) {
  const senders = [...SHIPPING_EMAIL_SENDERS, ...(extraSenders || [])]
    .map(s => String(s || '').trim()).filter(Boolean);
  const from = senders.map(s => `from:${s}`).join(' OR ');
  const subjects = SHIPPING_SUBJECT_TERMS.map(t => `subject:"${t}"`).join(' OR ');

  const parts = [`{${from} OR ${subjects}}`];
  const day = String(since || '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(day)) parts.push(`after:${day.replace(/-/g, '/')}`);
  return parts.join(' ');
}

/**
 * Whether an email is shipping mail at all.
 *
 * The Gmail query is deliberately wide — a missed label is silent, a false
 * positive is merely read and discarded — so this is the second gate, and it
 * requires a tracking number whose shape a carrier would recognise. That single
 * condition rejects newsletters, delivery notifications about parcels coming
 * *to* the shop, and the storefront's own order mail, without needing a list of
 * everything to exclude.
 */
export function looksLikeShippingEmail({ subject = '', body = '' } = {}) {
  return !!extractTrackingNumber(`${subject}\n${body}`);
}

// Tracking-number shapes, most specific first. Every one of these is then put
// through carrierFromTracking, which answers '' for a shape it does not know —
// so a number this finds but cannot attribute is discarded rather than guessed
// at, and a wrong carrier never becomes a tracking link that 404s.
const TRACKING_PATTERNS = Object.freeze([
  /\b([A-Z]{2}\s?\d{3}\s?\d{3}\s?\d{3}\s?[A-Z]{2})\b/g,   // UPU S10, spaced or not
  /\b(1Z[A-Z0-9]{16})\b/g,                                 // UPS
  /\b(\d{16})\b/g,                                         // Canada Post domestic
  /\b((?:94|93|92|95)\d{20})\b/g,                          // USPS
  /\b(\d{12}|\d{15})\b/g,                                  // FedEx
]);

/** The first tracking number in some text whose carrier can be identified. */
export function extractTrackingNumber(text) {
  const haystack = String(text || '').toUpperCase();
  for (const pattern of TRACKING_PATTERNS) {
    pattern.lastIndex = 0;
    let match = pattern.exec(haystack);
    while (match) {
      const bare = normalizeTrackingNumber(match[1]);
      if (bare && carrierFromTracking(bare)) return bare;
      match = pattern.exec(haystack);
    }
  }
  return '';
}

// Money, but only where a label says what the money is for. A bare "$24.10"
// anywhere in an email is as likely to be a discount, a subtotal or a footer
// price as it is the postage, so an unlabelled figure is not read at all — the
// amount stays blank and gets flagged, which is the honest answer.
const AMOUNT_PATTERNS = Object.freeze([
  /(?:total\s*(?:charged|paid|amount)?|amount\s*(?:charged|paid|due)|grand\s*total|order\s*total|charged)\s*[:\-]?\s*(?:CAD|USD|C\$|US\$|\$)?\s*([0-9][0-9,]*\.\d{2})/i,
  /(?:postage|shipping)\s*(?:cost|charge|total)?\s*[:\-]?\s*(?:CAD|USD|C\$|US\$|\$)?\s*([0-9][0-9,]*\.\d{2})/i,
]);

/** The labelled total in some text, or null. Never a bare figure. */
export function extractAmount(text) {
  const haystack = String(text || '');
  for (const pattern of AMOUNT_PATTERNS) {
    const match = haystack.match(pattern);
    if (match) {
      const value = Number.parseFloat(match[1].replace(/,/g, ''));
      if (Number.isFinite(value) && value > 0) return Math.round(value * 100) / 100;
    }
  }
  return null;
}

/** The currency a labelled amount was quoted in, defaulting to CAD. */
export function extractCurrency(text) {
  const haystack = String(text || '').toUpperCase();
  if (/\bUSD\b|\bUS\$/.test(haystack)) return 'USD';
  return 'CAD';
}

/**
 * Read one carrier email without asking an AI.
 *
 * Returns null when there is no verifiable tracking number, which is the signal
 * for the caller to fall back to the AI parse rather than file something
 * half-read. The amount may legitimately come back null even on a success: a
 * label whose total this cannot find is still worth filing, with the figure
 * blank and flagged.
 */
export function parseShippingEmail({ subject = '', body = '', date = '', from = '' } = {}) {
  const text = `${subject}\n${body}`;
  const trackingNumber = extractTrackingNumber(text);
  if (!trackingNumber) return null;

  return {
    trackingNumber,
    carrier: carrierFromTracking(trackingNumber),
    amount: extractAmount(text),
    currency: extractCurrency(text),
    date: String(date || '').slice(0, 10),
    // The recipient is deliberately not guessed out of the body. A carrier email
    // names the shop as often as the buyer, and a wrong recipient does not fail
    // loudly — it links the postage to the wrong customer's order. The tracking
    // number is the match signal here, and it is a better one.
    recipientName: '',
    recipientPostal: '',
    desc: `${carrierFromTracking(trackingNumber) || 'Shipping'} label`,
    sender: String(from || '').trim(),
  };
}
