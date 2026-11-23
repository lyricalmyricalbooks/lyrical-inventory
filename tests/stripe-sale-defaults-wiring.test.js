import { beforeEach, describe, expect, it } from 'vitest';
import { buildHarness } from './helpers/extract-decl.js';
import { stripeOrderNumber } from '../src/lib/stripe-sale-defaults.js';
import { roundCents } from '../src/lib/money.js';
import { stripeSalePlan, paidUnitPrice, wholeCopies } from '../src/lib/stripe-sale-autorecord.js';
import { DATED_RATE_SOURCES } from '../src/lib/fx-sources.js';

const payment = { id: 'ch_Test42', currency: 'EUR', amount: 40, date: '2026-10-08' };
const BOOKS = { b1: { id: 'b1', currency: 'CAD' }, b2: { id: 'b2', currency: 'USD' } };
const currencyDeps = {
  BOOKS, roundCents, stripeOrderNumber,
  getBookCurrencyCode: book => book.currency,
  normalizeCurrencyCode: (value, fallback) => String(value || fallback).toUpperCase(),
  _reconSaleKey: id => id,
  getReconMemory: () => ({ recorded: {}, dismissed: {}, reopened: {} }),
};

it('writes the original money, converted total, and automatic order number to the ledger boundary', () => {
  let row;
  const api = buildHarness({ names: ['_reconApplyPaymentToBook'], deps: {
    ...currencyDeps, _reconApplySaleToBook: (...args) => { row = args; },
  }, returns: '{ _reconApplyPaymentToBook }' });
  api._reconApplyPaymentToBook(payment, 'b1', 3, { rate: 1.55 });
  expect(row[2] * 3).toBeCloseTo(62, 10);
  expect(row[3]).toMatchObject({ currency: 'EUR', amount: 40, rate: 1.55, convertedTotal: 62, ref: 'ch_Test42' });
  expect(row[6].num).toBe('STRIPE-Test42');
  api._reconApplyPaymentToBook(payment, 'b1', 1, { rate: 1.55, num: 'OWNER-42' });
  expect(row[6].num).toBe('OWNER-42');
});

function historical(fetchFx) {
  const calls = [];
  const api = buildHarness({ names: ['fetchHistoricalRate'], deps: {
    _fxRateCache: {}, _fxHistoricalDates: {}, _fxHistoricalSources: {}, _fxFailedUntil: {},
    datedRateKey: (f, t, d) => `${f}_${t}@${d}`, DATED_RATE_SOURCES,
    saveFxHistory: () => true, getLocalStorage: () => null, FX_FAILURE_PAUSE_MS: 60000,
    fetchFx: async url => { calls.push(url); return fetchFx(url); },
  }, returns: '{ fetchHistoricalRate }' });
  return { ...api, calls };
}

it('keeps the previous business day on a warmed historical-rate cache', async () => {
  const api = historical(async () => ({ ok: true, json: async () => ({ date: '2026-10-02', rates: { CAD: 1.55 } }) }));
  const want = { rate: 1.55, date: '2026-10-02', source: 'Frankfurter' };
  expect(await api.fetchHistoricalRate('EUR', 'CAD', '2026-10-04')).toEqual(want);
  expect(await api.fetchHistoricalRate('EUR', 'CAD', '2026-10-04')).toEqual(want);
  expect(api.calls).toEqual(['https://api.frankfurter.dev/v1/2026-10-04?from=EUR&to=CAD']);
});

it('asks the second dated service when Frankfurter fails, and says which one answered', async () => {
  const api = historical(async url => url.includes('frankfurter')
    ? { ok: false, status: 404, json: async () => ({}) }
    : { ok: true, json: async () => ({ date: '2026-10-08', eur: { cad: 1.61 } }) });
  expect(await api.fetchHistoricalRate('EUR', 'CAD', '2026-10-08')).toEqual({ rate: 1.61, date: '2026-10-08', source: 'Currency API' });
  expect(api.calls[1]).toBe('https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@2026-10-08/v1/currencies/eur.json');
});

