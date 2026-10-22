import { describe, it, expect } from 'vitest';
import { planArtistSettlement, applyArtistSettlement, undoArtistSettlement, artistSettlementStatement, artistSettlementIssues, planSettlementForPayment, pricedExpensesTag, pricedExpensesFromTag, expensesInSettleUp } from '../src/lib/artist-settlement.js';
import { expensesWithSettlements } from '../src/lib/receipt-storage.js';
import { calcArtistEarnings, describeArtistSettlement } from '../src/lib/earnings.js';
import { mergeRows } from '../src/lib/merge-state.js';
import { computeCashFlowMetrics } from '../src/lib/cashflow.js';
import { planCurrencyChange, applyCurrencyChange } from '../src/lib/currency-migration.js';
import { appSource } from './helpers/extract-decl.js';
import { csvCell } from '../src/lib/csv.js';
import { getBookCurrencyCode } from '../src/lib/money.js';
import { payoutNetted } from '../src/lib/earnings.js';

const book = { title: 'Harbour', currency: 'CA$', profitTiers: [{ artistPct: 13 }] };
const makeState = () => ({
  hist: [
    { num: 'held', qty: 1, price: 574.68, date: '2026-01-01', chan: 'Fair', artistPending: true },
    { num: 'paid', qty: 1, price: 542.47 / 0.13, date: '2025-12-01', chan: 'Shop' },
  ],
  revenue: 542.47 / 0.13,
  artistTransfers: [{ id: 't1', num: 'held', total: 574.68, qty: 1, price: 574.68, date: '2026-01-01', chan: 'Fair' }],
  artistPayouts: [{ id: 'p1', amount: 274.71 }],
  artistReceivables: [],
});

