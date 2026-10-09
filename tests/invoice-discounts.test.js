import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  parseLooseNumber,
  clampPercent,
  invoiceLineGross,
  invoiceLineAmount,
  invoiceHasLineDiscounts,
  computeInvoiceTotals,
  parseDiscountEntry,
  dueDateFromTerms,
  daysBetween,
  duplicateInvoiceContent,
  invoiceBookSplit,
} from '../src/lib/invoices.js';

// Percentage discounts were hard to enter: hidden behind a dropdown, a box
// that started at "0", and no way to type "12,5". These pin down the math the
// editor, the printed invoice, the email and the per-title split all share.

describe('parseLooseNumber', () => {
  it('reads a comma or a dot as the decimal point', () => {
    expect(parseLooseNumber('12,5')).toBe(12.5);
    expect(parseLooseNumber('12.5')).toBe(12.5);
  });
  it('treats the last mark as the decimal point when both appear', () => {
    expect(parseLooseNumber('1.234,50')).toBe(1234.5);
    expect(parseLooseNumber('1,234.50')).toBe(1234.5);
  });
  it('ignores symbols and returns NaN for no number at all', () => {
    expect(parseLooseNumber('€ 10')).toBe(10);
    expect(parseLooseNumber('15 %')).toBe(15);
    expect(Number.isNaN(parseLooseNumber(''))).toBe(true);
  });
});

describe('clampPercent', () => {
  it('holds a percentage to 0–100 and reads junk as zero', () => {
    expect(clampPercent('40')).toBe(40);
    expect(clampPercent(140)).toBe(100);
    expect(clampPercent(-5)).toBe(0);
    expect(clampPercent('abc')).toBe(0);
    expect(clampPercent(undefined)).toBe(0);
  });
});

describe('line amounts', () => {
  it('applies a line discount and leaves an undiscounted line as it was', () => {
    expect(invoiceLineAmount({ qty: 3, unitPrice: 20 })).toBe(60);
    expect(invoiceLineAmount({ qty: 3, unitPrice: 20, discountPct: 40 })).toBe(36);
    expect(invoiceLineGross({ qty: 3, unitPrice: 20, discountPct: 40 })).toBe(60);
  });
  it('rounds to whole cents', () => {
    expect(invoiceLineAmount({ qty: 1, unitPrice: 9.99, discountPct: 15 })).toBe(8.49);
  });
  it('spots whether any line carries its own discount', () => {
    expect(invoiceHasLineDiscounts([{ qty: 1, unitPrice: 5 }])).toBe(false);
    expect(invoiceHasLineDiscounts([{ qty: 1, unitPrice: 5 }, { qty: 1, unitPrice: 5, discountPct: 10 }])).toBe(true);
    expect(invoiceHasLineDiscounts(undefined)).toBe(false);
  });
});

describe('computeInvoiceTotals', () => {
  const items = [{ qty: 4, unitPrice: 25 }, { qty: 2, unitPrice: 50, discountPct: 50 }]; // 100 + 50

  it('takes a percentage off the line-discounted subtotal, then adds tax', () => {
    const t = computeInvoiceTotals({ items, discountType: 'percent', discountValue: 10, taxRate: 5 });
    expect(t).toMatchObject({ subtotal: 150, discount: 15, discountType: 'percent', discountRate: 10, taxRate: 5, tax: 6.75, total: 141.75 });
  });

  it('takes a flat amount off, typed with a decimal comma', () => {
    const t = computeInvoiceTotals({ items, discountType: 'flat', discountValue: '12,50', taxRate: 0 });
    expect(t.discount).toBe(12.5);
    expect(t.total).toBe(137.5);
  });

  it('never lets a flat discount exceed what is being billed', () => {
    const t = computeInvoiceTotals({ items: [{ qty: 1, unitPrice: 50 }], discountType: 'flat', discountValue: 80 });
    expect(t.discount).toBe(50);
    expect(t.total).toBe(0);
  });

  it('caps a percentage at 100 and treats an unknown type as flat', () => {
    expect(computeInvoiceTotals({ items, discountType: 'percent', discountValue: 250 }).discount).toBe(150);
    expect(computeInvoiceTotals({ items, discountType: 'weird', discountValue: 5 }).discountType).toBe('flat');
  });

  it('matches the old arithmetic for an invoice with no line discounts', () => {
    // 3 × 60 + 4 × 65 = 440, 10% off = 44, 22% VAT on 396 = 87.12.
    const t = computeInvoiceTotals({
      items: [{ qty: 3, unitPrice: 60 }, { qty: 4, unitPrice: 65 }],
      discountType: 'percent', discountValue: 10, taxRate: 22,
    });
    expect(t).toMatchObject({ subtotal: 440, discount: 44, tax: 87.12, total: 483.12 });
  });
});

