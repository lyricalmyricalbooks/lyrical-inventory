// Card payments that can become sales without anyone pressing Record.
//
// WHY THIS EXISTS
// A customer paying by scanning a book's payment QR code — at a fair table, or
// from the printed sales tracker — pays through a Stripe link the app itself
// made, tagged with the book it sells. The app has always known which book that
// was, and still waited for the publisher to open the Stripe worklist and
// confirm it. Until she did, stock and revenue were both wrong.
//
// This decides which of those payments can be recorded on their own, and says
// why the others cannot. Pure — no ledger, no network — so the rules can be
// tested directly; main.js does the recording, through the same function the
// worklist's Record button uses.

/** A sale this large is unusual enough that a person should confirm it. */
export const MAX_AUTO_QTY = 20;

const REASONS = {
  'no-book': 'A card payment came in without saying which book it was for',
  'maybe-rung-up': 'It matches a sale already rung up by hand, so it may be the same sale',
  currency: 'It was paid in a different currency from the book’s price',
  amount: 'The amount isn’t a whole number of copies at the book’s price',
  'no-price': 'The book has no price set',
  'too-many': 'It’s an unusually large order',
};

export function stripeReviewReasonText(reason) {
  return REASONS[reason] || 'It needs you to check it';
}

/**
 * What to do with one Stripe payment.
 *
 *   { action: 'record', bookId, qty }  — record it now.
 *   { action: 'review', reason }       — leave it in the worklist and say why.
 *   { action: 'skip' }                 — not this feature's business.
 *
 * `autoSince` is the moment automatic recording was first switched on. Payments
 * before it are left alone: the worklist may hold months of charges the
 * publisher entered by hand long ago, and recording those now would count every
 * one of them twice.
 */
export function stripeSalePlan(payment = {}, {
  classification = {},
  book = null,
  bookCurrency = '',
  likelyLogged = false,
  autoSince = 0,
} = {}) {
  if (!payment || payment.refunded || payment.disputed) return { action: 'skip' };
  if (classification.kind !== 'direct') return { action: 'skip' };
  if (!(Number(payment.created) >= Number(autoSince || 0))) return { action: 'skip' };

  const bookId = classification.bookId || '';
  if (!bookId || !book) {
    // Only a card tapped in person is worth raising. Any other untagged charge
    // is somebody else's business (a website order, a donation) and already
    // sits in the worklist for whoever wants it.
    return payment.cardPresent ? { action: 'review', reason: 'no-book' } : { action: 'skip' };
  }
  if (likelyLogged) return { action: 'review', reason: 'maybe-rung-up' };

  const currency = String(payment.currency || '').toUpperCase();
  if (bookCurrency && currency !== String(bookCurrency).toUpperCase()) return { action: 'review', reason: 'currency' };

  const price = Number(book.listPrice);
  if (!(price > 0)) return { action: 'review', reason: 'no-price' };
  const copies = Number(payment.amount) / price;
  const qty = Math.round(copies);
  if (qty < 1 || Math.abs(copies - qty) * price > 0.01) return { action: 'review', reason: 'amount' };
  if (qty > MAX_AUTO_QTY) return { action: 'review', reason: 'too-many' };
  return { action: 'record', bookId, qty };
}

/** What the alert says once a sweep has recorded what it could. */
export function describeCardSales(outcomes = []) {
  const list = (Array.isArray(outcomes) ? outcomes : []).filter(Boolean);
  const recorded = list.filter(o => o.action === 'record');
  const review = list.filter(o => o.action === 'review');
  if (!recorded.length && !review.length) return { count: 0, title: '', detail: '', needsYou: false };

  const parts = [];
  if (recorded.length === 1) {
    const [o] = recorded;
    parts.push(`${o.qty} × ${o.bookTitle} paid by card and recorded. ${o.stockLeft} left in stock.`);
  } else if (recorded.length) {
    const copies = recorded.reduce((sum, o) => sum + (o.qty || 0), 0);
    parts.push(`${recorded.length} card payments recorded — ${copies} cop${copies === 1 ? 'y' : 'ies'} in all.`);
  }
  if (review.length === 1) {
    parts.push(`${stripeReviewReasonText(review[0].reason)}.`);
  } else if (review.length) {
    parts.push(`${review.length} more need you to check them.`);
  }

  return {
    count: list.length,
    needsYou: review.length > 0,
    title: recorded.length
      ? (recorded.length === 1 ? 'Card sale recorded' : `${recorded.length} card sales recorded`)
      : (review.length === 1 ? 'A card payment needs you' : `${review.length} card payments need you`),
    detail: parts.join(' '),
  };
}

