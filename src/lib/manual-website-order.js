// Recovering a website order that never made it into the app.
//
// The Gmail scan is the only way a Big Cartel order normally reaches the
// ledger. When a confirmation email is missed — filtered, deleted, or simply
// never parsed — the sale is invisible everywhere: no history row, no entry in
// the shipping portal's destination list, and no order to pick in the Shippo
// reconciliation worklist. The postage is stranded as "unmatched" forever,
// because the thing it is meant to match does not exist.
//
// A paid Shippo label is itself proof the order happened, and it already
// carries the recipient. This module turns that evidence into the missing
// order: it derives a sensible default order number, validates what the
// publisher fills in, and builds the Website history entry. It stays pure —
// no DOM, no state, no Firestore — so the rules are testable on their own and
// the ledger mutation lives with the rest of the ledger in main.js.

const ORDER_NUMBER_PATTERN = /^#?[A-Z0-9]+-[A-Z0-9-]+$/i;

const clean = (value) => String(value ?? '').trim();

/**
 * The reconciliation worklist stores a Shippo transaction reference of the form
 * `shippo:<object_id>`. The tail of that id is unique per label, so it makes a
 * stable, collision-free stand-in order number for a publisher who cannot find
 * the real Big Cartel number — and it still satisfies the LETTERS-DIGITS shape
 * every other part of the app expects from an order number.
 */
export function suggestRecoveredOrderNumber(expense = {}) {
  const seed = clean(expense.shippoTransactionId)
    || clean(expense.ref).replace(/^shippo:/i, '')
    || clean(expense.trackingUrl);
  const tail = seed.replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(-6);
  return tail ? `#RECOV-${tail}` : '';
}

/**
 * The shipping fields the Shippo label already knows, in the shape a Website
 * history entry uses. Older imports predate the full-address capture and only
 * carry name/email/postal; those simply come back blank rather than undefined,
 * so the intake form shows empty inputs instead of the string "undefined".
 */
export function recoveredOrderPrefill(expense = {}) {
  return {
    orderNumber: suggestRecoveredOrderNumber(expense),
    date: clean(expense.date),
    customer: clean(expense.recipientName),
    email: clean(expense.recipientEmail),
    addr1: clean(expense.recipientStreet1),
    addr2: clean(expense.recipientStreet2),
    city: clean(expense.recipientCity),
    province: clean(expense.recipientState),
    postal: clean(expense.recipientPostal),
    country: clean(expense.recipientCountry) || 'Canada',
    phone: clean(expense.recipientPhone),
  };
}

/**
 * Field-level validation for the intake form.
 *
 * `takenOrderNumbers` is every order number already in the ledger, normalized.
 * Re-using one would silently double-count stock against an existing sale, so
 * it is rejected outright rather than merged.
 *
 * Returns [] when the form is good; otherwise one `{ field, message }` per bad
 * field, in form order, so the caller can mark them all at once.
 */
export function validateRecoveredOrder(form = {}, { takenOrderNumbers = [] } = {}) {
  const errors = [];
  const number = clean(form.orderNumber);
  const taken = new Set(takenOrderNumbers.map(value => clean(value).toUpperCase().replace(/^#/, '')));

  if (!number) {
    errors.push({ field: 'orderNumber', message: 'Give this order a number so postage can link to it.' });
  } else if (!ORDER_NUMBER_PATTERN.test(number)) {
    errors.push({ field: 'orderNumber', message: 'Use the storefront format, e.g. GPWT-916083.' });
  } else if (taken.has(number.toUpperCase().replace(/^#/, ''))) {
    errors.push({ field: 'orderNumber', message: 'That order number is already in your ledger.' });
  }

  if (!clean(form.bookId)) {
    errors.push({ field: 'bookId', message: 'Choose which book was sold.' });
  }

  const qty = Number(form.qty);
  if (!Number.isFinite(qty) || qty < 1 || Math.floor(qty) !== qty) {
    errors.push({ field: 'qty', message: 'Enter a whole number of copies, at least one.' });
  }

  const price = Number(form.price);
  if (!Number.isFinite(price) || price < 0) {
    errors.push({ field: 'price', message: 'Enter the price paid per copy.' });
  }

  const shippingPaid = Number(form.shippingPaid ?? 0);
  if (!Number.isFinite(shippingPaid) || shippingPaid < 0) {
    errors.push({ field: 'shippingPaid', message: 'Enter what the customer paid for shipping, or zero.' });
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(clean(form.date))) {
    errors.push({ field: 'date', message: 'Pick the date the order was placed.' });
  }

  if (!clean(form.customer)) {
    errors.push({ field: 'customer', message: 'Enter the customer’s name.' });
  }

  return errors;
}

/**
 * The Website history entry for a recovered order.
 *
 * Deliberately the same shape applyOne() writes for a scanned Big Cartel order,
 * so every downstream reader — the history table, the shipping portal's
 * destination picker, the reconciliation matcher, the Sheets sync — treats it
 * as an ordinary website sale. The one difference is the note, which records
 * that this row was reconstructed from a paid label rather than parsed from an
 * order email.
 */
export function buildRecoveredOrderEntry(form = {}, { stockAfter = 0 } = {}) {
  const qty = Math.max(1, Math.floor(Number(form.qty) || 1));
  const price = Number(form.price) || 0;
  const number = clean(form.orderNumber).replace(/^#?/, '#').toUpperCase();
  return {
    num: number,
    chan: 'Website',
    qty,
    price,
    after: stockAfter,
    notes: clean(form.notes) || 'Recovered from postage',
    date: clean(form.date),
    shipName: clean(form.customer),
    shipEmail: clean(form.email),
    shipAddr1: clean(form.addr1),
    shipAddr2: clean(form.addr2),
    shipCity: clean(form.city),
    shipProvince: clean(form.province),
    shipPostal: clean(form.postal),
    shipCountry: clean(form.country) || 'Canada',
    shipPhone: clean(form.phone),
    shippingPaid: Number(form.shippingPaid) || 0,
    subtotal: price * qty,
    discountCode: '',
    discountAmount: 0,
    merchandisePaid: price * qty,
    shippingMethod: clean(form.shippingMethod),
    taxPaid: 0,
    totalPaid: price * qty + (Number(form.shippingPaid) || 0),
    discountSource: '',
    recoveredFromPostage: true,
    // Same deterministic id applyOne() derives, so the same recovery performed
    // on a second device produces one Sheets row rather than two.
    sheetsId: 'bc-' + number.replace(/^#/, '').replace(/[^A-Za-z0-9-]/g, ''),
  };
}