describe('parseDiscountEntry', () => {
  it('a % sign means a percentage whatever the toggle says', () => {
    expect(parseDiscountEntry('15%', 'flat')).toEqual({ type: 'percent', value: 15, explicit: true });
  });
  it('a currency mark means an amount whatever the toggle says', () => {
    expect(parseDiscountEntry('€10', 'percent')).toEqual({ type: 'flat', value: 10, explicit: true });
    expect(parseDiscountEntry('10 EUR', 'percent').type).toBe('flat');
  });
  it('a bare number keeps the toggle, and empty is no discount', () => {
    expect(parseDiscountEntry('12,5', 'percent')).toEqual({ type: 'percent', value: 12.5, explicit: false });
    expect(parseDiscountEntry('', 'flat')).toEqual({ type: 'flat', value: 0, explicit: false });
  });
  it('holds a typed percentage to 100', () => {
    expect(parseDiscountEntry('150%', 'flat').value).toBe(100);
  });
});

describe('due-date shortcuts', () => {
  it('counts days on from the issue date, across a month and a clock change', () => {
    expect(dueDateFromTerms('2026-10-09', 30)).toBe('2026-11-08');
    expect(dueDateFromTerms('2026-03-01', 15)).toBe('2026-03-16');
    expect(dueDateFromTerms('2026-10-09', 0)).toBe('2026-10-09');
    expect(dueDateFromTerms('not a date', 30)).toBe('');
  });
  it('works out the gap back again, so a reopened invoice lights its shortcut', () => {
    expect(daysBetween('2026-10-09', '2026-11-08')).toBe(30);
    expect(daysBetween('2026-10-09', '')).toBeNull();
  });
});

describe('duplicateInvoiceContent', () => {
  const original = {
    id: 'inv-1', num: 'INV-ALTROV-2026-004', status: 'paid', paidAt: 1, stripe: { url: 'x' },
    billTo: 'store', storeId: 7, storeName: 'Libreria',
    items: [
      { description: 'Sale', qty: 2, unitPrice: 30, _ledgerId: 'L1', bookId: 'altrove' },
      { description: 'Extra', qty: 1, unitPrice: 10, discountPct: 20, bookId: 'hound' },
    ],
    discountType: 'percent', discountRate: 10, discount: 6.8, taxRate: 22,
    currencyCode: 'EUR', notes: 'n', terms: 'Net 15.',
  };

  it('copies who and what is billed, but none of the identity, payment or sale links', () => {
    const c = duplicateInvoiceContent(original);
    expect(c.storeId).toBe(7);
    expect(c.items).toHaveLength(2);
    expect(c.items.some(it => '_ledgerId' in it)).toBe(false);
    expect(c.items[1].discountPct).toBe(20);
    expect(c).toMatchObject({ discountType: 'percent', discountValue: 10, taxRate: 22, currencyCode: 'EUR', terms: 'Net 15.' });
    expect(c.linkedSalesDropped).toBe(1);
    for (const k of ['id', 'num', 'status', 'paidAt', 'stripe']) expect(c).not.toHaveProperty(k);
  });

  it('a flat-discount original carries its amount over', () => {
    expect(duplicateInvoiceContent({ discountType: 'flat', discount: 5 }).discountValue).toBe(5);
  });
});

describe('per-title split with line discounts', () => {
  it('weights each title by what its lines actually bill', () => {
    const inv = {
      total: 100,
      items: [
        { qty: 1, unitPrice: 100, discountPct: 50, bookId: 'a' }, // bills 50
        { qty: 1, unitPrice: 50, bookId: 'b' },                    // bills 50
      ],
    };
    const split = invoiceBookSplit(inv, 'a', [{ id: 'a', title: 'A' }, { id: 'b', title: 'B' }]);
    expect(split.map(r => r.total)).toEqual([50, 50]);
  });
});

describe('editor wiring', () => {
  const html = readFileSync(path.resolve(process.cwd(), 'index.html'), 'utf8');
  const app = readFileSync(path.resolve(process.cwd(), 'src/main.js'), 'utf8');

  it('offers one-tap percentage presets and a %/amount toggle instead of a dropdown', () => {
    expect(html).toContain('onclick="applyDiscountPreset(40)"');
    expect(html).toContain('id="inv-disc-mode-percent"');
    expect(html).not.toContain('id="inv-discount-percent"');
    expect(html).toContain('id="inv-discount-input" type="text" inputmode="decimal"');
  });

  it('prints every line at its discounted amount', () => {
    expect(app).not.toMatch(/\(it\.qty \|\| 0\) \* \(it\.unitPrice \|\| 0\)/);
  });

  it('never reopens a paid or cancelled invoice as owed when it is edited', () => {
    expect(app).toContain("if (old.status === 'paid' || old.status === 'cancelled') payload.status = old.status;");
    expect(app).toContain("const shouldAutoStripe = payload.status === 'sent'");
  });

  it('has Save draft and Duplicate', () => {
    expect(html).toContain(`onclick="saveInvoice('draft')"`);
    expect(html).toContain('onclick="duplicateInvoiceFromView()"');
    expect(app).toContain('function duplicateInvoiceFromView()');
  });
});
