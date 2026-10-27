/**
 * Turning a refused shipment into something the shop owner can act on.
 *
 * A Canada Post rejection carries a code and a description written for a
 * developer — "Mandatory field missing: destination postal code". Shown raw, it
 * reads to the owner as though they typed something wrong, and they go looking
 * through their address book for a mistake that is not there.
 *
 * There are really two different failures wearing the same clothes:
 *
 *   1. Something the owner CAN fix — a blank postal code, a parcel over the
 *      weight limit, an address Canada Post will not deliver to. Name the box
 *      to go and fix.
 *
 *   2. Something the owner CANNOT fix — this app describing the parcel with a
 *      field name Canada Post does not recognise. Until the Shipping API's
 *      OpenAPI definition is committed (see docs/getting-the-shipping-api-spec.md)
 *      the request body is derived from the previous API, so this is the
 *      likeliest first live failure. Sending the owner to check their address
 *      for this one wastes their afternoon.
 *
 * Telling those apart is the whole job of this file.
 */

import { classifyCanadaPostFailure, parseCanadaPostMessages } from './canadapost-errors.js';

/**
 * The parts of a shipment the owner actually controls, and where each one
 * lives on screen.
 *
 * Matched against Canada Post's description text. Order matters: the more
 * specific patterns come first, so "destination postal code" is not claimed by
 * the looser postal-code rule.
 */
const OWNER_FIXABLE_FIELDS = [
  { test: /(destination|receiver|recipient|delivery)[^.]*\b(postal|zip)/i, where: "the customer's postal code", panel: 'Destination' },
  { test: /(sender|origin|return|from)[^.]*\b(postal|zip)/i, where: 'your own postal code', panel: 'Origin' },
  { test: /(destination|receiver|recipient|delivery)[^.]*\b(address|street|city|province|state)/i, where: "the customer's address", panel: 'Destination' },
  { test: /(sender|origin|return|from)[^.]*\b(address|street|city|province|state)/i, where: 'your own address', panel: 'Origin' },
  { test: /(destination|receiver|recipient)[^.]*\b(phone|voice|telephone)/i, where: "the customer's phone number", panel: 'Destination' },
  { test: /(sender|origin|return)[^.]*\b(phone|voice|telephone)/i, where: 'your own phone number', panel: 'Origin' },
  { test: /\bweights?\b/i, where: "the parcel's weight", panel: 'Parcel specifications' },
  { test: /\b(dimensions?|lengths?|widths?|heights?|sizes?)\b/i, where: "the parcel's size", panel: 'Parcel specifications' },
  { test: /\b(postal|zip)\s*codes?\b/i, where: 'a postal code', panel: 'Origin or Destination' },
  { test: /\b(address(es)?|cities|city|provinces?|states?)\b/i, where: 'an address', panel: 'Origin or Destination' },
  { test: /\b(countr(y|ies))\b/i, where: 'the destination country', panel: 'Destination' },
  { test: /\b(service\s*codes?|services?)\b/i, where: 'the shipping service', panel: 'the rates list' },
  { test: /\b(customs|declarations?|tariffs?|hs\s*codes?)\b/i, where: 'the customs details', panel: 'Customs' },
];

/**
 * Wording that says the SHAPE of the request was wrong rather than its contents.
 *
 * These are the phrases Canada Post uses when a field is not one it knows, or
 * sits somewhere it did not expect — which is exactly what a wrong field map
 * produces, and never what a mistyped address produces.
 */
const SHAPE_MISMATCH = /\b(unknown|unexpected|unrecognis|unrecogniz|not\s+(a\s+)?valid\s+(field|element|property)|invalid\s+(request|schema|structure|format|element)|schema|malformed|cannot\s+be\s+parsed|no\s+such\s+(field|element))\b/i;

/** Find the first owner-fixable field a description names. */
function matchOwnerField(description) {
  const text = String(description || '');
  if (!text) return null;
  return OWNER_FIXABLE_FIELDS.find(field => field.test.test(text)) || null;
}

/**
 * Diagnose a refused Create Shipment.
 *
 * Returns the classification plus one plain sentence to put on screen. Nothing
 * here retries or throws — the caller decides that, and it needs the reason
 * more than it needs a decision made for it.
 */
export function diagnoseShipmentRejection({ status = 0, body = '' } = {}) {
  const failure = classifyCanadaPostFailure({ status, body });
  const messages = parseCanadaPostMessages(body);
  const description = messages.find(m => m.description)?.description || failure.detail || '';
  const code = messages.find(m => m.code)?.code || '';

  const base = {
    code: String(code || ''),
    description: String(description || ''),
    category: failure.category,
    retryable: failure.retryable,
    messages,
  };

  // Only a validation-range rejection is ambiguous between the two failures.
  // Anything else — auth, throttling, an outage, a missing payment method —
  // already has a clear owner-facing summary from the classifier.
  if (failure.category !== 'validation') {
    return { ...base, kind: failure.category, ownerMessage: failure.summary };
  }

  if (SHAPE_MISMATCH.test(description)) {
    return {
      ...base,
      kind: 'field-mapping',
      ownerMessage:
        'Canada Post refused this label because the app described the parcel in wording it did not recognise. '
        + 'This is not something you typed wrong, and checking the address will not fix it. '
        + 'The app needs the label instruction sheet from your Canada Post developer account — '
        + 'see the "Getting the Canada Post label instruction sheet" guide. Nothing was bought and nothing was charged.',
    };
  }

  const field = matchOwnerField(description);
  if (field) {
    return {
      ...base,
      kind: 'fixable',
      ownerMessage:
        `Canada Post could not accept this parcel: ${field.where} is missing or not one they recognise. `
        + `Check the ${field.panel} panel and try again. Nothing was bought and nothing was charged.`,
    };
  }

  // A validation rejection naming nothing the owner controls is, on balance,
  // the mapping gap again — but say so honestly rather than asserting it, and
  // keep Canada Post's own words so the cause is not lost.
  return {
    ...base,
    kind: 'unclear',
    ownerMessage:
      'Canada Post refused this label and the reason does not point at anything on the shipping form. '
      + 'It is most likely that the app is describing the parcel in wording they do not expect, which needs '
      + 'the label instruction sheet from your Canada Post developer account. '
      + `Canada Post said: "${description || 'no reason given'}". Nothing was bought and nothing was charged.`,
  };
}

/**
 * The same diagnosis as one sentence, for a toast or a thrown error.
 *
 * The code and description are appended in brackets rather than dropped: the
 * owner does not need them, but they are the first thing anyone helping will
 * ask for, and a screenshot is usually all that survives of a failure.
 */
export function describeShipmentRejection({ status = 0, body = '' } = {}) {
  const diagnosis = diagnoseShipmentRejection({ status, body });
  const reference = diagnosis.code || diagnosis.description
    ? ` (Canada Post ${diagnosis.code || 'error'}${diagnosis.description ? `: ${diagnosis.description}` : ''})`
    : '';
  return `${diagnosis.ownerMessage}${reference}`;
}