describe('a linked author settlement', () => {
  it('records 232.21 received, credits retained royalties, and clears held money', () => {
    const s = makeState();
    const plan = planArtistSettlement(book, s);
    expect(plan.balance.amount).toBe(232.21);
    expect(applyArtistSettlement(book, s, plan, { date: '2026-10-08', method: 'e-Transfer' }).ok).toBe(true);
    const saved = s.artistPayouts.at(-1);
    expect(saved.amount).toBe(342.47);
    expect(saved.settlement.balance).toMatchObject({ amount: 232.21, direction: 'to-publisher' });
    expect(s.artistTransfers).toEqual([]);
    expect(s.hist[0].artistPending).toBe(false);
    expect(calcArtistEarnings(book, s)).toMatchObject({ owedToArtist: 0, heldByArtistGross: 0, owedByArtist: 0 });
    expect(describeArtistSettlement(calcArtistEarnings(book, s)).amount).toBe(0);
  });

  it('undoes the linked record without losing the original sale or transfer', () => {
    const s = makeState();
    const before = structuredClone(s);
    const plan = planArtistSettlement(book, s);
    applyArtistSettlement(book, s, plan, { date: '2026-10-08' });
    const record = s.artistPayouts.at(-1);
    expect(undoArtistSettlement(s, record.id).ok).toBe(true);
    expect(record.voided).toBe(true);
    expect(s.hist).toEqual(before.hist);
    expect(s.artistTransfers).toEqual(before.artistTransfers);
    expect(calcArtistEarnings(book, s).owedToArtist).toBe(267.76);
    expect(describeArtistSettlement(calcArtistEarnings(book, s)).amount).toBe(232.21);
  });

  it('clears other debts without confusing collected debt with additional royalties', () => {
    const s = makeState();
    s.artistReceivables = [{ id: 'd', amount: 100, date: '2026-01-02' }];
    const plan = planArtistSettlement(book, s);
    expect(plan.balance.amount).toBe(332.21);
    applyArtistSettlement(book, s, plan, { date: '2026-10-08' });
    expect(s.artistPayouts.at(-1).receivablePayments).toEqual([{ id: 'd', amount: 100 }]);
    expect(calcArtistEarnings(book, s)).toMatchObject({ owedToArtist: 0, owedByArtist: 0, totalOffset: 0 });
    undoArtistSettlement(s, s.artistPayouts.at(-1).id);
    expect(calcArtistEarnings(book, s).owedByArtist).toBe(100);
  });

  it('records money sent to the author and a zero-cash offset', () => {
    for (const [priorPaid, direction] of [[0, 'to-artist'], [42.5, 'settled']]) {
      const s = makeState();
      s.artistPayouts = [{ id: 'prior', amount: priorPaid }];
      const plan = planArtistSettlement(book, s);
      expect(plan.balance.direction).toBe(direction);
      applyArtistSettlement(book, s, plan, { date: '2026-10-08' });
      expect(calcArtistEarnings(book, s).owedToArtist).toBe(0);
    }
  });

  it('rejects changed balances between preview and saving', () => {
    const s = makeState();
    const plan = planArtistSettlement(book, s);
    s.artistPayouts.push({ id: 'new', amount: 10 });
    const before = JSON.stringify(s);
    expect(applyArtistSettlement(book, s, plan, { date: '2026-10-08' }).ok).toBe(false);
    expect(JSON.stringify(s)).toBe(before);
  });

  it('gives the same settlement the same identity on two offline devices', () => {
    const left = makeState(), right = makeState();
    const a = planArtistSettlement(book, left), b = planArtistSettlement(book, right);
    expect(a.id).toBe(b.id);
    applyArtistSettlement(book, left, a, { date: '2026-10-08' });
    applyArtistSettlement(book, right, b, { date: '2026-10-08' });
    const merged = mergeRows('artistPayouts', makeState().artistPayouts, right.artistPayouts, left.artistPayouts);
    expect(merged.rows).toHaveLength(2);
    expect(applyArtistSettlement(book, left, a, { date: '2026-10-08' }).ok).toBe(false);
  });

  it('refuses to undo if a linked sale was subsequently changed', () => {
    const s = makeState(), plan = planArtistSettlement(book, s);
    applyArtistSettlement(book, s, plan, { date: '2026-10-08' });
    s.hist[0].price = 1;
    const before = JSON.stringify(s);
    expect(undoArtistSettlement(s, plan.id).ok).toBe(false);
    expect(JSON.stringify(s)).toBe(before);
  });

  it('copies a complete explanation, including title, cut, remaining earnings and direction', () => {
    const plan = planArtistSettlement(book, makeState());
    const text = artistSettlementStatement(book, plan.balance, '2026-10-08');
    for (const value of ['Harbour', '2026-10-08', 'CA$574.68', 'CA$74.71', 'CA$499.97', 'CA$267.76', 'CA$232.21']) expect(text).toContain(value);
    expect(text).toContain('You send the publisher CA$232.21');
    expect(text).toContain('not a receipt');
  });

  it('the change in net cash matches the actual transfer, including collected debt', () => {
    const s = makeState();
    s.artistReceivables = [{ id: 'd', amount: 100 }];
    const metrics = () => computeCashFlowMetrics({ books: { harbour: book }, states: { harbour: s } }, 'all');
    const net = m => m.grossSales - m.artistPayouts + (m.artistDebtRecovered || 0) + (m.artistSettlementCashAdjustment || 0);
    const before = net(metrics());
    applyArtistSettlement(book, s, planArtistSettlement(book, s), { date: '2026-10-08' });
    expect(net(metrics()) - before).toBeCloseTo(332.21, 2);
  });

  it('counts received cash in the payment year, without counting historical held sales twice', () => {
    const s = makeState();
    s.hist[0].date = '2025-12-15';
    s.artistReceivables = [{ id: 'd', amount: 100 }];
    const net = year => {
      const m = computeCashFlowMetrics({ books: { harbour: book }, states: { harbour: s } }, year);
      return m.grossSales - m.artistPayouts + (m.artistDebtRecovered || 0) + (m.artistSettlementCashAdjustment || 0);
    };
    const before = net('2025');
    applyArtistSettlement(book, s, planArtistSettlement(book, s), { date: '2026-10-08' });
    expect(net('2026')).toBeCloseTo(332.21, 2);
    expect(net('2025')).toBeCloseTo(before, 2);
    undoArtistSettlement(s, s.artistPayouts.at(-1).id);
    expect(net('2026')).toBe(0);
    expect(net('2025')).toBeCloseTo(before, 2);
  });

  it('preserves the receipt and can undo correctly after changing book currency', () => {
    const s = makeState(), b = structuredClone(book);
    s.hist[0].payment = { currency: 'EUR', amount: 400, convertedTotal: 574.68 };
    s.artistTransfers[0].payment = structuredClone(s.hist[0].payment);
    s.artistReceivables = [{ id: 'd', amount: 100, date: '2026-01-01' }];
    applyArtistSettlement(b, s, planArtistSettlement(b, s), { date: '2026-10-08' });
    const record = s.artistPayouts.at(-1), receipt = record.settlement.statement;
    applyCurrencyChange(planCurrencyChange({ state: s, book: b, from: 'CAD', to: 'USD', rateFor: () => 2 }));
    b.currency = 'US$';
    expect(record.receivablePayments[0].amount).toBe(200);
    expect(record.settlement.statement).toBe(receipt);
    expect(calcArtistEarnings(b, s).owedByArtist).toBe(0);
    expect(undoArtistSettlement(s, record.id).ok).toBe(true);
    expect(s.artistTransfers[0].total).toBe(1149.36);
    expect(s.artistTransfers[0].payment).toEqual({ currency: 'EUR', amount: 400, convertedTotal: 1149.36 });
    expect(calcArtistEarnings(b, s).owedByArtist).toBe(200);
  });

  it('exports retained earnings separately from the real cash received and debt repayment', () => {
    const s = makeState();
    s.artistReceivables = [{ id: 'd', amount: 100 }];
    applyArtistSettlement(book, s, planArtistSettlement(book, s), { date: '2026-10-08', method: 'e-Transfer' });
    const source = appSource.match(/function downloadFullTaxSeasonExport\(\) \{([\s\S]*?)\n\}\n/)[1];
    let csv = '';
    const deps = { document: { getElementById: () => ({ value: '2026' }) }, today: () => '2026-10-08',
      csvCell, BOOK_LIST: [{ ...book, id: 'harbour' }], states: { harbour: s }, defaultState: () => ({}),
      getBookCurrencyCode, _fxRateCache: {}, isTestBook: () => false, isTestBookId: () => false,
      filterArtistEarningsByYear: () => 0, payoutNetted, TAX_CENTER: { businessExpenses: [] },
      downloadCsv: content => { csv = content; }, showToast: () => {} };
    new Function(...Object.keys(deps), source)(...Object.values(deps));
    expect(csv).toContain('"Earnings settled"');
    expect(csv).not.toContain('"Artist Payout"');
    expect(csv).toContain('Cash Received,Cash Sent');
    expect(csv).toContain('2026-10-08,"Harbour","CAD",574.68,74.71,267.76,0,100,0,332.21,0,"e-Transfer"');
    s.artistPayouts.at(-1).voided = true;
    new Function(...Object.keys(deps), source)(...Object.values(deps));
    expect(csv).not.toContain('332.21');
  });

  it('flags different overlapping offline settlements and lets either duplicate be undone', () => {
    for (const winner of ['local', 'remote']) {
      const left = makeState(), right = makeState();
      right.artistReceivables = [{ id: 'debt', amount: 10 }];
      const a = planArtistSettlement(book, left), b = planArtistSettlement(book, right);
      applyArtistSettlement(book, left, a, { date: '2026-10-08' });
      applyArtistSettlement(book, right, b, { date: '2026-10-08' });
      const state = {
        ...left,
        artistReceivables: right.artistReceivables,
        artistPayouts: mergeRows('artistPayouts', makeState().artistPayouts, right.artistPayouts, left.artistPayouts).rows,
      };
      expect(artistSettlementIssues(state).size).toBe(2);
      expect(planArtistSettlement(book, state).error).toBe('review');
      const id = winner === 'local' ? b.id : a.id;
      expect(undoArtistSettlement(state, id).ok).toBe(true);
      expect(artistSettlementIssues(state).size).toBe(0);
      expect(state.hist[0].artistPending).toBe(false);
    }
  });
});