it('lets Retry through the pause that follows a failed lookup', async () => {
  let online = false;
  const api = historical(async () => {
    if (!online) throw new Error('offline');
    return { ok: true, json: async () => ({ date: '2026-10-07', rates: { CAD: 1.6 } }) };
  });
  expect((await api.fetchHistoricalRate('EUR', 'CAD', '2026-10-08')).error).toBe('historical-unavailable');
  online = true;
  expect((await api.fetchHistoricalRate('EUR', 'CAD', '2026-10-08')).error).toBe('recently-failed');
  expect(await api.fetchHistoricalRate('EUR', 'CAD', '2026-10-08', { retry: true })).toMatchObject({ rate: 1.6, date: '2026-10-07' });
});

it('does not invent an effective reference date when only a cached rate is known', () => {
  let row;
  const api = buildHarness({ names: ['_reconApplyPaymentToBook'], deps: {
    ...currencyDeps, _reconApplySaleToBook: (...args) => { row = args; },
  }, returns: '{ _reconApplyPaymentToBook }' });
  api._reconApplyPaymentToBook(payment, 'b1', 1, { rate: 1.55, rateSource: 'Frankfurter' });
  expect(row[3].rateDate).toBe('');
  expect(row[3].rateRequestedDate).toBe('2026-10-08');
});

function screen(resolve, { pay = payment, books = BOOKS } = {}) {
  document.body.innerHTML = `<select id="recon-book-ch_Test42"><option value="b1">CAD book</option><option value="b2">USD book</option></select>
    <input id="recon-qty-ch_Test42" value="1">
    <input id="recon-currency-ch_Test42" value="EUR"><input id="recon-amount-ch_Test42" value="40">
    <input id="recon-rate-ch_Test42"><input id="recon-num-ch_Test42" value="STRIPE-Test42">
    <button id="recon-rec-ch_Test42"></button><div id="recon-fx-ch_Test42"></div>`;
  return buildHarness({ names: ['reconUpdateDefaults', '_reconDefaultQty'], deps: {
    ...currencyDeps, BOOKS: books, document, window, paidUnitPrice, wholeCopies,
    _reconFindPayment: () => pay,
    resolveStripeRate: resolve,
    _stripeFmtMoney: (amount, currency) => `${currency} ${amount.toFixed(2)}`,
  }, returns: '{ reconUpdateDefaults, _reconDefaultQty }' });
}

