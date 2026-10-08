// One reversible, offline-safe record for both sides of an author's account.
import { calcArtistEarnings, describeArtistSettlement, appliedOffsets, appliedReceivablePayments, receivableOpen } from './earnings.js';
import { roundCents, fmt, getBookCurrencyCode } from './money.js';
import { keyRows, stableStringify } from './merge-state.js';
import { recalculateBookStatsFromHistory } from './inventory.js';

function fingerprint(book, state) {
  return stableStringify({
    currency: book.currency, tiers: book.profitTiers, productionCost: book.productionCost,
    hist: state.hist || [], payouts: state.artistPayouts || [],
    debts: state.artistReceivables || [], transfers: state.artistTransfers || [],
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
  const keys = keyRows('hist', state.hist || []);
  const issues = new Set();
  for (const p of active) {
    if (p.settlement.heldSales.some(link => {
      const h = state.hist[keys.indexOf(link.key)];
      return !h || h.voided || h.artistPending || h.artistSettlementId !== p.id;
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

export function planArtistSettlement(book, state) {
  const stats = calcArtistEarnings(book, state);
  if (!stats || state._loadFailed) return null;
  const balance = describeArtistSettlement(stats);
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
    royaltyCredit: roundCents(balance.heldShare + stats.owedToArtist),
    error,
    hasWork: !error && (heldSales.length > 0 || balance.otherDebt > 0 || stats.owedToArtist !== 0),
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
  if (balance.overpaid > 0) lines.push(`Previous overpayment being recovered: +${money(balance.overpaid)}`);
  lines.push('', balance.direction === 'to-publisher'
    ? `You send the publisher ${money(balance.amount)}.`
    : balance.direction === 'to-artist' ? `The publisher sends you ${money(balance.amount)}.` : 'No money needs to change hands.');
  lines.push('Your sales cut is deducted once. Remaining earnings already exclude that cut, previous payouts and recorded debt offsets.');
  lines.push(recorded ? 'Recorded as settled by the publisher.' : 'This is a calculation, not a receipt. No payment has been recorded.');
  return lines.join('\n');
}

export function applyArtistSettlement(book, state, plan, { date, method = '', notes = '' } = {}) {
  if (!plan?.hasWork || state._loadFailed || fingerprint(book, state) !== plan.signature) return { ok: false, reason: 'changed' };
  const parsedDate = Date.parse(`${date}T12:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '') || !Number.isFinite(parsedDate) || new Date(parsedDate).toISOString().slice(0, 10) !== date) return { ok: false, reason: 'date' };
  const keys = keyRows('hist', state.hist || []);
  const rows = plan.heldSales.map(r => state.hist[keys.indexOf(r.key)]);
  if (rows.some(h => !h || !h.artistPending || h.artistSettlementId)) return { ok: false, reason: 'changed' };
  const settlement = {
    balance: structuredClone(plan.balance), heldSales: plan.heldSales,
    transfers: plan.transfers, cur: getBookCurrencyCode(book),
    priorPayoutIds: (state.artistPayouts || []).map(p => p.id),
    statement: artistSettlementStatement(book, plan.balance, date, true),
  };
  const record = {
    id: plan.id, date, amount: plan.royaltyCredit, method, notes,
    cur: getBookCurrencyCode(book), settlement,
    receivablePayments: plan.receivablePayments,
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

export function undoArtistSettlement(state, id) {
  if (state._loadFailed) return { ok: false, reason: 'load' };
  const record = (state.artistPayouts || []).find(p => String(p.id) === String(id));
  if (!record?.settlement || record.voided) return { ok: false, reason: 'missing' };
  const keys = keyRows('hist', state.hist || []);
  const rows = record.settlement.heldSales.map(r => state.hist[keys.indexOf(r.key)]);
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
  record.voided = true;
  record.voidedAt = new Date().toISOString();
  recalculateBookStatsFromHistory(state);
  return { ok: true };
}