describe('a Stripe payment for an older settle-up amount', () => {
  // The screenshot account (held 574.68, keeps 74.71, owed 267.76 → 232.21),
  // then a new shop sale that earns the author 8.27 more → 223.94 due now.
  const withNewSale = () => {
    const s = makeState();
    s.hist.push({ num: 'new', qty: 1, price: 8.27 / 0.13, date: '2026-10-08', chan: 'Shop' });
    return s;
  };


  it('records exactly what is due unchanged', () => {
    const plan = planArtistSettlement(book, makeState());
    expect(planSettlementForPayment(plan, 232.21)).toBe(plan);
  });

  it('clears the author side in full and leaves the newer earnings owed', () => {
    const s = withNewSale();
    const plan = planArtistSettlement(book, s);
    expect(plan.balance.amount).toBe(223.94);
    const paidOld = planSettlementForPayment(plan, 232.21);
    expect(paidOld.balance).toMatchObject({ amount: 232.21, royaltiesOwed: 267.76, royaltiesCarried: 8.27 });
    expect(paidOld.royaltyCredit).toBe(342.47);
    expect(applyArtistSettlement(book, s, paidOld, { date: '2026-10-08' }).ok).toBe(true);
    expect(calcArtistEarnings(book, s)).toMatchObject({ owedToArtist: 8.27, heldByArtistGross: 0, owedByArtist: 0 });
  });

  it('refuses a payment smaller than what is due now, or more than they owed', () => {
    const plan = planArtistSettlement(book, withNewSale());
    expect(planSettlementForPayment(plan, 200)).toBeNull();
    expect(planSettlementForPayment(plan, 499.98)).toBeNull();
    expect(planSettlementForPayment(plan, 0)).toBeNull();
  });

  it('refuses when an earlier overpayment is part of the balance', () => {
    const s = makeState();
    s.artistPayouts = [{ id: 'big', amount: 700 }];
    const plan = planArtistSettlement(book, s);
    expect(plan.balance.overpaid).toBeGreaterThan(0);
    expect(planSettlementForPayment(plan, plan.balance.amount + 1)).toBeNull();
  });
});