describe('Stripe rate fields', () => {
  beforeEach(() => { document.body.innerHTML = ''; });
  it('fills the dated rate and converted amount without repainting the form', async () => {
    const api = screen(async () => ({ rate: 1.55, date: '2026-10-07' }));
    await api.reconUpdateDefaults('ch_Test42');
    expect(document.getElementById('recon-rate-ch_Test42').value).toBe('1.55');
    expect(document.getElementById('recon-fx-ch_Test42').textContent).toContain('CAD 62.00');
    expect(document.getElementById('recon-fx-ch_Test42').textContent).not.toContain('CAD CAD');
    expect(document.getElementById('recon-fx-ch_Test42').textContent).toContain('2026-10-07');
    expect(document.getElementById('recon-rec-ch_Test42').disabled).toBe(false);
  });
  it('ignores an old lookup after changing the selected book', async () => {
    let finish;
    const api = screen((_p, currency) => currency === 'CAD'
      ? new Promise(done => { finish = done; }) : Promise.resolve({ rate: 1.1 }));
    const old = api.reconUpdateDefaults('ch_Test42');
    document.getElementById('recon-book-ch_Test42').value = 'b2';
    await api.reconUpdateDefaults('ch_Test42', false, true);
    finish({ rate: 1.55 });
    await old;
    expect(document.getElementById('recon-rate-ch_Test42').value).toBe('1.1');
    expect(document.getElementById('recon-fx-ch_Test42').textContent).toContain('USD 44.00');
  });
  it('preserves a hand-entered rate when an automatic lookup finishes', async () => {
    let finish;
    const api = screen(() => new Promise(done => { finish = done; }));
    const lookup = api.reconUpdateDefaults('ch_Test42');
    const input = document.getElementById('recon-rate-ch_Test42');
    input.value = '1.6';
    input.dataset.manual = '1';
    finish({ rate: 1.55 });
    await lookup;
    expect(input.value).toBe('1.6');
    expect(document.getElementById('recon-fx-ch_Test42').textContent).toContain('CAD 64.00');
  });
  it('leaves the sale unrecorded when no dated rate is available', async () => {
    const api = screen(async () => ({ error: 'rate-unavailable' }));
    await api.reconUpdateDefaults('ch_Test42');
    expect(document.getElementById('recon-rate-ch_Test42').value).toBe('');
    expect(document.getElementById('recon-fx-ch_Test42').textContent).toMatch(/retry|Retry/);
  });
  it('asks for a fresh lookup when Retry is pressed', async () => {
    const asked = [];
    const api = screen(async (_p, _cur, opts) => {
      asked.push(opts);
      return asked.length === 1 ? { error: 'rate-unavailable' } : { rate: 1.55, date: '2026-10-07' };
    });
    await api.reconUpdateDefaults('ch_Test42');
    document.querySelector('#recon-fx-ch_Test42 button').click();
    await new Promise(done => setTimeout(done, 0));
    expect(asked.map(o => o.retry)).toEqual([false, true]);
    expect(document.getElementById('recon-rate-ch_Test42').value).toBe('1.55');
  });
  it('sets the copy count from the price on the app’s own link when the book changes, unless she typed one', async () => {
    const linked = { ...payment, amount: 80, description: 'Altrove (EUR 40.00)', metadata: { override: 'true' } };
    const api = screen(async () => ({ rate: 1.55 }), { pay: linked, books: { b1: { id: 'b1', currency: 'CAD', listPrice: 55 }, b2: BOOKS.b2 } });
    expect(api._reconDefaultQty(linked, 'b1')).toBe(2);
    expect(api._reconDefaultQty(payment, 'b1')).toBe(1);
    await api.reconUpdateDefaults('ch_Test42', false, true);
    expect(document.getElementById('recon-qty-ch_Test42').value).toBe('2');
    const qty = document.getElementById('recon-qty-ch_Test42');
    qty.value = '5';
    qty.dataset.manual = '1';
    await api.reconUpdateDefaults('ch_Test42', false, true);
    expect(qty.value).toBe('5');
  });
});

function autoRecorder(resolve, recorded = new Set()) {
  const writes = [];
  const flags = { enabled: true, kind: 'direct' };
  const book = { ...BOOKS.b1, listPrice: 31, title: 'Test Book' };
  const deps = {
    ...currencyDeps, BOOKS: { b1: book }, states: { b1: { stock: 8 } },
    stripeSalePlan, stripeSaleAutoEnabled: () => flags.enabled, booksInDescription: () => [],
    _reconLikelyAlreadyLogged: () => false, stripeSaleAutoSince: () => 1000, stripeSaleRulesSince: () => flags.rulesSince || 0,
    resolveStripeRate: resolve, _reconRecordedChargeIds: () => recorded,
    classifyStripePayment: () => ({ kind: recorded.has(payment.id) ? 'recorded' : flags.kind, bookId: 'b1' }),
    readRaisedStripeSales: () => [], noteRaisedStripeSale: () => {}, noteUnmatchedReaderPayment: () => {},
    _reconApplySaleToBook: (...args) => writes.push(args),
  };
  const api = buildHarness({ names: ['autoRecordStripeSale', '_reconApplyPaymentToBook'], deps, returns: '{ autoRecordStripeSale }' });
  return { ...api, writes, recorded, flags };
}

