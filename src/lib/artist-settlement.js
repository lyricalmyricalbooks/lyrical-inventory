// One reversible, offline-safe record for both sides of an author's account.
import { calcArtistEarnings, describeArtistSettlement, appliedOffsets, appliedReceivablePayments, receivableOpen } from './earnings.js';
import { roundCents, fmt, getBookCurrencyCode, normalizeCurrencyCode } from './money.js';
import { keyRows, rowsByKey, stableStringify } from './merge-state.js';
import { recalculateBookStatsFromHistory } from './inventory.js';
import { expensesRepaidBySettlement, expensesWithSettlements, isGratuityExpense } from './receipt-storage.js';
import { needsSettleUp } from './settle-up-view.js';

// Receipts the author paid for this book and hasn't been paid back for, as the
// settlement counts them: the same rows the dashboard's "Expenses owed to
// artist" banner lists (approved, not gifted copies, not received by hand, not
// paid back by a standing settlement), with each amount in the book's
// currency so it can come off the net to the cent.
// An expense in the book's own currency counts as recorded. One in another
// currency counts only when the book is in CAD and the expense carries the CAD
// value stamped on the day it was paid; anything else is left out (and
// counted) rather than converted at a rate invented here.
export function openAuthorExpenses(state, book) {
  const bookCode = getBookCurrencyCode(book);
  const rows = [];
  let leftOut = 0;
  for (const e of expensesWithSettlements(state)) {
    if (!e || e.received || e.voided || e.pendingAuth || e.amountUnknown || isGratuityExpense(e) || e.id == null) continue;
    if (!((Number(e.amount) || 0) > 0)) continue;
    const amount = expenseInBookCurrency(e, bookCode);
    if (amount == null) { leftOut++; continue; }
    rows.push({ id: e.id, amount, desc: String(e.desc || ''), date: String(e.date || '') });
  }
  // Oldest first, the order they're itemised in.
  rows.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  return { rows, leftOut };
}

function expenseInBookCurrency(e, bookCode) {
  const raw = Number(e.amount) || 0;
  if (normalizeCurrencyCode(e.currency, bookCode) === bookCode) return roundCents(raw);
  if (bookCode === 'CAD' && Number(e.baseAmount) > 0) return roundCents(Number(e.baseAmount));
  if (bookCode === 'CAD' && Number(e.fxRate) > 0) return roundCents(raw * Number(e.fxRate));
  return null;
}

function fingerprint(book, state) {
  return stableStringify({
    currency: book.currency, tiers: book.profitTiers, productionCost: book.productionCost,
    hist: state.hist || [], payouts: state.artistPayouts || [],
    debts: state.artistReceivables || [], transfers: state.artistTransfers || [],
    // Only what the settlement reads from each expense, so attaching a receipt
    // photo to one doesn't make a preview look out of date.
    expenses: openAuthorExpenses(state, book),
  });
}

// Identical previews on two offline devices produce one mergeable row, rather
// than two independent royalty credits. This is identity, not a security hash.
function settlementId(value) {
  let a = 2166136261, b = 3339675911;
  for (let i = 0; i < value.length; i++) {
    a = Math.imul(a ^ value.charCodeAt(i), 16777619);
    b = Math.imul(b ^ value.charCodeAt(i), 2246822519);
  }
  return `settlement-${(a >>> 0).toString(16)}-${(b >>> 0).toString(16)}`;
}

// If two different offline snapshots settled the same account, neither knew
// about the other's payment. Keep both receipts, flag the overlap, and require
// review/Undo instead of silently pretending that both royalty credits fit.
export function artistSettlementIssues(state) {
  const active = (state.artistPayouts || []).filter(p => p.settlement && !p.voided);
  const byKey = rowsByKey('hist', state.hist || []);
  const issues = new Set();
  const expenseById = new Map((state.expenses || []).filter(Boolean).map(e => [String(e.id), e]));
  const repaid = expensesRepaidBySettlement(state.artistPayouts);
  for (const p of active) {
    if (p.settlement.heldSales.some(link => {
      const h = byKey.get(link.key);
      return !h || h.voided || h.artistPending || h.artistSettlementId !== p.id;
    })) issues.add(p.id);
    // An expense this settlement paid back that was also marked received by
    // hand (say, an e-Transfer recorded on another device while this one was
    // offline), or that another settlement paid back too, may have been paid
    // back twice. One whose amount was edited since was paid back the wrong
    // amount. One that has gone from the ledger can't be checked at all.
    if ((p.settlement.expenses || []).some(link => {
      const e = expenseById.get(String(link.id));
      if (!e || e.received || repaid.get(String(link.id))?.settlementId !== p.id) return true;
      const now = expenseInBookCurrency(e, normalizeCurrencyCode(p.settlement.cur, 'CAD'));
      return now == null || Math.abs(now - (Number(link.amount) || 0)) > 0.005;
    })) issues.add(p.id);
  }
  for (let i = 0; i < active.length; i++) {
    for (let j = i + 1; j < active.length; j++) {
      const a = active[i], b = active[j];
      if (!(a.settlement.priorPayoutIds || []).includes(b.id) && !(b.settlement.priorPayoutIds || []).includes(a.id)) {
        issues.add(a.id); issues.add(b.id);
      }
    }
  }
  return issues;
}