describe('unpaid author expenses in a settlement', () => {
  // The screenshot account plus a 28.17 shipping receipt the author paid.
  const shipping = () => ({ id: 501, desc: 'Shipping Cost (Paid EUR 17.85)', cat: 'Software & Subscriptions', amount: 28.17, currency: 'CAD', date: '2025-10-08', received: false });
  const withExpenses = (...extra) => ({ ...makeState(), expenses: [shipping(), ...extra] });

  it('takes them off what the author sends, without touching earnings', () => {
    const s = withExpenses();
    const plan = planArtistSettlement(book, s);
    expect(plan.balance).toMatchObject({ expensesOwed: 28.17, royaltiesOwed: 267.76, amount: 204.04, direction: 'to-publisher' });
    expect(plan.expenses).toEqual([{ id: 501, amount: 28.17 }]);
    expect(plan.royaltyCredit).toBe(342.47); // earnings only, the same as without the receipt
  });

  it('reads them as paid back while the settlement stands, and Undo reopens them', () => {
    const s = withExpenses({ id: 502, desc: 'Paid already', amount: 9, currency: 'CAD', received: true, receivedDate: '2025-11-01' });
    const before = structuredClone(s.expenses);
    const plan = planArtistSettlement(book, s);
    expect(applyArtistSettlement(book, s, plan, { date: '2026-10-08' }).ok).toBe(true);
    const record = s.artistPayouts.at(-1);
    expect(record.amount).toBe(342.47);
    expect(record.settlement.expenses).toEqual([{ id: 501, amount: 28.17 }]);
    // The settlement record is the proof; the expense rows are never written.
    expect(s.expenses).toEqual(before);
    expect(expensesWithSettlements(s)[0]).toMatchObject({ received: true, receivedDate: '2026-10-08', settlementId: plan.id });
    expect(expensesWithSettlements(s)[1]).toBe(s.expenses[1]);
    expect(calcArtistEarnings(book, s)).toMatchObject({ owedToArtist: 0, heldByArtistGross: 0 });
    expect(planArtistSettlement(book, s).balance.expensesOwed).toBe(0);
    expect(artistSettlementIssues(s).size).toBe(0);

    expect(undoArtistSettlement(s, record.id).ok).toBe(true);
    expect(expensesWithSettlements(s)[0].received).toBe(false);
    expect(s.expenses).toEqual(before);
    expect(planArtistSettlement(book, s).balance.amount).toBe(204.04);
  });

  it('flips direction when the expenses outweigh what the author owes', () => {
    const s = withExpenses({ id: 503, desc: 'Printing proofs', amount: 250, currency: 'CAD', date: '2025-09-01' });
    const plan = planArtistSettlement(book, s);
    expect(plan.balance).toMatchObject({ expensesOwed: 278.17, direction: 'to-artist', amount: 45.96 });
    expect(applyArtistSettlement(book, s, plan, { date: '2026-10-08' }).ok).toBe(true);
    expect(expensesWithSettlements(s).every(e => e.received)).toBe(true);
    expect(calcArtistEarnings(book, s).owedToArtist).toBe(0);
  });

  it('counts only approved, unpaid receipts it can put in the book currency', () => {
    const s = withExpenses(
      { id: 1, amount: 5, currency: 'CAD', received: true },
      { id: 2, amount: 6, currency: 'CAD', gratuity: true },
      { id: 3, amount: 7, currency: 'CAD', amountUnknown: true },
      { id: 4, amount: 10, currency: 'EUR', baseAmount: 14.8, date: '2025-10-02' },
      { id: 5, amount: 10, currency: 'USD', fxRate: 1.37, date: '2025-10-03' },
      { id: 6, amount: 10, currency: 'MXN', date: '2025-10-04' },
      { id: 7, amount: 3, currency: 'CAD', desc: 'Gratuity: two copies' },
    );
    const { balance } = planArtistSettlement(book, s);
    expect(balance.expenses.map(e => [e.id, e.amount])).toEqual([[4, 14.8], [5, 13.7], [501, 28.17]]);
    expect(balance.expensesOwed).toBe(56.67);
    expect(balance.expensesLeftOut).toBe(1);
    // A book priced in another currency takes only receipts in its own.
    const eur = { ...book, currency: '€' };
    const e = planArtistSettlement(eur, { ...makeState(), expenses: [{ id: 9, amount: 12, currency: 'EUR' }, shipping()] }).balance;
    expect([e.expensesOwed, e.expensesLeftOut]).toEqual([12, 1]);
  });

  it('is not put out of date by a receipt photo, but is by an expense being paid', () => {
    const s = withExpenses();
    const plan = planArtistSettlement(book, s);
    s.expenses[0].receiptFiles = [{ name: 'scan.jpg' }];
    expect(planArtistSettlement(book, s).signature).toBe(plan.signature);
    s.expenses[0].received = true;
    expect(applyArtistSettlement(book, s, plan, { date: '2026-10-08' }).ok).toBe(false);
  });

  it('flags an expense paid back by hand on another device, whichever device syncs last', () => {
    for (const settlingSyncsLast of [true, false]) {
      const base = withExpenses();
      const settling = structuredClone(base), byHand = structuredClone(base);
      applyArtistSettlement(book, settling, planArtistSettlement(book, settling), { date: '2026-10-08' });
      Object.assign(byHand.expenses[0], { received: true, receivedDate: '2026-10-07' }); // an e-Transfer
      const [local, remote] = settlingSyncsLast ? [settling, byHand] : [byHand, settling];
      const merged = {
        ...settling,
        expenses: mergeRows('expenses', base.expenses, remote.expenses, local.expenses).rows,
        artistPayouts: mergeRows('artistPayouts', base.artistPayouts, remote.artistPayouts, local.artistPayouts).rows,
      };
      expect(artistSettlementIssues(merged).size).toBe(1);
    }
  });

  it('keeps an expense open after Undo even if another device edits it meanwhile', () => {
    const s = withExpenses();
    applyArtistSettlement(book, s, planArtistSettlement(book, s), { date: '2026-10-08' });
    const base = structuredClone(s);
    const undone = structuredClone(base), edited = structuredClone(base);
    undoArtistSettlement(undone, undone.artistPayouts.at(-1).id);
    edited.expenses[0].desc = 'Shipping to the fair';
    const merged = {
      ...undone,
      expenses: mergeRows('expenses', base.expenses, undone.expenses, edited.expenses).rows,
      artistPayouts: mergeRows('artistPayouts', base.artistPayouts, edited.artistPayouts, undone.artistPayouts).rows,
    };
    expect(expensesWithSettlements(merged)[0].received).toBe(false);
    expect(planArtistSettlement(book, merged).balance.expensesOwed).toBe(28.17);
  });

  it('a receipt that has gone from the ledger puts the settlement up for review', () => {
    const s = withExpenses();
    applyArtistSettlement(book, s, planArtistSettlement(book, s), { date: '2026-10-08' });
    s.expenses = [];
    expect(artistSettlementIssues(s).size).toBe(1);
  });

  it('tells screens which expenses an open settle-up already covers', () => {
    const s = withExpenses();
    expect(expensesInSettleUp(book, s)).toEqual({ ids: new Set(['501']), publisherPays: false });
    const flipped = withExpenses({ id: 503, amount: 250, currency: 'CAD', date: '2025-09-01' });
    expect(expensesInSettleUp(book, flipped).publisherPays).toBe(true);
    applyArtistSettlement(book, s, planArtistSettlement(book, s), { date: '2026-10-08' });
    expect(expensesInSettleUp(book, s).ids.size).toBe(0);
  });

  it('itemises every receipt in the statement', () => {
    const plan = planArtistSettlement(book, withExpenses({ id: 504, desc: 'Courier', amount: 11.5, currency: 'CAD', date: '2025-09-20' }));
    const text = artistSettlementStatement(book, plan.balance, '2026-10-08');
    expect(text).toContain('Expenses you paid that the publisher owes you back: −CA$39.67');
    expect(text).toContain('  · 2025-09-20 Courier: CA$11.50');
    expect(text).toContain('  · 2025-10-08 Shipping Cost (Paid EUR 17.85): CA$28.17');
    expect(text).toContain('You send the publisher CA$192.54.');
    expect(text).toContain('not earnings');
  });

  it('a Stripe payment of an older link pays back the expenses it priced, then earnings', () => {
    const s = withExpenses();
    const tag = pricedExpensesTag(planArtistSettlement(book, s));
    expect(tag).toBe('501');
    s.hist.push({ num: 'new', qty: 1, price: 8.27 / 0.13, date: '2026-10-08', chan: 'Shop' });
    const plan = planArtistSettlement(book, s);
    expect(plan.balance.amount).toBe(195.77);
    const paidOld = planSettlementForPayment(plan, 204.04, { pricedExpenseIds: pricedExpensesFromTag(tag) });
    expect(paidOld.balance).toMatchObject({ amount: 204.04, expensesOwed: 28.17, royaltiesOwed: 267.76, royaltiesCarried: 8.27 });
    expect(paidOld.royaltyCredit).toBe(342.47);
    expect(applyArtistSettlement(book, s, paidOld, { date: '2026-10-08' }).ok).toBe(true);
    expect(expensesWithSettlements(s)[0].received).toBe(true);
    expect(calcArtistEarnings(book, s).owedToArtist).toBe(8.27);
    // Too little offset to pay the receipt back in full: left for a person.
    expect(planSettlementForPayment(planArtistSettlement(book, withExpenses()), 490)).toBeNull();
  });

  it('leaves an expense the link never priced open: logged after the link, or a link from before expenses counted', () => {
    // A link made before this receipt existed (or before expenses were part
    // of settle-up, so it carries no tag) asked for 232.21.
    for (const tag of ['', undefined]) {
      const s = withExpenses();
      const plan = planSettlementForPayment(planArtistSettlement(book, s), 232.21, { pricedExpenseIds: pricedExpensesFromTag(tag) });
      expect(plan.balance).toMatchObject({ amount: 232.21, expensesOwed: 0, royaltiesOwed: 267.76 });
      expect(plan.balance).not.toHaveProperty('royaltiesCarried');
      expect(plan.expenses).toEqual([]);
      expect(applyArtistSettlement(book, s, plan, { date: '2026-10-08' }).ok).toBe(true);
      expect(calcArtistEarnings(book, s).owedToArtist).toBe(0);
      expect(planArtistSettlement(book, s).balance.expensesOwed).toBe(28.17); // still owed back
    }
    // 'all' (too many to tag) counts every expense due now.
    expect(pricedExpensesFromTag('all')).toBeUndefined();
    expect(pricedExpensesFromTag('1, 2')).toEqual(['1', '2']);
  });

  it('keeps cash flow honest: the expense is counted once, and the cash change matches the transfer', () => {
    const s = withExpenses();
    const metrics = () => computeCashFlowMetrics({ books: { harbour: book }, states: { harbour: s } }, 'all');
    const net = m => m.grossSales - m.operatingExpenses - m.artistPayouts + (m.artistDebtRecovered || 0) + (m.artistSettlementCashAdjustment || 0);
    const before = metrics();
    applyArtistSettlement(book, s, planArtistSettlement(book, s), { date: '2026-10-08' });
    const after = metrics();
    expect(after.operatingExpenses).toBe(before.operatingExpenses);
    // The receipt was already an expense; the 204.04 received plus the 28.17
    // it repaid make up the 232.21 the author's side was worth.
    expect(net(after) - net(before)).toBeCloseTo(232.21, 2);
  });
});

describe('a repaid expense edited afterwards', () => {
  it('puts the settlement up for review when its amount changes', () => {
    const s = { ...makeState(), expenses: [{ id: 501, desc: 'Shipping', amount: 28.17, currency: 'CAD', date: '2025-10-08' }] };
    applyArtistSettlement(book, s, planArtistSettlement(book, s), { date: '2026-10-08' });
    expect(artistSettlementIssues(s).size).toBe(0);
    s.expenses[0].desc = 'Shipping to the fair'; // a wording fix is fine
    expect(artistSettlementIssues(s).size).toBe(0);
    s.expenses[0].amount = 38.17;
    expect(artistSettlementIssues(s).size).toBe(1);
  });
});