it('automatically records converted copies with their original amount and order reference', async () => {
  const api = autoRecorder(async () => ({ rate: 1.55, source: 'Frankfurter', date: '2026-10-07' }));
  expect(await api.autoRecordStripeSale({ ...payment, created: 2000 }, { kind: 'direct', bookId: 'b1' })).toMatchObject({ action: 'record', qty: 2 });
  expect(api.writes[0][3]).toMatchObject({ amount: 40, currency: 'EUR', convertedTotal: 62, rate: 1.55, rateSource: 'Frankfurter', rateDate: '2026-10-07' });
  expect(api.writes[0][6]).toMatchObject({ num: 'STRIPE-Test42', auto: true });
});

it('does not automatically record a payment already recorded while the rate was loading', async () => {
  let finish;
  const api = autoRecorder(() => new Promise(done => { finish = done; }));
  const recording = api.autoRecordStripeSale({ ...payment, created: 2000 }, { kind: 'direct', bookId: 'b1' });
  api.recorded.add(payment.id);
  finish({ rate: 1.55 });
  expect(await recording).toBe(null);
  expect(api.writes).toHaveLength(0);
});

it.each(['disabled', 'dismissed'])('does not record when the owner changed the payment to %s during lookup', async change => {
  let finish;
  const api = autoRecorder(() => new Promise(done => { finish = done; }));
  const recording = api.autoRecordStripeSale({ ...payment, created: 2000 }, { kind: 'direct', bookId: 'b1' });
  if (change === 'disabled') api.flags.enabled = false;
  else api.flags.kind = 'dismissed';
  finish({ rate: 1.55 });
  expect(await recording).toBe(null);
  expect(api.writes).toHaveLength(0);
});

it('never records by itself a payment she undid from the Payments list', async () => {
  const api = autoRecorder(async () => ({ rate: 1.55, source: 'Frankfurter', date: '2026-10-07' }));
  const outcome = await buildHarness({ names: ['autoRecordStripeSale'], deps: {
    ...currencyDeps, stripeSaleAutoEnabled: () => true,
    getReconMemory: () => ({ recorded: {}, dismissed: {}, reopened: { [payment.id]: true } }),
  }, returns: '{ autoRecordStripeSale }' }).autoRecordStripeSale({ ...payment, created: 2000 }, { kind: 'direct', bookId: 'b1' });
  expect(outcome).toBe(null);
  expect(api.writes).toHaveLength(0);
});

