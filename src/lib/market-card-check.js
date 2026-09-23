// Do the register's card sales and the card reader agree?
//
// On a market day a card sale can be written down twice over: rung up in the
// register as "Card", and taken on the card reader, which Stripe records. The
// two normally tell the same story. When they don't, it is one of two things
// worth knowing while the day is still fresh:
//
//   • a sale rung up as a card payment with no card payment behind it — the
//     tap failed, or it was really cash, and the money may never have arrived;
//   • a sale counted twice — rung up in the register AND recorded from the
//     reader, so the stock came off twice.
//
// Pure: the caller passes the day's ledger rows and the reader payments Stripe
// reported for that day.

const cents = (value) => Math.round((Number(value) || 0) * 100);

/** A register sale paid by card (not one recorded from the reader itself). */
function isRegisterCardRow(entry) {
  const note = String(entry?.notes || '').toLowerCase();
  return /^card\b/.test(note) && !/card reader/.test(note);
}

/**
 * Compare one day's register card sales with the reader payments of that day.
 *
 * One checkout can sell several books, which the register writes as one row
 * per book under the same sale number, while the customer paid once — so rows
 * are grouped by sale number and compared by their combined amount.
 */
export function checkMarketCards(rows = [], day = '', readerPayments = []) {
  const groups = new Map();
  (Array.isArray(rows) ? rows : []).forEach(({ bookId, entry }) => {
    if (!entry || entry.voided || entry.chan !== 'Book Fair') return;
    if (String(entry.date || '').slice(0, 10) !== day || !isRegisterCardRow(entry)) return;
    const key = entry.num || `${bookId}-${entry.qty}-${entry.price}`;
    const group = groups.get(key) || { num: entry.num || '', cents: 0, currency: '', qty: 0 };
    group.cents += cents(entry.payment?.amount ?? (Number(entry.qty) || 0) * (Number(entry.price) || 0));
    group.currency = group.currency || String(entry.payment?.currency || '').toUpperCase();
    group.qty += Number(entry.qty) || 0;
    groups.set(key, group);
  });

  const charges = (Array.isArray(readerPayments) ? readerPayments : [])
    .filter(p => p && !p.refunded)
    .map(p => ({ ...p, cents: cents(p.amount), currency: String(p.currency || '').toUpperCase(), used: false }));

  const missing = [];
  const doubled = [];
  groups.forEach(group => {
    const match = charges.find(c => !c.used && c.cents === group.cents
      && (!group.currency || !c.currency || c.currency === group.currency));
    if (!match) { missing.push(group); return; }
    match.used = true;
    // The reader payment was ALSO turned into a sale of its own.
    if (match.recorded) doubled.push({ ...group, chargeId: match.id });
  });
  return { missing, doubled };
}

/** One or two sentences for the morning-after card, or '' when they agree. */
export function describeMarketCards({ missing = [], doubled = [] } = {}) {
  const parts = [];
  if (missing.length) {
    const total = missing.reduce((sum, g) => sum + g.cents, 0) / 100;
    parts.push(`${missing.length === 1 ? 'One sale was' : `${missing.length} sales were`} rung up as card but no matching card payment arrived (${total.toFixed(2)} in all) — check it went through, or whether it was cash.`);
  }
  if (doubled.length) {
    parts.push(`${doubled.length === 1 ? 'One card sale looks' : `${doubled.length} card sales look`} recorded twice — once in the register and once from the card reader. Void one of each pair.`);
  }
  return parts.join(' ');
}
