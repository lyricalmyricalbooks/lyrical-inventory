import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { shipmentStockView } from '../src/lib/shipment-stock.js';
import { extractDecl } from './helpers/extract-decl.js';

const read = (rel) => fs.readFileSync(path.join(process.cwd(), rel), 'utf8');

// "Send books to <store>" is the only action that takes copies off the shelf
// without selling them, and the dialog used to show no stock figure at all: it
// opened on a default quantity of 10, and the only sign that the number was
// impossible arrived after Send was pressed. These cases pin the preview that
// now answers "what does this box leave me?" while the form is still open.

describe('shipmentStockView', () => {
  it('reports both shelves — yours falling, the store’s rising', () => {
    const v = shipmentStockView({ onHand: 30, qty: 10, threshold: 5, storeOutstanding: 4 });
    expect(v.onHand).toBe(30);
    expect(v.qty).toBe(10);
    expect(v.displayAfter).toBe(20);
    expect(v.storeBefore).toBe(4);
    expect(v.storeAfter).toBe(14);
    expect(v.level).toBe('ok');
    expect(v.pill).toBe('green');
  });

  it('flags a shipment bigger than the shelf and says by how much', () => {
    const v = shipmentStockView({ onHand: 3, qty: 10, threshold: 5, storeOutstanding: 0 });
    expect(v.level).toBe('short');
    expect(v.pill).toBe('red');
    expect(v.shortBy).toBe(7);
    // The true arithmetic stays available for the message...
    expect(v.after).toBe(-7);
    // ...but a stock count is never allowed to read as negative.
    expect(v.displayAfter).toBe(0);
    expect(v.note).toContain('7 more');
    expect(v.note).toContain('3 copies');
  });

  it('treats a shipment that exactly clears the shelf as its own state', () => {
    const v = shipmentStockView({ onHand: 8, qty: 8, threshold: 5 });
    expect(v.level).toBe('out');
    expect(v.pill).toBe('amber');
    expect(v.displayAfter).toBe(0);
    expect(v.shortBy).toBe(0);
    expect(v.note).toContain('every copy');
  });

  it('warns when the box drops stock to or below the book’s reorder alert', () => {
    expect(shipmentStockView({ onHand: 12, qty: 7, threshold: 5 }).level).toBe('low'); // lands on 5
    expect(shipmentStockView({ onHand: 12, qty: 8, threshold: 5 }).level).toBe('low'); // lands under
    expect(shipmentStockView({ onHand: 12, qty: 6, threshold: 5 }).level).toBe('ok');  // still above
    expect(shipmentStockView({ onHand: 12, qty: 7, threshold: 5 }).note).toContain('5-unit');
  });

  it('uses the book’s own reorder alarm, not a fair-table cutoff', () => {
    // A print-run threshold of 30 must actually fire at 30 — this is the one
    // surface where `threshold` is the right question (unlike the POS register).
    expect(shipmentStockView({ onHand: 60, qty: 30, threshold: 30 }).level).toBe('low');
    expect(shipmentStockView({ onHand: 60, qty: 29, threshold: 30 }).level).toBe('ok');
  });

  it('stays a gray dash until a quantity is actually entered', () => {
    const v = shipmentStockView({ onHand: 12, qty: 0, threshold: 5, storeOutstanding: 2 });
    expect(v.level).toBe('idle');
    expect(v.pill).toBe('gray');
    expect(v.label).toBe('—');
    expect(v.note).toBe('');
    // The store's shelf is still reported truthfully at rest.
    expect(v.storeBefore).toBe(2);
    expect(v.storeAfter).toBe(2);
  });

  it('singularises the shortfall copy', () => {
    expect(shipmentStockView({ onHand: 1, qty: 2, threshold: 5 }).note).toContain('1 copy');
    expect(shipmentStockView({ onHand: 2, qty: 4, threshold: 5 }).note).toContain('2 copies');
  });

  it('survives missing or nonsense inputs rather than rendering undefined', () => {
    const v = shipmentStockView();
    expect(v.onHand).toBe(0);
    expect(v.qty).toBe(0);
    expect(v.displayAfter).toBe(0);
    expect(v.storeBefore).toBe(0);
    expect(v.storeAfter).toBe(0);
    expect(v.level).toBe('idle');
    for (const key of ['pill', 'glyph', 'label', 'note', 'srText']) {
      expect(typeof v[key]).toBe('string');
    }
    // A book with no reorder alert must not make every shipment read "low".
    expect(shipmentStockView({ onHand: 50, qty: 1, threshold: 0 }).level).toBe('ok');
    // Negative stored stock is treated as empty, not as extra headroom.
    expect(shipmentStockView({ onHand: -4, qty: 1, threshold: 5 }).onHand).toBe(0);
    // As is a negative outstanding count on the store side.
    expect(shipmentStockView({ onHand: 9, qty: 1, storeOutstanding: -3 }).storeBefore).toBe(0);
  });

  it('never prints a negative count on either shelf', () => {
    for (const qty of [1, 5, 40, 400]) {
      const v = shipmentStockView({ onHand: 6, qty, threshold: 5, storeOutstanding: 1 });
      expect(v.displayAfter).toBeGreaterThanOrEqual(0);
      expect(v.storeAfter).toBeGreaterThanOrEqual(0);
    }
  });
});

describe('send-books preview markup', () => {
  const html = read('index.html');

  it('renders the strip the dialog writes into', () => {
    for (const id of [
      'send-preview', 'send-prev-before', 'send-prev-after',
      'send-prev-store-before', 'send-prev-store-after',
      'send-prev-pill', 'send-prev-note',
    ]) {
      expect(html).toContain(`id="${id}"`);
    }
  });

  it('repaints as the quantity is typed, not only on save', () => {
    expect(html).toMatch(/id="send-qty"[^>]*oninput="sendStockHint\(\)"/);
  });

  it('announces the status pill to screen readers', () => {
    expect(html).toMatch(/id="send-prev-pill"[^>]*aria-live="polite"/);
  });

  it('reuses the manual-entry preview furniture rather than new one-off classes', () => {
    const strip = html.slice(html.indexOf('id="send-preview"'));
    expect(strip.slice(0, strip.indexOf('</div></div>'))).toContain('order-preview-label');
    expect(html).toContain('<div class="order-preview-wrap" style="margin-top:0;margin-bottom:12px;">');
  });
});

describe('sendStockHint wiring', () => {
  const decl = extractDecl('sendStockHint');
  const mainJs = read('src/main.js');

  it('reads stock but never writes it — the ledger keeps ownership', () => {
    expect(decl).toBeTruthy();
    expect(decl).toContain('shipmentStockView');
    expect(decl).not.toMatch(/\bs\.stock\s*[-+]?=/);
    expect(decl).not.toContain('saveState');
  });

  it('guards every node it touches, so a stale call cannot throw', () => {
    expect(decl).toContain("if (!beforeEl) return;");
  });

  it('paints the preview the moment the dialog opens', () => {
    const openSend = extractDecl('openSend');
    expect(openSend).toContain('sendStockHint()');
  });

  it('is exposed on window, or the inline oninput would silently do nothing', () => {
    expect(mainJs).toMatch(/\bsendStockHint\b\s*,/);
    expect(mainJs.match(/\bsendStockHint\b/g).length).toBeGreaterThanOrEqual(4);
  });
});