describe('Confirm all in the Ready section', () => {
  function confirmAll({ fields, recorded = [], confirm = true, rate } = {}) {
    const payments = [payment, { ...payment, id: 'ch_Second42' }, { ...payment, id: 'ch_Already42' }];
    const mem = { recorded: {}, dismissed: {}, reopened: { ch_Second42: true } };
    const rows = [];
    const asked = [];
    const api = buildHarness({ names: ['reconConfirmReady', '_reconRowPick', '_reconApplyPaymentToBook', '_reconMarkRecorded'], deps: {
      ...currencyDeps, window: { _reconPayments: payments, _reconReadyIds: payments.map(p => p.id) },
      document: { getElementById: id => fields[id] == null ? null : { value: fields[id], dataset: { source: 'Frankfurter' } } },
      _reconRecordedChargeIds: () => new Set(recorded), _reconAlreadyRecorded: id => recorded.includes(id),
      classifyStripePayment: p => ({ kind: recorded.includes(p.id) ? 'recorded' : 'direct' }), _reconIsPickable: () => true,
      confirmDialog: async (msg, opts) => { asked.push(opts); return confirm; },
      resolveStripeRate: async () => rate || {}, _stripeFmtMoney: (a, c) => `${c} ${a}`,
      getReconMemory: () => mem, saveReconMemory: () => {}, _reconSession: { logged: 0 },
      _reconApplySaleToBook: (...args) => rows.push(args), showToast: () => {}, renderReconcile: () => {}, activeBook: 'other',
      updateDash: () => {},
    }, returns: '{ reconConfirmReady }' });
    return { ...api, rows, mem, asked };
  }

  it('records each row with the book, copies and order number it shows, and skips one already recorded', async () => {
    const all = confirmAll({ recorded: ['ch_Already42'], fields: {
      'recon-book-ch_Test42': 'b1', 'recon-qty-ch_Test42': '2', 'recon-num-ch_Test42': 'FAIR-1', 'recon-rate-ch_Test42': '1.55',
      'recon-book-ch_Second42': 'b1', 'recon-qty-ch_Second42': '1', 'recon-rate-ch_Second42': '1.5',
      'recon-book-ch_Already42': 'b1',
    } });
    await all.reconConfirmReady();
    expect(all.asked[0].details).toHaveLength(2);
    expect(all.rows.map(args => [args[1], args[6].num])).toEqual([[2, 'FAIR-1'], [1, 'STRIPE-Second42']]);
    expect(all.rows[0][3]).toMatchObject({ amount: 40, currency: 'EUR', rate: 1.55 });
    expect(all.mem.recorded.ch_Second42.num).toBe('STRIPE-Second42');
    // Recorded again after an Undo: no longer waiting to be recorded.
    expect(all.mem.reopened.ch_Second42).toBeUndefined();
    expect(all.mem.recorded.ch_Already42).toBeUndefined();
  });

  it('records nothing when she cancels the confirm', async () => {
    const all = confirmAll({ confirm: false, fields: { 'recon-book-ch_Test42': 'b1', 'recon-rate-ch_Test42': '1.55' } });
    await all.reconConfirmReady();
    expect(all.rows).toHaveLength(0);
  });

  it('looks up the payment day’s rate for a row whose rate has not loaded yet', async () => {
    const all = confirmAll({ rate: { rate: 1.6, source: 'Frankfurter', date: '2026-10-07' }, fields: { 'recon-book-ch_Test42': 'b1' } });
    await all.reconConfirmReady();
    expect(all.rows[0][3]).toMatchObject({ rate: 1.6, rateSource: 'Frankfurter', rateDate: '2026-10-07' });
  });
});

it('records a sale through the app’s own euro link as one copy, converted at the day’s rate', async () => {
  const api = autoRecorder(async () => ({ rate: 1.62, source: 'Frankfurter', date: '2026-10-07' }));
  const linked = { ...payment, created: 2000, description: 'Test Book (EUR 40.00)', metadata: { book_id: 'b1', override: 'true' } };
  expect(await api.autoRecordStripeSale(linked, { kind: 'direct', bookId: 'b1' })).toMatchObject({ action: 'record', qty: 1 });
  expect(api.writes[0][1]).toBe(1);
  expect(api.writes[0][3]).toMatchObject({ amount: 40, currency: 'EUR', convertedTotal: 64.8, rate: 1.62 });
});

describe('pressing Sync records the sales that are ready', () => {
  function syncPass({ enabled = true, outcomes = {} } = {}) {
    const mem = { recorded: {}, dismissed: {} };
    const asked = [];
    const repaint = [];
    const api = buildHarness({ names: ['recordReadyStripeSales'], deps: {
      window: { IS_PUBLISHER: true }, isAuthor: () => false, RECON_AUTO_BUDGET_MS: 15000,
      stripeSaleAutoEnabled: () => enabled, stripeOrderNumber,
      classifyStripePayment: p => ({ kind: p.kind, bookId: 'b1' }),
      autoRecordStripeSale: async p => { asked.push(p.id); return outcomes[p.id] || null; },
      getReconMemory: () => mem, saveReconMemory: () => repaint.push('saved'),
      renderHist: () => repaint.push('hist'), updateDash: () => repaint.push('dash'),
    }, returns: '{ recordReadyStripeSales }' });
    return { ...api, mem, asked, repaint };
  }
  const list = [
    { id: 'ch_ready', kind: 'direct' },
    { id: 'ch_check', kind: 'direct' },
    { id: 'ch_invoice', kind: 'invoice' },
    { id: 'ch_refunded', kind: 'direct', refunded: true },
  ];

  it('records only direct payments the background rules accept, and remembers them', async () => {
    const pass = syncPass({ outcomes: {
      ch_ready: { action: 'record', bookId: 'b1', qty: 1, chargeId: 'ch_ready', bookTitle: 'Test Book' },
      ch_check: { action: 'review', reason: 'amount', chargeId: 'ch_check' },
    } });
    const done = await pass.recordReadyStripeSales(list);
    expect(done.map(o => o.chargeId)).toEqual(['ch_ready']);
    expect(pass.asked).toEqual(['ch_ready', 'ch_check']);
    expect(pass.mem.recorded.ch_ready).toMatchObject({ bookId: 'b1', num: 'STRIPE-ready' });
    expect(pass.mem.recorded.ch_check).toBeUndefined();
    expect(pass.repaint).toEqual(['saved', 'hist', 'dash']);
  });

  it('records nothing when she has switched automatic recording off', async () => {
    const pass = syncPass({ enabled: false });
    expect(await pass.recordReadyStripeSales(list)).toEqual([]);
    expect(pass.asked).toEqual([]);
  });

  it('stops starting new lookups once its time is up, leaving the rest in the list', async () => {
    const pass = syncPass();
    expect(await pass.recordReadyStripeSales(list, { budgetMs: -1 })).toEqual([]);
    expect(pass.asked).toEqual([]);
  });
});

