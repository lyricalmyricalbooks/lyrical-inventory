import { beforeEach, describe, expect, it } from 'vitest';
import { buildHarness } from './helpers/extract-decl.js';
import { stripeOrderNumber } from '../src/lib/stripe-sale-defaults.js';
import { roundCents } from '../src/lib/money.js';
import { stripeSalePlan } from '../src/lib/stripe-sale-autorecord.js';

const payment = { id: 'ch_Test42', currency: 'EUR', amount: 40, date: '2026-10-08' };
const BOOKS = { b1: { id: 'b1', currency: 'CAD' }, b2: { id: 'b2', currency: 'USD' } };
const currencyDeps = {
  BOOKS, roundCents, stripeOrderNumber,
  getBookCurrencyCode: book => book.currency,
  normalizeCurrencyCode: (value, fallback) => String(value || fallback).toUpperCase(),
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

it('keeps the previous business day on a warmed historical-rate cache', async () => {
  const api = buildHarness({ names: ['fetchHistoricalRate'], deps: {
    _fxRateCache: {}, _fxHistoricalDates: {}, AbortSignal,
    fetch: async () => ({ ok: true, json: async () => ({ date: '2026-10-02', rates: { CAD: 1.55 } }) }),
  }, returns: '{ fetchHistoricalRate }' });
  expect(await api.fetchHistoricalRate('EUR', 'CAD', '2026-10-04')).toEqual({ rate: 1.55, date: '2026-10-02' });
  expect(await api.fetchHistoricalRate('EUR', 'CAD', '2026-10-04')).toEqual({ rate: 1.55, date: '2026-10-02' });
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

function screen(resolve) {
  document.body.innerHTML = `<select id="recon-book-ch_Test42"><option value="b1">CAD book</option><option value="b2">USD book</option></select>
    <input id="recon-currency-ch_Test42" value="EUR"><input id="recon-amount-ch_Test42" value="40">
    <input id="recon-rate-ch_Test42"><input id="recon-num-ch_Test42" value="STRIPE-Test42">
    <button id="recon-rec-ch_Test42"></button><div id="recon-fx-ch_Test42"></div>`;
  return buildHarness({ names: ['reconUpdateDefaults'], deps: {
    ...currencyDeps, document, window,
    _reconFindPayment: () => payment,
    resolveStripeRate: resolve,
    _stripeFmtMoney: (amount, currency) => `${currency} ${amount.toFixed(2)}`,
  }, returns: '{ reconUpdateDefaults }' });
}

describe('Stripe rate fields', () => {
  beforeEach(() => { document.body.innerHTML = ''; });
  it('fills the dated rate and converted amount without repainting the form', async () => {
    const api = screen(async () => ({ rate: 1.55, date: '2026-10-07' }));
    await api.reconUpdateDefaults('ch_Test42');
    expect(document.getElementById('recon-rate-ch_Test42').value).toBe('1.55');
    expect(document.getElementById('recon-fx-ch_Test42').textContent).toContain('CAD 62.00');
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
});

function autoRecorder(resolve, recorded = new Set()) {
  const writes = [];
  const flags = { enabled: true, kind: 'direct' };
  const book = { ...BOOKS.b1, listPrice: 31, title: 'Test Book' };
  const deps = {
    ...currencyDeps, BOOKS: { b1: book }, states: { b1: { stock: 8 } },
    stripeSalePlan, stripeSaleAutoEnabled: () => flags.enabled, booksInDescription: () => [],
    _reconLikelyAlreadyLogged: () => false, stripeSaleAutoSince: () => 1000,
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

it('assigns individual references when recording a group and skips payments already in the ledger', () => {
  const payments = [payment, { ...payment, id: 'ch_Second42' }, { ...payment, id: 'ch_Already42' }];
  const fields = { 'recon-gbook-0': 'b1', 'recon-gqty-0': '1', 'recon-gamount-0': '40', 'recon-gcurrency-0': 'EUR', 'recon-grate-0': '1.55' };
  const mem = { recorded: {}, dismissed: {} };
  const rows = [];
  const api = buildHarness({ names: ['reconRecordGroup', '_reconReadSaleInputs', '_reconApplyPaymentToBook'], deps: {
    ...currencyDeps, window: { _reconPayments: payments, _reconGroupMap: { 0: payments.map(p => p.id) } },
    document: { getElementById: id => fields[id] == null ? null : { value: fields[id], dataset: { source: 'Frankfurter' } } },
    _reconRecordedChargeIds: () => new Set(['ch_Already42']),
    getReconMemory: () => mem, saveReconMemory: () => {}, _reconSession: { logged: 0 },
    _reconApplySaleToBook: (...args) => rows.push(args), showToast: () => {}, renderReconcile: () => {}, activeBook: 'other',
  }, returns: '{ reconRecordGroup }' });
  api.reconRecordGroup(0);
  expect(rows.map(args => args[6].num)).toEqual(['STRIPE-Test42', 'STRIPE-Second42']);
  expect(mem.recorded.ch_Second42.num).toBe('STRIPE-Second42');
  expect(mem.recorded.ch_Already42).toBeUndefined();
});
