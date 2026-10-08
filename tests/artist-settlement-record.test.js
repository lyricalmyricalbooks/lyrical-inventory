import { describe, it, expect } from 'vitest';
import { planArtistSettlement, applyArtistSettlement, undoArtistSettlement, artistSettlementStatement, artistSettlementIssues } from '../src/lib/artist-settlement.js';
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
    const source = appSource.match(/window\.downloadFullTaxSeasonExport = function \(\) \{([\s\S]*?)\n\};/)[1];
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
    expect(csv).toContain('2026-10-08,"Harbour","CAD",574.68,74.71,267.76,100,0,332.21,0,"e-Transfer"');
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