it('never records a payment from before the new counting rules first ran, which she may have typed in by hand', async () => {
  const api = autoRecorder(async () => ({ rate: 1.62, source: 'Frankfurter' }));
  api.flags.rulesSince = 5000;
  const linked = { ...payment, created: 2000, description: 'Test Book (EUR 40.00)', metadata: { book_id: 'b1', override: 'true' } };
  expect(await api.autoRecordStripeSale(linked, { kind: 'direct', bookId: 'b1' })).toBe(null);
  expect(api.writes).toHaveLength(0);
});

it('leaves the one-time alert alone when Sync finds a payment that needs her', async () => {
  const api = autoRecorder(async () => ({ error: 'rate-unavailable' }));
  let raised = 0;
  const outcome = await buildHarness({ names: ['autoRecordStripeSale'], deps: {
    ...currencyDeps, BOOKS: { b1: { ...BOOKS.b1, listPrice: 31 } }, states: { b1: {} }, stripeSalePlan,
    stripeSaleAutoEnabled: () => true, booksInDescription: () => [], _reconLikelyAlreadyLogged: () => false,
    stripeSaleAutoSince: () => 1000, stripeSaleRulesSince: () => 0, resolveStripeRate: async () => ({}),
    _reconRecordedChargeIds: () => new Set(), classifyStripePayment: () => ({ kind: 'direct', bookId: 'b1' }),
    readRaisedStripeSales: () => [], noteRaisedStripeSale: () => { raised++; }, noteUnmatchedReaderPayment: () => {},
  }, returns: '{ autoRecordStripeSale }' }).autoRecordStripeSale({ ...payment, created: 2000 }, { kind: 'direct', bookId: 'b1' }, { raise: false });
  expect(outcome).toMatchObject({ action: 'review', reason: 'currency' });
  expect(raised).toBe(0);
  expect(api.writes).toHaveLength(0);
});

it('treats a register row in the same currency within 10% as possibly the same sale', () => {
  const states = { b1: { hist: [{ date: '2026-10-08', payment: { currency: 'EUR', amount: 37.42 } }] } };
  const api = buildHarness({ names: ['_reconLikelyAlreadyLogged', '_reconLoggedPayments'], deps: { states, normalizeCurrencyCode: currencyDeps.normalizeCurrencyCode }, returns: '{ _reconLikelyAlreadyLogged }' });
  const pay = { ...payment, created: Date.parse('2026-10-08T15:00:00Z') };
  expect(api._reconLikelyAlreadyLogged(pay, { near: true })).toBe(true);
  expect(api._reconLikelyAlreadyLogged(pay)).toBe(false);
  expect(api._reconLikelyAlreadyLogged({ ...pay, amount: 55 }, { near: true })).toBe(false);
});

