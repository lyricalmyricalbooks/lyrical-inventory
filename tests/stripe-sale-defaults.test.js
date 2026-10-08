import { describe, expect, it } from 'vitest';
import { stripeOrderNumber, createStripeRateResolver } from '../src/lib/stripe-sale-defaults.js';

const payment = { id: 'ch_AbCd123456789', currency: 'EUR', amount: 40, date: '2026-10-08' };
const storage = () => {
  const values = new Map();
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
};

describe('Stripe order references', () => {
  it('uses a supplied order number before generating one', () => {
    expect(stripeOrderNumber({ ...payment, metadata: { order_number: '#WEB-42' } })).toBe('#WEB-42');
    expect(stripeOrderNumber({ ...payment, description: 'Payment for Big Cartel order #ABCD-42' })).toBe('#ABCD-42');
  });
  it('gives each charge a stable, case-preserving reference without truncating it', () => {
    expect(stripeOrderNumber(payment)).toBe('STRIPE-AbCd123456789');
    expect(stripeOrderNumber({ ...payment, id: 'ch_abCd123456789' })).toBe('STRIPE-abCd123456789');
    expect(stripeOrderNumber({ ...payment, id: '' })).toBe('');
  });
});

describe('dated Stripe conversion', () => {
  it('converts in the paid-to-book direction and survives an offline reload', async () => {
    const saved = storage();
    const resolve = createStripeRateResolver({ storage: saved, fetchRate: async (from, to, date) => {
      expect([from, to, date]).toEqual(['EUR', 'CAD', '2026-10-08']);
      return { rate: 1.55, date: '2026-10-07' };
    } });
    expect(await resolve(payment, 'CAD')).toMatchObject({ rate: 1.55, date: '2026-10-07', source: 'Frankfurter' });
    const offline = createStripeRateResolver({ storage: saved, fetchRate: async () => { throw new Error('offline'); } });
    expect(await offline(payment, 'CAD')).toMatchObject({ rate: 1.55, date: '2026-10-07' });
    expect(await offline({ ...payment, date: '2026-10-09' }, 'CAD')).toMatchObject({ error: 'rate-unavailable' });
  });
  it('never substitutes today’s rate or a made-up rate when a historical lookup fails', async () => {
    const resolve = createStripeRateResolver({ fetchRate: async () => ({ rate: Infinity }) });
    expect(await resolve(payment, 'CAD')).toMatchObject({ error: 'rate-unavailable' });
    expect(await resolve({ ...payment, currency: 'CAD' }, 'CAD')).toMatchObject({ rate: 1 });
  });
  it('shares simultaneous lookups and retries failed lookups', async () => {
    let finish;
    let calls = 0;
    const resolve = createStripeRateResolver({ fetchRate: () => {
      calls++;
      return new Promise(done => { finish = done; });
    } });
    const a = resolve(payment, 'CAD');
    const b = resolve(payment, 'CAD');
    finish({ error: 'network' });
    expect((await a).error).toBe('rate-unavailable');
    await b;
    expect(calls).toBe(1);
    const retry = resolve(payment, 'CAD');
    finish({ rate: 1.55 });
    expect((await retry).rate).toBe(1.55);
    expect(calls).toBe(2);
  });
  it('ignores malformed saved rates and remains usable when storage is blocked', async () => {
    const resolve = createStripeRateResolver({
      storage: { getItem: () => '{broken', setItem: () => { throw new Error('full'); } },
      fetchRate: async () => ({ rate: 1.55 }),
    });
    expect((await resolve(payment, 'CAD')).rate).toBe(1.55);
    expect((await resolve({ ...payment, date: 'bad' }, 'CAD')).error).toBe('bad-date');
  });
});
