// The publisher's "Settle up with your artist" card at the top of a book's
// dashboard: what you owe the artist (expenses they paid) on one side, what
// the artist owes you (sales they collected the money for) on the other, and
// the one figure that would settle both.
//
// When the book is in Settle up (profit sharing, money running both ways) the
// net is the Settle up panel's own figure, so the two can never disagree, and
// one recorded payment clears it. Otherwise each line is still settled on its
// own (Mark received, Settle by hand), and the net is the difference to aim
// for, said as such. Pure — no DOM, no app state — so the wording is testable.
import { roundCents, fmt } from './money.js';

// expenses:  [{ amount }]                — unpaid, non-gratuity expenses
// transfers: [{ amount, pending }]       — amount null when the price is missing
// settle:    describeArtistSettlement balance when Settle up is live, else null
export function settleDeskModel({ expenses = [], transfers = [], settle = null, cur = 'CAD', hasPayLink = false } = {}) {
  let oweTotal = 0;
  for (const e of expenses) oweTotal = roundCents(oweTotal + (Number(e.amount) || 0));
  let owedTotal = 0, waiting = 0, missing = 0;
  for (const t of transfers) {
    if (t.pending) { waiting++; continue; }
    if (t.amount == null) { missing++; continue; }
    owedTotal = roundCents(owedTotal + (Number(t.amount) || 0));
  }
  const show = expenses.length > 0 || transfers.length > 0;
  const money = n => fmt(n, cur);

  let direction, amount;
  if (settle) {
    direction = settle.direction;
    amount = roundCents(settle.amount || 0);
  } else {
    const net = roundCents(oweTotal - owedTotal);
    direction = net > 0.005 ? 'to-artist' : net < -0.005 ? 'to-publisher' : 'settled';
    amount = Math.abs(net);
  }
  const kicker = direction === 'to-artist' ? 'So you pay'
    : direction === 'to-publisher' ? 'So the artist sends you'
    : 'All square';

  const notes = [];
  if (settle) {
    notes.push(direction === 'settled'
      ? 'The two sides cancel out. Record it in Settle up to clear both.'
      : 'One payment covers both sides. Record it in Settle up when it has gone through.');
  } else if (expenses.length && owedTotal > 0.005) {
    notes.push(`Settle each line on its own: when the artist sends you their ${money(owedTotal)}, mark it received, and pay them back their expenses.`);
  } else if (expenses.length) {
    notes.push(`Pay the artist back for ${expenses.length === 1 ? 'this expense' : `these ${expenses.length} expenses`}, then mark ${expenses.length === 1 ? 'it' : 'them'} received.`);
  } else if (transfers.length) {
    notes.push('The artist collected this money. Mark it received once they send it, or settle it by hand.');
  }
  if (direction === 'to-artist' && !hasPayLink) notes.push("The artist hasn't added a payment link yet.");
  if (waiting) notes.push(`${waiting} more ${waiting === 1 ? 'sale needs' : 'sales need'} your approval before ${waiting === 1 ? 'it counts' : 'they count'}.`);
  if (missing) notes.push(`${missing} ${missing === 1 ? 'sale has' : 'sales have'} no price yet, so ${missing === 1 ? "it isn't" : "they aren't"} in this sum.`);

  return {
    show,
    owe: { total: oweTotal, count: expenses.length },
    owed: { total: owedTotal, count: transfers.length },
    direction, amount, kicker,
    value: direction === 'settled' ? money(0) : money(amount),
    note: notes.join(' '),
    inSettleUp: !!settle,
    // Asking for the link only helps while money is going to the artist.
    askForLink: direction === 'to-artist' && !hasPayLink,
    openLink: direction === 'to-artist' && hasPayLink,
  };
}

// One calm line under the card for the two things that can go wrong with a
// book's stock and costs, so they don't need their own alarm sections.
export function dashHeadsUp({ stock, threshold, breakEven = null, cur = 'CAD' } = {}) {
  const parts = [];
  if (Number.isFinite(stock) && Number.isFinite(threshold) && stock <= threshold) {
    parts.push(`Stock is low: ${stock} left, alert at ${threshold}.`);
  }
  if (breakEven && breakEven.remaining > 0.005) {
    parts.push(`Not broken even: ${fmt(breakEven.remaining, cur)} to go.`);
  }
  return parts;
}
