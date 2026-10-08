// Foreign-currency expenses and sales against the real app (src/main.js), with
// the exchange-rate services faked. A foreign receipt must never be booked 1:1
// because no rate happened to be cached, and a past sale must be valued at its
// own date's rate.
import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest';
import { loadApp, makeBook } from './helpers/load-app.js';
import { FX_HISTORY_KEY } from '../src/lib/sale-fx.js';

const EUR_BOOK = 'altrove';
let app;

/** Answer the rate services from a table; anything else fails like no network. */
function fakeRates({ live = {}, byDate = {}, series = {} } = {}) {
  const calls = [];
  vi.stubGlobal('fetch', vi.fn(async (url) => {
    calls.push(String(url));
    const u = new URL(String(url));
    const json = (body) => ({ ok: true, status: 200, json: async () => body });
    if (u.hostname === 'open.er-api.com') {
      const from = u.pathname.split('/').pop();
      return json({ rates: live[from] || {} });
    }
    if (u.hostname === 'api.frankfurter.app') {
      const from = u.searchParams.get('from');
      const path = u.pathname.slice(1);
      if (path.includes('..')) {
        // The range endpoint answers { rates: { 'YYYY-MM-DD': { CAD: rate } } }.
        const days = Object.fromEntries(Object.entries(series[from] || {}).map(([d, r]) => [d, { CAD: r }]));
        return json({ rates: days });
      }
      const rate = byDate[`${from}@${path}`];
      return rate ? json({ rates: { CAD: rate } }) : { ok: false, status: 404, json: async () => ({}) };
    }
    throw new Error('network disabled in tests');
  }));
  return calls;
}

beforeAll(async () => {
  app = await loadApp({ books: [makeBook({ id: EUR_BOOK, currency: '€' })] });
}, 30000);

afterEach(() => {
  vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('network disabled in tests'))));
});

describe('resolveExpenseRate', () => {
  it('uses the rate for the expense\'s own date', async () => {
    fakeRates({ byDate: { 'USD@2025-02-03': 1.44 } });
    expect(await app.main.resolveExpenseRate('USD', '2025-02-03')).toBe(1.44);
  });

  it('returns 0 — not 1 — when no rate can be found', async () => {
    fakeRates();
    expect(await app.main.resolveExpenseRate('JPY', '2025-02-04')).toBe(0);
  });

  it('is 1 for CAD without asking anyone', async () => {
    const calls = fakeRates();
    expect(await app.main.resolveExpenseRate('CAD', '2025-02-03')).toBe(1);
    expect(calls).toHaveLength(0);
  });
});

describe('healExpenseRates', () => {
  it('fills in an expense logged offline and corrects one booked 1:1, leaving good ones alone', async () => {
    const tc = app.main.TAX_CENTER;
    tc.businessExpenses = [
      { id: 1, currency: 'USD', amount: 100, fxRate: null, baseAmount: null, fxMissing: true, date: '2025-03-03' },
      { id: 2, currency: 'USD', amount: 50, fxRate: 1, baseAmount: 50, date: '2025-03-04' },
      { id: 3, currency: 'USD', amount: 10, fxRate: 1.3, baseAmount: 13, date: '2025-03-05' },
      { id: 4, currency: 'CAD', amount: 20, fxRate: 1, baseAmount: 20, date: '2025-03-05' },
    ];
    fakeRates({ byDate: { 'USD@2025-03-03': 1.4, 'USD@2025-03-04': 1.41 } });
    const fixed = await app.main.healExpenseRates();
    expect(fixed).toBe(2);
    const [a, b, c, d] = tc.businessExpenses;
    expect(a).toMatchObject({ fxRate: 1.4, baseAmount: 140, fxMissing: false });
    expect(b).toMatchObject({ fxRate: 1.41, baseAmount: 70.5 });
    expect(c).toMatchObject({ fxRate: 1.3, baseAmount: 13 });
    expect(d).toMatchObject({ fxRate: 1, baseAmount: 20 });
    expect(app.cloud.settings.taxCenter.businessExpenses[0].baseAmount).toBe(140);
  });

  it('leaves an expense flagged when still offline', async () => {
    const tc = app.main.TAX_CENTER;
    tc.businessExpenses = [{ id: 9, currency: 'GBP', amount: 10, fxRate: null, baseAmount: null, fxMissing: true, date: '2025-05-05' }];
    fakeRates();
    expect(await app.main.healExpenseRates()).toBe(0);
    expect(tc.businessExpenses[0]).toMatchObject({ baseAmount: null, fxMissing: true });
  });
});

describe('warmSaleFxHistory', () => {
  it('fetches one date range per currency and keeps the rates on the device', async () => {
    const s = app.main.states[EUR_BOOK];
    s.hist = [
      { num: 'E1', qty: 1, price: 10, date: '2025-01-06' },
      { num: 'E2', qty: 1, price: 10, date: '2025-01-11' }, // a Saturday
    ];
    const calls = fakeRates({ series: { EUR: { '2025-01-06': 1.49, '2025-01-10': 1.47 } } });
    expect(await app.main.warmSaleFxHistory()).toBe(true);
    expect(calls.filter(c => c.includes('..'))).toHaveLength(1);
    expect(app.main._fxRateCache['EUR_CAD@2025-01-06']).toBe(1.49);
    expect(app.main._fxRateCache['EUR_CAD@2025-01-11']).toBe(1.47);
    expect(JSON.parse(localStorage.getItem(FX_HISTORY_KEY))['EUR_CAD@2025-01-11']).toBe(1.47);

    // Nothing left to fetch the second time.
    const again = fakeRates();
    expect(await app.main.warmSaleFxHistory()).toBe(false);
    expect(again).toHaveLength(0);
  });
});
