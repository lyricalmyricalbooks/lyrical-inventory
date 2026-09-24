// @vitest-environment jsdom
import { describe, expect, test, vi } from 'vitest';
import { FAIR_METHODS, FAIR_UNDO_MS, readLastMethod, rememberMethod, undoOpen, soldLabel, countLabel, fairTileHtml, keepScreenAwake } from '../src/lib/fair-mode.js';

const memStore = () => { const m = new Map(); return { getItem: k => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)) }; };

describe('payment memory', () => {
  test('defaults to the card reader and remembers a real method', () => {
    const st = memStore();
    expect(readLastMethod(st)).toBe('Card');
    rememberMethod('Stripe QR', st);
    expect(readLastMethod(st)).toBe('Stripe QR');
  });
  test('ignores unknown values and storage that throws', () => {
    const st = memStore();
    rememberMethod('Bitcoin', st);
    expect(readLastMethod(st)).toBe('Card');
    const broken = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } };
    expect(() => rememberMethod('Cash', broken)).not.toThrow();
    expect(readLastMethod(broken)).toBe('Card');
  });
  test('every method is one the register already records', () => {
    expect(FAIR_METHODS.map(m => m.value)).toEqual(['Card', 'Stripe QR', 'Bank Transfer', 'Cash', 'Comp/Gift']);
  });
});

describe('undo window', () => {
  test('open right after the sale, closed after the window or for a future time', () => {
    expect(undoOpen(1000, 1000)).toBe(true);
    expect(undoOpen(1000, 1000 + FAIR_UNDO_MS)).toBe(true);
    expect(undoOpen(1000, 1001 + FAIR_UNDO_MS)).toBe(false);
    expect(undoOpen(2000, 1000)).toBe(false);
    expect(undoOpen(undefined, 1000)).toBe(false);
  });
});

test('labels read naturally', () => {
  expect(soldLabel(1, '€20.00')).toBe('Sold 1 book · €20.00');
  expect(soldLabel(3, '')).toBe('Sold 3 books');
  expect(countLabel(0)).toBe('0 books');
});

describe('tile', () => {
  const stock = (onHand, inCart) => ({ tracked: true, onHand, remaining: onHand - inCart, level: onHand - inCart < 0 ? 'short' : 'ok' });
  test('tap adds one; minus appears only once in the sale', () => {
    const empty = fairTileHtml({ id: 'b1', title: 'Moth <Poems>', priceText: '€20.00', qty: 0, stock: stock(5, 0) });
    expect(empty).toContain('posUpdateQty(&quot;b1&quot;, 1)');
    expect(empty).not.toContain('fm-tile-minus');
    expect(empty).toContain('Moth &lt;Poems&gt;');
    expect(empty).toContain('5 left');
    const inCart = fairTileHtml({ id: 'b1', title: 'Moth', priceText: '€20.00', qty: 2, stock: stock(5, 2) });
    expect(inCart).toContain('is-in-cart');
    expect(inCart).toContain('posUpdateQty(&quot;b1&quot;, -1)');
    expect(inCart).toContain('3 left');
  });
  test('last copy, sold out and untracked stock', () => {
    expect(fairTileHtml({ id: 'a', title: 'A', priceText: '1', qty: 0, stock: stock(1, 0) })).toContain('Last copy');
    const out = fairTileHtml({ id: 'a', title: 'A', priceText: '1', qty: 0, stock: stock(0, 0) });
    expect(out).toContain('Sold out');
    expect(out).toContain('is-out');
    expect(fairTileHtml({ id: 'a', title: 'A', priceText: '1', qty: 0, stock: { tracked: false } })).not.toContain('fm-tile-stock');
  });
  test('an id with a quote cannot break out of the handler', () => {
    const html = fairTileHtml({ id: `x");alert(1);("`, title: 'A', priceText: '1' });
    document.body.innerHTML = html;
    const onclick = document.querySelector('.fm-tile-add').getAttribute('onclick');
    expect(onclick).toBe('posUpdateQty("x\\");alert(1);(\\"", 1)');
  });
});

describe('screen wake lock', () => {
  test('requests on start, re-requests when the page comes back, releases on stop', async () => {
    const release = vi.fn(() => Promise.resolve());
    const request = vi.fn(() => Promise.resolve({ release, addEventListener() {} }));
    const doc = document;
    Object.defineProperty(doc, 'visibilityState', { configurable: true, get: () => 'visible' });
    const stop = keepScreenAwake({ wakeLock: { request } }, doc);
    await Promise.resolve(); await Promise.resolve();
    expect(request).toHaveBeenCalledTimes(1);
    stop();
    expect(release).toHaveBeenCalled();
    doc.dispatchEvent(new Event('visibilitychange'));
    expect(request).toHaveBeenCalledTimes(1);
  });
  test('no wake lock support is a quiet no-op', () => {
    expect(() => keepScreenAwake({}, document)()).not.toThrow();
  });
});
