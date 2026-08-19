import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { summariseOrderRows, summaryExclusionNotes } from '../src/lib/order-summary.js';
import { normalizeCurrencyCode, fmt } from '../src/lib/money.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

// Order History is a table of money that never showed a total. Adding one is
// only an improvement if the total is honest: a figure that quietly folds in a
// voided order, a gifted copy, or a sale recorded in another currency looks
// authoritative and is wrong, which is worse than the mental arithmetic it
// replaced.

const hist = (over = {}) => ({ type: 'hist', h: { num: 'A1', qty: 1, price: 30, chan: 'Direct', ...over } });
const consign = (over = {}) => ({ type: 'consign', e: { type: 'Shipment', qty: 10, ...over } });
const pending = (over = {}) => ({ type: 'pending', h: { num: 'P1', qty: 1, price: 30, pendingAuth: true, ...over } });

const opts = { bookCode: 'CAD', normalize: normalizeCurrencyCode };

describe('summariseOrderRows', () => {
  it('totals the orders on screen', () => {
    const sum = summariseOrderRows([
      hist({ qty: 2, price: 24.5 }),
      hist({ qty: 1, price: 30 }),
      hist({ qty: 3, price: 18 }),
    ], opts);

    expect(sum.orders).toBe(3);
    expect(sum.copies).toBe(6);
    expect(sum.gross).toBe(133);       // 49 + 30 + 54
    expect(sum.counted).toBe(3);
    expect(sum.average).toBeCloseTo(44.33, 2);
    expect(sum.excluded).toBe(false);
  });

  it('returns a zeroed summary for an empty list rather than NaN', () => {
    const sum = summariseOrderRows([], opts);
    expect(sum.orders).toBe(0);
    expect(sum.gross).toBe(0);
    expect(sum.average).toBeNull();
    expect(sum.excluded).toBe(false);
  });

  it('survives junk input', () => {
    expect(summariseOrderRows(null, opts).gross).toBe(0);
    expect(summariseOrderRows([null, undefined, {}, { type: 'hist' }], opts).orders).toBe(0);
  });

  it('leaves voided orders out of every figure', () => {
    // A void is struck through in the table. It has to be struck out of the
    // total too, or the screen claims revenue that was cancelled.
    const sum = summariseOrderRows([
      hist({ qty: 1, price: 30 }),
      hist({ qty: 4, price: 100, voided: true }),
    ], opts);

    expect(sum.gross).toBe(30);
    expect(sum.orders).toBe(1);
    expect(sum.copies).toBe(1);
    expect(sum.voided).toBe(1);
    expect(sum.excluded).toBe(true);
  });

  it('counts gifted copies as copies given, never as revenue', () => {
    const sum = summariseOrderRows([
      hist({ qty: 1, price: 30 }),
      hist({ qty: 2, price: 30, gratuity: true }),
      hist({ qty: 1, price: 30, chan: 'Gratuity' }),
    ], opts);

    expect(sum.gross).toBe(30);
    expect(sum.orders).toBe(1);
    expect(sum.gifted).toBe(3);
    expect(sum.giftedOrders).toBe(2);
  });

  it('refuses to sum a foreign-currency order into the book currency', () => {
    // €32 and CA$32 are the same digits and roughly a 50% error. The row
    // renderer already refuses to conflate them; the total refuses too, and
    // says how many orders it stepped around.
    const sum = summariseOrderRows([
      hist({ qty: 1, price: 30 }),
      hist({ qty: 2, price: 32, cur: 'EUR' }),
      hist({ qty: 1, price: 20, cur: '€' }),
    ], opts);

    expect(sum.gross).toBe(30);
    expect(sum.counted).toBe(1);
    expect(sum.orders).toBe(3);       // still orders, still copies off the shelf
    expect(sum.copies).toBe(4);
    expect(sum.foreignOrders).toBe(2);
    expect(sum.foreign).toEqual([{ code: 'EUR', orders: 2, copies: 3 }]);
    expect(sum.average).toBe(30);     // averaged over what was actually counted
  });

  it('treats a row stamped with the book currency as native, symbol or code', () => {
    const sum = summariseOrderRows([
      hist({ qty: 1, price: 30, cur: 'CAD' }),
      hist({ qty: 1, price: 20, cur: 'CA$' }),
    ], opts);

    expect(sum.gross).toBe(50);
    expect(sum.foreignOrders).toBe(0);
  });

  it('holds unapproved artist submissions in their own bucket', () => {
    const sum = summariseOrderRows([
      hist({ qty: 1, price: 30 }),
      pending({ qty: 2, price: 25 }),
    ], opts);

    expect(sum.gross).toBe(30);
    expect(sum.orders).toBe(1);
    expect(sum.pending).toEqual({ orders: 1, copies: 2, gross: 50 });
  });

  it('counts consignment shipments and returns as movements, not sales', () => {
    const sum = summariseOrderRows([
      hist({ qty: 1, price: 30 }),
      consign({ type: 'Shipment', qty: 20 }),
      consign({ type: 'Return', qty: 2 }),
      consign({ type: 'Shipment', qty: 5, voided: true }),
    ], opts);

    expect(sum.gross).toBe(30);
    expect(sum.orders).toBe(1);
    expect(sum.movements).toBe(2);
  });

  it('adds money in cents so a long list cannot drift', () => {
    // 0.1 + 0.2 = 0.30000000000000004 in a running float. Three hundred
    // sales of a fractional price is exactly how that lands on a screen.
    const rows = Array.from({ length: 300 }, () => hist({ qty: 1, price: 0.1 }));
    expect(summariseOrderRows(rows, opts).gross).toBe(30);
  });

  it('handles a missing or unparseable quantity without poisoning the total', () => {
    const sum = summariseOrderRows([
      hist({ qty: 1, price: 30 }),
      hist({ qty: undefined, price: 30 }),
      hist({ qty: 'x', price: 30 }),
      hist({ qty: 2, price: undefined }),
    ], opts);

    expect(Number.isFinite(sum.gross)).toBe(true);
    expect(sum.gross).toBe(30);
    expect(sum.copies).toBe(3);
  });

  it('works without a book currency, treating every row as native', () => {
    const sum = summariseOrderRows([
      hist({ qty: 1, price: 30 }),
      hist({ qty: 1, price: 20, cur: 'EUR' }),
    ], {});

    expect(sum.gross).toBe(50);
    expect(sum.foreignOrders).toBe(0);
  });
});