// ─── A card-reader tap that names its book ────────────────────────────────
//
// A tap on a card reader reaches the app as an amount and a description, and
// nothing else. The description is the one field the seller can type into at
// the moment of sale (the Stripe app's "Add description"), so a title typed
// there is how a reader sale can say which book it was. Exactly one catalogue
// title has to appear in it; a description naming two books, or none, is not
// read as either.

const normalize = (value) => String(value ?? '')
  .toLowerCase()
  .normalize('NFD')
  .replace(/[̀-ͯ]/g, '')
  .replace(/[^a-z0-9]+/g, ' ')
  .trim();

/** The one catalogue book a payment description names, or '' when none or several. */
export function bookNamedIn(text, books = {}) {
  const haystack = ` ${normalize(text)} `;
  if (!haystack.trim()) return '';
  const hits = new Set();
  Object.values(books || {}).forEach(book => {
    const title = normalize(book?.title);
    // Very short titles would match inside ordinary words.
    if (!book?.id || title.length < 4) return;
    if (haystack.includes(` ${title} `)) hits.add(book.id);
  });
  return hits.size === 1 ? [...hits][0] : '';
}

// ─── A recorded sale whose money went back ────────────────────────────────

/**
 * Which refunds reach a sale this app recorded from a Stripe payment.
 *
 * `sales` are the ledger rows that came from Stripe, each with the charge it
 * was recorded from. A full refund is offered for reversal; a partial one is
 * only mentioned, because the copies may well have stayed sold (a discount
 * given after the fact, a postage refund) and guessing how many came back
 * would be inventing a number. A refund already raised is not raised again.
 */
export function refundsToRaise(refunds = [], sales = []) {
  const byCharge = new Map();
  (Array.isArray(sales) ? sales : []).forEach(sale => {
    if (sale?.chargeId && !sale.voided) byCharge.set(sale.chargeId, sale);
  });
  const out = [];
  const seen = new Set();
  (Array.isArray(refunds) ? refunds : []).forEach(refund => {
    if (!refund || refund.status === 'failed' || refund.status === 'canceled') return;
    const sale = byCharge.get(refund.chargeId);
    if (!sale || seen.has(refund.chargeId)) return;
    if (sale.refundNoted) return;
    seen.add(refund.chargeId);
    const paid = Number(sale.paidAmount) || 0;
    const back = Number(refund.chargeRefundedTotal ?? refund.amount) || 0;
    const full = refund.fullyRefunded === true || (paid > 0 && back >= paid - 0.005);
    out.push({ ...sale, refundId: refund.id || '', refunded: back, full });
  });
  return out;
}

/** What the alert says about refunded sales. */
export function describeRefunds(items = []) {
  const list = (Array.isArray(items) ? items : []).filter(Boolean);
  const full = list.filter(item => item.full);
  const partial = list.filter(item => !item.full);
  if (!list.length) return { count: 0, title: '', detail: '', canReverse: false };

  const parts = [];
  if (full.length === 1) {
    const [s] = full;
    parts.push(`${s.qty} × ${s.bookTitle} was refunded in full. Reversing it puts ${s.qty === 1 ? 'the copy' : `the ${s.qty} copies`} back in stock and takes the sale out of your earnings.`);
  } else if (full.length) {
    const copies = full.reduce((sum, s) => sum + (Number(s.qty) || 0), 0);
    parts.push(`${full.length} card sales were refunded in full (${copies} cop${copies === 1 ? 'y' : 'ies'}). Reversing them puts the stock back and takes them out of your earnings.`);
  }
  if (partial.length) {
    parts.push(`${partial.length === 1 ? `Part of the ${partial[0].bookTitle} sale was` : `${partial.length} sales were partly`} refunded — check whether any copies came back.`);
  }
  return {
    count: list.length,
    title: full.length
      ? (full.length === 1 ? 'A card sale was refunded' : `${full.length} card sales were refunded`)
      : 'A card sale was partly refunded',
    detail: parts.join(' '),
    canReverse: full.length > 0,
    reverseLabel: full.length === 1 ? 'Reverse it' : `Reverse all ${full.length}`,
  };
}
