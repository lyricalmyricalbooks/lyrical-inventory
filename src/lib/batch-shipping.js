// Buying labels for several orders at once, without buying a wrong one.
//
// The single-order rate form leans on the publisher's eye at every step: they
// see the address, the box, the rates, and pick one. A batch removes that eye,
// so everything it used to catch has to be checked here instead, and anything
// the checks cannot vouch for is left out rather than guessed at. An order the
// batch declines is not an error — it just goes through the normal form, where
// a person looks at it.
//
// Pure — no DOM, no network. The shipping tab gathers each order's address
// verdict, parcel plan, existing-label check and rates, and this decides.

import { addressValidationBlocker } from './address-verification.js';
import { normalizeShippingOrderNumber } from './shipping-reconciliation.js';

/** How far back an unshipped order is still worth offering. */
export const BATCH_LOOKBACK_DAYS = 60;

/**
 * Whether a history row is an order waiting to be shipped: a real, un-voided
 * sale with an order number and a street address, not yet marked shipped.
 */
export function isBatchCandidate(entry, now = new Date()) {
  if (!entry || entry.voided || entry.shipped) return false;
  if (String(entry.trackingNumber || '').trim()) return false;
  if (!normalizeShippingOrderNumber(entry.num)) return false;
  if (!String(entry.shipAddr1 || '').trim() || !String(entry.shipName || '').trim()) return false;
  const when = entry.date ? new Date(entry.date) : null;
  if (when && !Number.isNaN(when.getTime())) {
    const ageDays = (now.getTime() - when.getTime()) / 86400000;
    if (ageDays > BATCH_LOOKBACK_DAYS) return false;
  }
  return true;
}

/** The parcel for `qty` copies: the one-copy box, stacked. Same rule as the rate form. */
export function scaledParcel(specs, qty) {
  const copies = Math.max(1, parseInt(qty, 10) || 1);
  const round = n => parseFloat((Number(n) * copies).toFixed(2));
  return {
    length: Number(specs.length),
    width: Number(specs.width),
    height: round(specs.height),
    distance_unit: specs.dim_unit || 'in',
    weight: round(specs.weight),
    mass_unit: specs.weight_unit || 'lb',
  };
}

/** Customs for a batch parcel. Mirrors the rate form's declaration, minus its manual overrides. */
export function batchCustomsDeclaration({ signer, originCountry = 'CA', destCountry, parcel, qty, unitValue, description, hsCode = '490199' }) {
  const copies = Math.max(1, parseInt(qty, 10) || 1);
  const perCopyWeight = Math.max(0.01, Math.floor((Number(parcel.weight) / copies) * 100) / 100);
  return {
    certify: true,
    certify_signer: signer,
    contents_type: 'MERCHANDISE',
    contents_explanation: 'Printed books',
    non_delivery_option: 'RETURN',
    incoterm: destCountry === 'US' ? 'DDP' : 'DDU',
    eel_pfc: 'NOEEI_30_37_a',
    items: [{
      description: description || 'Printed books',
      quantity: copies,
      net_weight: perCopyWeight.toFixed(2),
      mass_unit: parcel.mass_unit,
      value_amount: (Math.max(0.01, Number(unitValue) || 0) * copies).toFixed(2),
      value_currency: 'CAD',
      origin_country: originCountry,
      tariff_number: hsCode,
    }],
  };
}

/**
 * The cheapest usable rate. Ties go to the faster service, so saving nothing
 * never costs a day.
 */
export function pickCheapestRate(rates = []) {
  const usable = (Array.isArray(rates) ? rates : [])
    .filter(r => r && r.object_id && Number.isFinite(parseFloat(r.amount)) && parseFloat(r.amount) > 0);
  if (!usable.length) return null;
  const days = r => (Number.isFinite(Number(r.estimated_days)) ? Number(r.estimated_days) : 99);

  // ⚡ Bolt Optimization: Use O(N) imperative loop instead of O(N log N) sort()[0] to find cheapest rate
  let bestRate = null;
  let minAmount = Infinity;
  let minDays = Infinity;

  for (let i = 0; i < usable.length; i++) {
    const r = usable[i];
    const amount = parseFloat(r.amount);
    const d = days(r);

    if (amount < minAmount) {
      minAmount = amount;
      minDays = d;
      bestRate = r;
    } else if (amount === minAmount && d < minDays) {
      minDays = d;
      bestRate = r;
    }
  }

  return bestRate;
}

/**
 * Whether the origin address is complete enough to put on a label. A blank
 * sender field would otherwise be filled from placeholders downstream.
 */
export function originBlocker(origin = {}) {
  const missing = [['name', 'your name'], ['street1', 'street'], ['city', 'city'], ['zip', 'postal code']]
    .filter(([key]) => !String(origin[key] || '').trim())
    .map(([, label]) => label);
  return missing.length ? `Your return address is missing ${missing.join(', ')} — fill it in on the Shipping form and tick "Save as default".` : '';
}

/**
 * Checks everything that can be known before asking Shippo anything. Returns a
 * reason the order should go through the normal form instead, or ''.
 */
