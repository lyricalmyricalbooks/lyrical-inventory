import { describe, it, expect, vi, afterEach } from 'vitest';
import { createStripePriceAndLink } from '../src/lib/stripe-payment-link.js';

const ok = body => ({ ok: true, status: 200, json: async () => body });
const fail = (status, message) => ({ ok: false, status, json: async () => ({ error: { message } }) });

afterEach(() => vi.unstubAllGlobals());

describe('createStripePriceAndLink', () => {
  it('creates the price, then a link that sells it', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(ok({ id: 'price_1' }))
      .mockResolvedValueOnce(ok({ id: 'plink_1', url: 'https://buy.stripe.com/x' }));
    vi.stubGlobal('fetch', fetchMock);

    const linkParams = new URLSearchParams({ 'line_items[0][quantity]': '1' });
    const { price, link } = await createStripePriceAndLink('rk_test', new URLSearchParams({ unit_amount: '500' }), linkParams);

    expect(price.id).toBe('price_1');
    expect(link.url).toBe('https://buy.stripe.com/x');
    expect(fetchMock.mock.calls[0][0]).toBe('https://api.stripe.com/v1/prices');
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe('Bearer rk_test');
    expect(fetchMock.mock.calls[1][0]).toBe('https://api.stripe.com/v1/payment_links');
    expect(new URLSearchParams(fetchMock.mock.calls[1][1].body).get('line_items[0][price]')).toBe('price_1');
  });

  it('adds the key-scope hint to a permission failure only when asked', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(fail(403, 'The provided key rak_x does not have permission')));
    await expect(createStripePriceAndLink('rk', new URLSearchParams(), new URLSearchParams(), { permissionHint: true }))
      .rejects.toThrow(/^Stripe price: .*needs Write on Prices, Products and Payment Links\.$/);
    await expect(createStripePriceAndLink('rk', new URLSearchParams(), new URLSearchParams()))
      .rejects.toThrow('Stripe price: The provided key rak_x does not have permission');
  });

  it('names the link step when the second call fails, falling back to the HTTP status', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(ok({ id: 'price_1' }))
      .mockResolvedValueOnce({ ok: false, status: 500, json: async () => { throw new Error('not json'); } }));
    await expect(createStripePriceAndLink('rk', new URLSearchParams(), new URLSearchParams()))
      .rejects.toThrow('Stripe payment link: HTTP 500');
  });
});
