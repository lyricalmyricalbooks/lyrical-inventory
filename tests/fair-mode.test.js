// @vitest-environment jsdom
import { describe, expect, test, vi } from 'vitest';
import { saleMethod, fairDaySummary, readCurrentFair, saveCurrentFair, fairSyncPill, registerSalesForDay, eventTime, FAIR_METHODS, FAIR_UNDO_MS, readLastMethod, rememberMethod, undoOpen, soldLabel, countLabel, fairTileHtml, keepScreenAwake } from '../src/lib/fair-mode.js';

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

describe('upload pill', () => {
  test('says the good news, the waiting count, and no signal', () => {
    expect(fairSyncPill({ online: true, pending: 0 })).toMatchObject({ tone: 'ok', text: 'All uploaded ✓' });
    expect(fairSyncPill({ online: true, pending: 2 }).text).toBe('Uploading · 2 changes waiting to upload');
    expect(fairSyncPill({ online: true, pending: 1, retrying: true }).tone).toBe('failed');
    expect(fairSyncPill({ online: false, pending: 3 })).toMatchObject({ tone: 'offline', text: 'No signal · 3 saved on this phone' });
    expect(fairSyncPill({ online: false, pending: 0 }).text).toBe('No signal · sales save on this phone');
  });
  test('warns loudest when the phone could not store the queue', () => {
    expect(fairSyncPill({ online: false, pending: 2, atRisk: true })).toMatchObject({ tone: 'failed', text: 'Keep the app open · 2 changes waiting to upload' });
  });
});

describe("today's register sales", () => {
  const t = (ms) => `evt-${ms.toString(36)}-abc`;
  const books = [
    { id: 'a', title: 'Harbour', currency: 'CAD', hist: [
      { num: 'POS-2', chan: 'Book Fair', date: '2026-09-24', qty: 1, price: 40, cur: 'CAD', sheetsId: t(2000) },
      { num: 'POS-1', chan: 'Book Fair', date: '2026-09-24', qty: 2, price: 40, cur: 'CAD', sheetsId: t(1000) },
      { num: 'POS-0', chan: 'Book Fair', date: '2026-09-23', qty: 1, price: 40, cur: 'CAD', sheetsId: t(500) },
      { num: 'W-9', chan: 'Website', date: '2026-09-24', qty: 1, price: 40, cur: 'CAD', sheetsId: t(1500) },
      { num: 'POS-3', chan: 'Book Fair', date: '2026-09-24', qty: 1, price: 40, cur: 'CAD', voided: true, sheetsId: t(3000) },
    ] },
    { id: 'b', title: 'Fables', currency: 'EUR', hist: [
      { num: 'POS-1', chan: 'Book Fair', date: '2026-09-24', qty: 1, price: 20, cur: 'EUR', sheetsId: t(1001) },
    ] },
  ];
  test('groups a checkout across books, newest first, only live fair sales from that day', () => {
    const day = registerSalesForDay(books, '2026-09-24');
    expect(day.sales.map((s) => s.num)).toEqual(['POS-2', 'POS-1']);
    expect(day.sales[1].lines.map((l) => l.bookId)).toEqual(['a', 'b']);
    expect(day.sales[1].totals).toEqual({ CAD: 80, EUR: 20 });
    expect(day.totals).toEqual({ CAD: 120, EUR: 20 });
    expect(day.units).toBe(4);
  });
  test('orders by real time even when the short sale numbers wrap', () => {
    const wrapped = [{ id: 'a', title: 'A', hist: [
      { num: 'POS-999990', chan: 'Book Fair', date: 'd', qty: 1, price: 1, sheetsId: t(1_000) },
      { num: 'POS-000010', chan: 'Book Fair', date: 'd', qty: 1, price: 1, sheetsId: t(2_000_000) },
    ] }];
    expect(registerSalesForDay(wrapped, 'd').sales[0].num).toBe('POS-000010');
  });
  test('event ids decode to their time, anything else to 0', () => {
    expect(eventTime(t(123456789))).toBe(123456789);
    expect(eventTime('')).toBe(0);
    expect(eventTime(undefined)).toBe(0);
  });
});

describe('phase 3', () => {
  test('reads the way of paying from a sale note, fair name and all', () => {
    expect(saleMethod('Card · Toronto Art Book Fair')).toBe('Card');
    expect(saleMethod('Stripe QR (printed code, check it arrived in Stripe) · TABF')).toBe('Stripe QR');
    expect(saleMethod('Comp/Gift')).toBe('Comp/Gift');
    expect(saleMethod('')).toBe('Other');
  });
  test('end of day adds up by payment and by book, with copies left', () => {
    const day = { units: 4, totals: { CAD: 120 }, sales: [
      { num: '1', method: 'Card', totals: { CAD: 80 }, lines: [{ bookId: 'a', title: 'Harbour', qty: 2, amount: 80, cur: 'CAD' }] },
      { num: '2', method: 'Stripe QR', totals: { CAD: 40 }, lines: [{ bookId: 'a', title: 'Harbour', qty: 1, amount: 40, cur: 'CAD' }] },
      { num: '3', method: 'Card', totals: { CAD: 0 }, lines: [{ bookId: 'z', title: 'Zine', qty: 1, amount: 0, cur: 'CAD' }] },
    ] };
    const sum = fairDaySummary(day, { a: 7, z: null });
    expect(sum.methods.map((m) => [m.label, m.sales, m.totals.CAD])).toEqual([['Card reader', 2, 80], ['QR / Stripe', 1, 40]]);
    expect(sum.titles[0]).toMatchObject({ title: 'Harbour', units: 3, left: 7, totals: { CAD: 120 } });
    expect(sum.titles[1].left).toBeNull();
    expect(sum.sales).toBe(3);
  });
  test('the fair name is kept for today only, tidied, and cleared when emptied', () => {
    const st = memStore(); st.removeItem = (k) => st.setItem(k, 'null');
    expect(saveCurrentFair('  Toronto   Art Book Fair ', '2026-09-24', st)).toBe('Toronto Art Book Fair');
    expect(readCurrentFair('2026-09-24', st)).toEqual({ name: 'Toronto Art Book Fair', day: '2026-09-24' });
    expect(readCurrentFair('2026-09-25', st)).toBeNull();
    expect(saveCurrentFair('', '2026-09-24', st)).toBeNull();
    expect(readCurrentFair('2026-09-24', st)).toBeNull();
  });
  test('a book with none left asks before adding', () => {
    const html = fairTileHtml({ id: 'a', title: 'A', priceText: '1', qty: 1, stock: { tracked: true, onHand: 1, remaining: 0, level: 'ok' } });
    expect(html).toContain('fairTileNoneLeft(&quot;a&quot;)');
    expect(html).toContain('aria-label="None left: A');
  });
});