// A fair weekend: two $20 taps of the same book thirteen minutes apart. The
// first one, recorded from Stripe, used to hold the second as "maybe rung up".
it('never mistakes a sale recorded from another Stripe payment for this one', () => {
  const states = { b1: { hist: [{ date: '2026-11-22', sheetsId: 'stripe-ch_first', payment: { currency: 'CAD', amount: 20, ref: 'ch_first' } }] } };
  const api = buildHarness({ names: ['_reconLikelyAlreadyLogged', '_reconLoggedPayments'], deps: { states, normalizeCurrencyCode: currencyDeps.normalizeCurrencyCode }, returns: '{ _reconLikelyAlreadyLogged }' });
  const second = { ...payment, id: 'ch_second', currency: 'CAD', amount: 20, created: Date.parse('2026-11-22T19:27:00Z') };
  expect(api._reconLikelyAlreadyLogged(second, { near: true, bookIds: ['b1'] })).toBe(false);
  expect(api._reconLikelyAlreadyLogged(second, { near: true })).toBe(false);
});

it('only holds a book payment for a hand-typed sale of the same book', () => {
  const states = {
    b1: { hist: [] },
    b2: { hist: [{ date: '2026-11-22', payment: { currency: 'CAD', amount: 20 } }] },
  };
  const api = buildHarness({ names: ['_reconLikelyAlreadyLogged', '_reconLoggedPayments'], deps: { states, normalizeCurrencyCode: currencyDeps.normalizeCurrencyCode }, returns: '{ _reconLikelyAlreadyLogged }' });
  const tap = { ...payment, currency: 'CAD', amount: 20, created: Date.parse('2026-11-22T19:14:00Z') };
  // A $20 cash sale of another title is not this card sale…
  expect(api._reconLikelyAlreadyLogged(tap, { near: true, bookIds: ['b1'] })).toBe(false);
  // …but the same title rung up by hand still is, and so is anything for an untagged payment.
  expect(api._reconLikelyAlreadyLogged(tap, { near: true, bookIds: ['b2'] })).toBe(true);
  expect(api._reconLikelyAlreadyLogged(tap, { near: true, bookIds: [null] })).toBe(true);
  expect(api._reconLikelyAlreadyLogged(tap, { near: true })).toBe(true);
});

it('answers the same from a prebuilt list of logged payments as from a fresh scan', () => {
  const states = {
    b1: { hist: [{ date: '2026-10-08', payment: { currency: 'eur', amount: 40 } }, { date: '2026-10-08', voided: true, payment: { currency: 'EUR', amount: 12 } }] },
    b2: { hist: [{ date: '2026-09-01', payment: { currency: 'CAD', amount: 25 } }, { date: '2026-10-08', gratuity: true, payment: { currency: 'CAD', amount: 9 } }] },
  };
  const api = buildHarness({ names: ['_reconLikelyAlreadyLogged', '_reconLoggedPayments'], deps: { states, normalizeCurrencyCode: currencyDeps.normalizeCurrencyCode }, returns: '{ _reconLikelyAlreadyLogged, _reconLoggedPayments }' });
  const logged = api._reconLoggedPayments();
  const created = Date.parse('2026-10-08T15:00:00Z');
  const cases = [
    { ...payment, currency: 'EUR', amount: 40, created },
    { ...payment, currency: 'EUR', amount: 12, created },
    { ...payment, currency: 'CAD', amount: 25, created },
    { ...payment, currency: 'CAD', amount: 9, created },
    { ...payment, currency: 'USD', amount: 40, created },
  ];
  for (const pay of cases) {
    for (const near of [false, true]) {
      expect(api._reconLikelyAlreadyLogged(pay, { near, logged })).toBe(api._reconLikelyAlreadyLogged(pay, { near }));
    }
  }
  expect(cases.map(pay => api._reconLikelyAlreadyLogged(pay, { logged }))).toEqual([true, false, false, false, false]);
});
