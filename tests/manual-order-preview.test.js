import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { orderStockPreview, orderStockPreviewCopy } from '../src/lib/inventory.js';

const read = (rel) => fs.readFileSync(path.join(process.cwd(), rel), 'utf8');

// The Manual entry form is where in-person and one-off sales get logged, and
// recordOrder() writes `Math.max(0, stock - qty)`. Logging more copies than are
// on hand therefore lands silently on zero: no error, no toast, just an on-hand
// count that no longer matches the records. These cases pin the warning that
// now appears before "Add order" is pressed.

describe('orderStockPreview', () => {
  it('reports what the order leaves on the shelf', () => {
    const p = orderStockPreview(12, 3, 5);
    expect(p.before).toBe(12);
    expect(p.qty).toBe(3);
    expect(p.after).toBe(9);
    expect(p.displayAfter).toBe(9);
    expect(p.level).toBe('ok');
    expect(p.shortBy).toBe(0);
  });

  it('flags an oversell and says by how much', () => {
    // The case that motivated this: three on hand, five sold at a fair.
    const p = orderStockPreview(3, 5, 5);
    expect(p.level).toBe('short');
    expect(p.shortBy).toBe(2);
    // The true arithmetic stays available for the message...
    expect(p.after).toBe(-2);
    // ...but a stock count is never allowed to read as negative.
    expect(p.displayAfter).toBe(0);
  });

  it('treats an order that exactly clears the shelf as its own state', () => {
    const p = orderStockPreview(4, 4, 5);
    expect(p.level).toBe('out');
    expect(p.displayAfter).toBe(0);
    expect(p.shortBy).toBe(0);
  });

  it('warns when the order drops stock to or below the book alert level', () => {
    expect(orderStockPreview(12, 7, 5).level).toBe('low'); // lands exactly on 5
    expect(orderStockPreview(12, 8, 5).level).toBe('low'); // lands under it
    expect(orderStockPreview(12, 6, 5).level).toBe('ok');  // still above it
  });

  it('stays quiet until a quantity is actually entered', () => {
    expect(orderStockPreview(12, 0, 5).level).toBe('idle');
    expect(orderStockPreview(12, NaN, 5).level).toBe('idle');
  });

  it('survives missing or nonsense inputs rather than rendering undefined', () => {
    const p = orderStockPreview(undefined, undefined, undefined);
    expect(p.before).toBe(0);
    expect(p.qty).toBe(0);
    expect(p.displayAfter).toBe(0);
    expect(p.level).toBe('idle');

    // A book with no alert threshold set must not make every order read "low".
    expect(orderStockPreview(50, 1, 0).level).toBe('ok');
    // Negative stored stock is treated as empty, not as extra headroom.
    expect(orderStockPreview(-4, 1, 5).before).toBe(0);
  });
});

describe('orderStockPreviewCopy', () => {
  it('uses the house pill colours for each state', () => {
    const at = (onHand, qty, thr) => orderStockPreviewCopy(orderStockPreview(onHand, qty, thr), thr);
    expect(at(12, 3, 5).pill).toBe('green');
    expect(at(12, 8, 5).pill).toBe('amber');
    expect(at(4, 4, 5).pill).toBe('amber');
    expect(at(3, 5, 5).pill).toBe('red');
    expect(at(12, 0, 5).pill).toBe('gray');
  });

  it('spells the shortfall out in copies, singular and plural', () => {
    expect(orderStockPreviewCopy(orderStockPreview(3, 4, 5), 5).note).toContain('1 more copy');
    expect(orderStockPreviewCopy(orderStockPreview(3, 5, 5), 5).note).toContain('2 more copies');
  });

  it('names the actual alert level in the low-stock note', () => {
    expect(orderStockPreviewCopy(orderStockPreview(12, 8, 5), 5).note).toContain('5-unit');
  });

  it('adds no note when the order is unremarkable', () => {
    expect(orderStockPreviewCopy(orderStockPreview(50, 1, 5), 5).note).toBe('');
    expect(orderStockPreviewCopy(null, 5).pill).toBe('gray');
  });
});

describe('manual entry preview markup', () => {
  const html = read('index.html');
  const css = read('src/style.css');

  it('renders the strip the form writes into', () => {
    for (const id of ['m-preview', 'm-prev-total', 'm-prev-before', 'm-prev-after', 'm-prev-pill', 'm-hint']) {
      expect(html).toContain(`id="${id}"`);
    }
  });

  it('announces the status pill to screen readers', () => {
    expect(html).toMatch(/id="m-prev-pill"[^>]*aria-live="polite"/);
  });

  it('keeps the figures in tabular mono, per the ledger-precision rule', () => {
    const rule = css.slice(css.indexOf('.order-preview-value{'));
    expect(rule.slice(0, rule.indexOf('}'))).toContain('font-feature-settings:"tnum" 1');
  });

  it('reflows on its own container width rather than a viewport breakpoint', () => {
    expect(css).toContain('@container orderpreview');
    expect(css).toContain('.order-preview-wrap{container-type:inline-size');
  });
});