// The unpaid expenses going into the settle-up net right now (`ids`). Screens
// listing expenses show those as part of it rather than offering a payment of
// their own, which would pay them back twice. `publisherPays` is true when the
// net runs to the author, so the author's payment link is still the way the
// difference gets sent.
export function expensesInSettleUp(book, state) {
  const plan = book && state ? planArtistSettlement(book, state) : null;
  const live = !!plan && needsSettleUp(plan.balance);
  return {
    ids: new Set(live ? plan.expenses.map(e => String(e.id)) : []),
    publisherPays: live && plan.balance.direction === 'to-artist',
  };
}

export function planArtistSettlement(book, state) {
  const stats = calcArtistEarnings(book, state);
  if (!stats || state._loadFailed) return null;
  const owedExpenses = openAuthorExpenses(state, book);
  const balance = describeArtistSettlement(stats, { expenses: owedExpenses.rows, expensesLeftOut: owedExpenses.leftOut });
  const keys = keyRows('hist', state.hist || []);
  const heldSales = (state.hist || []).flatMap((h, i) =>
    !h.voided && !h.gratuity && h.artistPending && h.qty > 0 && h.price > 0
      ? [{ key: keys[i] }] : []);
  const heldKeys = new Set(heldSales.map(r => r.key));
  const heldNums = new Set((state.hist || []).filter((h, i) => heldKeys.has(keys[i])).map(h => h.num));
  const transfers = (state.artistTransfers || []).filter(t => heldNums.has(t.num));
  const offsets = appliedOffsets(state.artistPayouts, state.artistReceivables);
  const payments = appliedReceivablePayments(state.artistPayouts, state.artistReceivables);
  const receivablePayments = (state.artistReceivables || []).flatMap(r => {
    const amount = receivableOpen(r, roundCents((offsets.get(String(r.id)) || 0) + (payments.get(String(r.id)) || 0)));
    return amount > 0 ? [{ id: r.id, amount }] : [];
  });
  const signature = fingerprint(book, state);
  const error = artistSettlementIssues(state).size ? 'review' : '';
  return {
    id: settlementId(signature), signature, balance, heldSales,
    transfers: structuredClone(transfers), receivablePayments,
    expenses: owedExpenses.rows.map(({ id, amount }) => ({ id, amount })),
    // Earnings only: repaid expenses are money the author spent, not pay.
    royaltyCredit: roundCents(balance.heldShare + stats.owedToArtist),
    error,
    hasWork: !error && (heldSales.length > 0 || balance.otherDebt > 0 || stats.owedToArtist !== 0 || owedExpenses.rows.length > 0),
  };
}

export function artistSettlementStatement(book, balance, date, recorded = false) {
  const money = n => fmt(n, book.currency);
  const lines = [
    `Author settlement — ${book.title}`,
    `Date: ${date}`,
    `Money you collected and still hold: ${money(balance.heldGross)}`,
    `Your cut of those sales, which you keep: −${money(balance.heldShare)}`,
    `Publisher's cut of the held money: ${money(balance.publisherHeld)}`,
  ];
  if (balance.otherDebt > 0) lines.push(`Other money you owe the publisher: +${money(balance.otherDebt)}`);
  lines.push(`Remaining earnings the publisher owes you: −${money(balance.royaltiesOwed)}`);
  // Each receipt on its own line, so the author can tick them off against
  // their own records.
  const expenses = balance.expenses || [];
  if (balance.expensesOwed > 0) {
    lines.push(`Expenses you paid that the publisher owes you back: −${money(balance.expensesOwed)}`);
    for (const e of expenses) lines.push(`  · ${[e.date, e.desc || 'Expense'].filter(Boolean).join(' ')}: ${money(e.amount)}`);
  }
  if (balance.overpaid > 0) lines.push(`Previous overpayment being recovered: +${money(balance.overpaid)}`);
  if (balance.royaltiesCarried > 0) lines.push(`Earnings from newer sales, still owed to you and paid separately: ${money(balance.royaltiesCarried)}`);
  lines.push('', balance.direction === 'to-publisher'
    ? `You send the publisher ${money(balance.amount)}.`
    : balance.direction === 'to-artist' ? `The publisher sends you ${money(balance.amount)}.` : 'No money needs to change hands.');
  lines.push('Your sales cut is deducted once. Remaining earnings already exclude that cut, previous payouts and recorded debt offsets.');
  if (balance.expensesOwed > 0) lines.push('Expenses are paid back at cost. They are not earnings and do not change what you have been paid for your sales.');
  if (balance.expensesLeftOut > 0) lines.push(`${balance.expensesLeftOut} expense${balance.expensesLeftOut === 1 ? ' is' : 's are'} in another currency and not included here. ${balance.expensesLeftOut === 1 ? 'It is' : 'They are'} still owed to you and paid back separately.`);
  lines.push(recorded ? 'Recorded as settled by the publisher.' : 'This is a calculation, not a receipt. No payment has been recorded.');
  return lines.join('\n');
}