export function preflightBlocker({ address, plan, existing, originCountry = 'CA', phone = '' }) {
  if (existing) {
    return existing.tracking
      ? `Already has a label (tracking ${existing.tracking}).`
      : 'Already has a label in your expenses.';
  }
  const addressProblem = addressValidationBlocker(address);
  if (addressProblem) return addressProblem;
  if (!plan || !plan.presetBookId) return 'Couldn’t tell which book is in this order, so the box size is unknown.';
  if (!plan.autoSafe) {
    return plan.confidence === 'mixed'
      ? 'More than one title in the box — check the weight in the form.'
      : 'Not sure which book this is — check it in the form.';
  }
  if (address.country && address.country !== originCountry) {
    if (!String(phone || '').trim()) return 'International parcels need the customer’s phone number.';
    if (!(plan.customsUnitValue > 0)) return 'No customs value for this book.';
  }
  return '';
}

const WORD_FORMS = {
  street: 'st', avenue: 'ave', road: 'rd', drive: 'dr', boulevard: 'blvd', lane: 'ln',
  court: 'ct', crescent: 'cres', place: 'pl', apartment: 'apt', suite: 'ste', unit: 'unit',
  north: 'n', south: 's', east: 'e', west: 'w', highway: 'hwy', terrace: 'terr',
};

function comparable(value) {
  return String(value || '').toLowerCase()
    .replace(/[^a-z0-9 ]+/g, ' ')
    .split(/\s+/).filter(Boolean)
    .map(word => WORD_FORMS[word] || word)
    .join('');
}

/**
 * A correction that only changes how the address is written — capitals,
 * punctuation, "Street" for "St", a ZIP+4 extension — says nothing about
 * whether the parcel arrives, and should not hold an order back.
 */
export function isCosmeticCorrection(correction = {}) {
  const from = comparable(correction.from);
  const to = comparable(correction.to);
  if (from === to) return true;
  return correction.field === 'zip' && !!from && to.startsWith(from);
}

/**
 * Whether Shippo's address check is clean enough to buy without a person
 * looking. Stricter than the single-order form on purpose: a suggested
 * correction or a partial match means somebody should read it.
 */
export function addressVerdictBlocker(result) {
  if (!result) return 'Couldn’t check the address.';
  const status = String(result.status || '').toLowerCase();
  if (status === 'invalid') {
    return `Shippo says this address doesn’t exist${result.reasons?.[0]?.description ? ` — ${result.reasons[0].description}` : ''}.`;
  }
  const real = (result.corrections || []).filter(c => !isCosmeticCorrection(c));
  if (real.length) {
    return `Shippo suggests fixing the ${real.map(c => String(c.label || c.field).toLowerCase()).join(', ')} — review it in the form.`;
  }
  if (status !== 'valid' && !(status === 'partially_valid' && !real.length)) return 'Shippo couldn’t fully confirm this address — check it in the form.';
  return '';
}

/** Total of the rates about to be bought, per currency, e.g. "$42.10 CAD". */
export function describeBatchTotal(rows = []) {
  const byCurrency = new Map();
  rows.forEach(row => {
    if (!row?.rate) return;
    const cur = String(row.rate.currency || 'CAD').toUpperCase();
    byCurrency.set(cur, (byCurrency.get(cur) || 0) + (parseFloat(row.rate.amount) || 0));
  });
  return Array.from(byCurrency, ([cur, sum]) => `$${sum.toFixed(2)} ${cur}`).join(' + ') || '$0.00';
}

function escapeAttr(value) {
  return String(value || '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
}

/** Whether a label link is an image a web page can print, rather than a PDF. */
export function isImageLabel(url) {
  return /\.(png|jpe?g|gif)(\?|#|$)/i.test(String(url || ''));
}

/**
 * One printable page holding every label, one label per 4×6 sheet, which
 * prints itself once all the pictures have loaded. PDF labels can't be
 * placed on a page like this, so they're listed as links at the top instead.
 */
export function buildLabelPrintPage(labels = []) {
  const images = labels.filter(l => isImageLabel(l.url));
  const others = labels.filter(l => l.url && !isImageLabel(l.url));
  const notice = others.length
    ? `<div class="note">These ${others.length === 1 ? 'label is a PDF' : `${others.length} labels are PDFs`} and must be printed on ${others.length === 1 ? 'its' : 'their'} own: ${others.map(l => `<a href="${escapeAttr(l.url)}" target="_blank" rel="noopener">${escapeAttr(l.orderNumber)}</a>`).join(', ')}</div>`
    : '';
  const pages = images.map(l => `<div class="sheet"><img src="${escapeAttr(l.url)}" alt="Shipping label for ${escapeAttr(l.orderNumber)}"></div>`).join('');
  return `<!doctype html><html><head><meta charset="utf-8"><title>Shipping labels (${images.length})</title>
<style>
@page { size: 4in 6in; margin: 0; }
html, body { margin: 0; padding: 0; background: #fff; color: #000; font: 14px system-ui, sans-serif; }
.note { padding: 12px 16px; background: #fff4d6; border-bottom: 1px solid #e0c060; }
.sheet { width: 4in; height: 6in; display: flex; align-items: center; justify-content: center; page-break-after: always; break-after: page; overflow: hidden; }
.sheet:last-child { page-break-after: auto; break-after: auto; }
.sheet img { max-width: 100%; max-height: 100%; }
@media print { .note { display: none; } }
</style></head><body>${notice}${pages}
<script>
(function () {
  var imgs = Array.prototype.slice.call(document.images);
  var left = imgs.length;
  function done() { if (--left <= 0) setTimeout(function () { window.print(); }, 200); }
  if (!left) return;
  imgs.forEach(function (img) { if (img.complete) done(); else { img.onload = done; img.onerror = done; } });
})();
</script></body></html>`;
}