describe('summaryExclusionNotes', () => {
  const money = (n) => fmt(n, 'CA$');

  it('says nothing when nothing was left out', () => {
    expect(summaryExclusionNotes(summariseOrderRows([hist()], opts), money)).toEqual([]);
  });

  it('names every excluded bucket in plain language', () => {
    const sum = summariseOrderRows([
      hist(),
      hist({ voided: true }),
      hist({ qty: 2, gratuity: true }),
      hist({ cur: 'EUR' }),
      pending({ qty: 1, price: 40 }),
      consign(),
    ], opts);

    const notes = summaryExclusionNotes(sum, money);

    expect(notes[0]).toBe('1 order awaiting your approval (CA$40.00)');
    expect(notes).toContain('1 order recorded in EUR');
    expect(notes).toContain('1 voided order');
    expect(notes).toContain('2 gifted copies');
    expect(notes).toContain('1 consignment movement');
  });

  it('pluralises so the sentence never reads "1 orders"', () => {
    const sum = summariseOrderRows([
      hist({ voided: true }), hist({ voided: true }),
      hist({ qty: 1, gratuity: true }),
      consign(), consign(),
    ], opts);

    const notes = summaryExclusionNotes(sum, money);
    expect(notes).toContain('2 voided orders');
    expect(notes).toContain('1 gifted copy');
    expect(notes).toContain('2 consignment movements');
  });

  it('tolerates a missing summary', () => {
    expect(summaryExclusionNotes(null, money)).toEqual([]);
  });
});

describe('History money strip wiring', () => {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const mainJs = fs.readFileSync(path.join(root, 'src/main.js'), 'utf8');
  const css = fs.readFileSync(path.join(root, 'src/style.css'), 'utf8');

  it('has a mount point inside the History tab', () => {
    const tab = html.slice(html.indexOf('id="tab-history"'), html.indexOf('id="tab-opencall"'));
    expect(tab).toContain('id="hist-money"');
  });

  it('renders above the copies band, which hides itself under a filter', () => {
    expect(html.indexOf('id="hist-money"')).toBeLessThan(html.indexOf('id="hist-recon"'));
  });

  it('is filled from renderHist over the filtered row set', () => {
    const fn = mainJs.slice(mainJs.indexOf('export function renderHist()'));
    const body = fn.slice(0, fn.indexOf("\n// ── WEBSITE ORDERS"));
    expect(body).toContain("$('hist-money')");
    expect(body).toContain('summariseOrderRows(combined');
    expect(body).toContain('summaryExclusionNotes(sum');
  });

  it('styles the strip from design tokens, with no raw colours', () => {
    const block = css.slice(css.indexOf('.hist-money {'), css.indexOf('.hist-progress-bar-wrap {'));
    expect(block).toContain('container-type: inline-size');
    expect(block).toContain('@container');
    expect(block).toContain('tabular-nums');
    expect(block).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(block).not.toMatch(/\brgb a?\(/);
  });
});