export function applyArtistSettlement(book, state, plan, { date, method = '', notes = '' } = {}) {
  if (!plan?.hasWork || state._loadFailed || fingerprint(book, state) !== plan.signature) return { ok: false, reason: 'changed' };
  const parsedDate = Date.parse(`${date}T12:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '') || !Number.isFinite(parsedDate) || new Date(parsedDate).toISOString().slice(0, 10) !== date) return { ok: false, reason: 'date' };
  const byKey = rowsByKey('hist', state.hist || []);
  const rows = plan.heldSales.map(r => byKey.get(r.key));
  if (rows.some(h => !h || !h.artistPending || h.artistSettlementId)) return { ok: false, reason: 'changed' };
  // The expenses are paid back by this record listing them; their rows are
  // left as they are (see expensesRepaidBySettlement).
  const planExpenses = plan.expenses || [];
  const repaid = expensesRepaidBySettlement(state.artistPayouts);
  if (planExpenses.some(link => {
    const e = (state.expenses || []).find(x => x && String(x.id) === String(link.id));
    return !e || e.received || repaid.has(String(link.id));
  })) return { ok: false, reason: 'changed' };
  const settlement = {
    balance: structuredClone(plan.balance), heldSales: plan.heldSales,
    transfers: plan.transfers, expenses: planExpenses, cur: getBookCurrencyCode(book),
    priorPayoutIds: (state.artistPayouts || []).map(p => p.id),
    statement: artistSettlementStatement(book, plan.balance, date, true),
  };
  const record = {
    id: plan.id, date, amount: plan.royaltyCredit, method, notes,
    cur: getBookCurrencyCode(book), settlement,
    receivablePayments: plan.receivablePayments,
    // When it was written, so the author's screen can tell a payment it
    // remembers making apart from one this record has already absorbed.
    recordedAt: Date.now(),
  };
  (state.artistPayouts ||= []).push(record);
  for (const h of rows) { h.artistPending = false; h.artistSettlementId = plan.id; }
  const ids = new Set(plan.transfers.map(t => String(t.id)));
  state.artistTransfers = (state.artistTransfers || []).filter(t => !ids.has(String(t.id)));
  delete state.transferBundle; // any old link quoted the full, unsettled amount
  delete state.settlementLink; // the net link for this settlement is spent
  recalculateBookStatsFromHistory(state);
  return { ok: true, record };
}

// A payment for an older settle-up amount. Usually a new sale came in after
// the author opened their pay link: it raised the earnings owed to them, the
// net shrank, and they paid what the link asked rather than what is due now.
// The money still clears everything they owed (the held cut and any debts);
// it just offsets fewer earnings. Credit exactly those, and leave the rest
// owed to the author like any other unpaid earnings.
//
// Expenses are paid back only if the link priced them in: `pricedExpenseIds`
// are the ones it quoted (the link carries them). One logged after the link
// was made stays open for the next settle-up rather than being marked paid
// back from earnings — the totals would agree, but the statement would call
// it earnings from newer sales. Leave `pricedExpenseIds` out to count every
// expense due now. The priced ones come off in full, each a whole receipt;
// whatever else the payment offset is earnings.
// Returns the plan to record — unchanged when the payment is exactly what is
// due — or null when the payment can't be read that way: less than is due now
// (something new is owed that it doesn't cover), more than everything the
// author owed, too little offset to pay the priced expenses back in full, or
// an earlier overpayment in the mix.
export function planSettlementForPayment(plan, paid, { pricedExpenseIds } = {}) {
  if (!plan?.hasWork) return null;
  plan = onlyPricedExpenses(plan, pricedExpenseIds);
  const b = plan.balance;
  const amount = roundCents(Number(paid) || 0);
  if (!(amount > 0)) return null;
  if (b.direction === 'to-publisher' && Math.abs(amount - b.amount) <= 0.005) return plan;
  const authorSide = roundCents(b.publisherHeld + b.otherDebt);
  if (b.overpaid > 0 || amount > authorSide + 0.005 || amount + 0.005 < b.netToPublisher) return null;
  const covered = Math.max(0, roundCents(authorSide - amount));
  const expenses = roundCents(b.expensesOwed || 0);
  if (covered + 0.005 < expenses) return null;
  const earnings = Math.max(0, roundCents(covered - expenses));
  return {
    ...plan,
    royaltyCredit: roundCents(b.heldShare + earnings),
    balance: {
      ...b, royaltiesOwed: earnings, netToPublisher: amount, amount, direction: 'to-publisher',
      royaltiesCarried: roundCents(b.royaltiesOwed - earnings),
    },
  };
}

// The plan with only the expenses a pay link quoted; the rest stay owed.
function onlyPricedExpenses(plan, priced) {
  if (priced == null) return plan;
  const keep = new Set([...priced].map(String));
  const b = plan.balance;
  const expenses = (b.expenses || []).filter(e => keep.has(String(e.id)));
  if (expenses.length === (b.expenses || []).length) return plan;
  let expensesOwed = 0;
  for (const e of expenses) expensesOwed = roundCents(expensesOwed + e.amount);
  const netToPublisher = roundCents(b.netToPublisher + (b.expensesOwed || 0) - expensesOwed);
  return {
    ...plan,
    expenses: (plan.expenses || []).filter(e => keep.has(String(e.id))),
    balance: {
      ...b, expenses, expensesOwed, netToPublisher, amount: Math.abs(netToPublisher),
      direction: netToPublisher > 0 ? 'to-publisher' : netToPublisher < 0 ? 'to-artist' : 'settled',
    },
  };
}

// What a settle-up pay link records about the expenses it priced in, for
// planSettlementForPayment to read back off the payment. Stripe caps a
// metadata value at 500 characters; past that the link just says "all".
export function pricedExpensesTag(plan) {
  const ids = (plan?.expenses || []).map(e => String(e.id)).join(',');
  return ids.length <= 500 ? ids : 'all';
}

// The reverse: undefined for "every expense due now", else the quoted ids. A
// link made before expenses were part of settle-up carries no tag and priced
// none of them.
export function pricedExpensesFromTag(tag) {
  if (tag === 'all') return undefined;
  return String(tag ?? '').split(',').map(x => x.trim()).filter(Boolean);
}

export function undoArtistSettlement(state, id) {
  if (state._loadFailed) return { ok: false, reason: 'load' };
  const record = (state.artistPayouts || []).find(p => String(p.id) === String(id));
  if (!record?.settlement || record.voided) return { ok: false, reason: 'missing' };
  const byKey = rowsByKey('hist', state.hist || []);
  const rows = record.settlement.heldSales.map(r => byKey.get(r.key));
  const keepers = record.settlement.heldSales.map(link => (state.artistPayouts || []).find(p =>
    p.id !== record.id && !p.voided && p.settlement?.heldSales.some(other => other.key === link.key)));
  if (rows.some((h, i) => !h || h.voided || h.artistPending ||
    (h.artistSettlementId !== record.id && h.artistSettlementId !== keepers[i]?.id))) return { ok: false, reason: 'changed' };
  for (let i = 0; i < rows.length; i++) {
    if (keepers[i]) { rows[i].artistSettlementId = keepers[i].id; continue; }
    rows[i].artistPending = true; delete rows[i].artistSettlementId;
  }
  const transfers = (state.artistTransfers ||= []);
  for (const original of record.settlement.transfers) {
    if (transfers.some(t => String(t.id) === String(original.id))) continue;
    const h = rows.find(h => h.num === original.num);
    if (!h.artistPending) continue; // another reviewed settlement still covers it
    const restored = { ...structuredClone(original), price: h.price, total: roundCents(h.qty * h.price) };
    if (h.payment) restored.payment = structuredClone(h.payment);
    if (h.cur) restored.cur = h.cur;
    transfers.push(restored);
  }
  // Voiding the record is all it takes to reopen the expenses it paid back.
  record.voided = true;
  record.voidedAt = new Date().toISOString();
  recalculateBookStatsFromHistory(state);
  return { ok: true };
}
