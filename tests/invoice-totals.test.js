import { describe, it, expect } from 'vitest';
import {
  invoiceIsOverdue,
  invoiceLedgerTotals,
  invoiceTotalsCopy,
  invoiceSummaryCounts,
} from '../src/lib/invoice-totals.js';
import { extractDecl } from './helpers/extract-decl.js';

// The Invoices panel answers one question: which stores still owe me, and is
// anyone late. Getting the currency wrong there is worse than showing nothing —
// the publisher chases a store for €200 that was billed as US$200, or reads a
// sum of two currencies as a single figure that is wrong in both.

const TODAY = '2026-08-19';

const invoice = (over = {}) => ({
  id: 'inv-1', num: 'INV-2026-001', storeName: 'Broadway Books',
  date: '2026-07-01', dueDate: '2026-07-31',
  total: 120, currency: '€', currencyCode: 'EUR', status: 'sent',
  ...over,
});

describe('invoiceIsOverdue', () => {
  it('flags a sent invoice past its due date', () => {
    expect(invoiceIsOverdue(invoice({ dueDate: '2026-07-31' }), TODAY)).toBe(true);
  });

  it('does not flag an invoice due today or later', () => {
    expect(invoiceIsOverdue(invoice({ dueDate: TODAY }), TODAY)).toBe(false);
    expect(invoiceIsOverdue(invoice({ dueDate: '2026-09-01' }), TODAY)).toBe(false);
  });

  it('clears once the invoice is marked paid', () => {
    // The bug this replaces: the old inline loop only ever set the flag, so a
    // late invoice kept reading OVERDUE after the payment had been recorded.
    const late = invoice({ dueDate: '2026-07-31' });
    expect(invoiceIsOverdue(late, TODAY)).toBe(true);
    expect(invoiceIsOverdue({ ...late, status: 'paid' }, TODAY)).toBe(false);
  });

  it('never flags a draft, however old', () => {
    // A draft has not been sent to anyone, so nobody is late paying it.
    expect(invoiceIsOverdue(invoice({ status: 'draft', dueDate: '2020-01-01' }), TODAY)).toBe(false);
  });

  it('never flags an invoice with no due date', () => {
    expect(invoiceIsOverdue(invoice({ dueDate: '' }), TODAY)).toBe(false);
  });

  it('survives junk', () => {
    expect(invoiceIsOverdue(null, TODAY)).toBe(false);
    expect(invoiceIsOverdue(invoice(), undefined)).toBe(false);
  });
});

describe('invoiceLedgerTotals', () => {
  it('keeps each currency on its own line instead of summing across them', () => {
    const totals = invoiceLedgerTotals([
      invoice({ id: 'a', total: 100, currency: '€', currencyCode: 'EUR' }),
      invoice({ id: 'b', total: 200, currency: 'US$', currencyCode: 'USD' }),
    ], 'EUR', TODAY);

    expect(totals.map(t => t.code)).toEqual(['EUR', 'USD']);
    expect(totals[0].outstanding).toBe(100);
    expect(totals[1].outstanding).toBe(200);
    // The bug: 300 under one symbol, a figure that is wrong in both currencies.
    expect(totals.some(t => t.outstanding === 300)).toBe(false);
  });

  it('separates what is still owed from what has been collected', () => {
    const [t] = invoiceLedgerTotals([
      invoice({ id: 'a', total: 100, status: 'sent' }),
      invoice({ id: 'b', total: 250, status: 'paid' }),
      invoice({ id: 'c', total: 50, status: 'paid' }),
    ], 'EUR', TODAY);

    expect(t.outstanding).toBe(100);
    expect(t.outstandingCount).toBe(1);
    expect(t.collected).toBe(300);
    expect(t.collectedCount).toBe(2);
  });

  it('counts the overdue share inside outstanding, not beside it', () => {
    const [t] = invoiceLedgerTotals([
      invoice({ id: 'a', total: 100, dueDate: '2026-07-01' }), // late
      invoice({ id: 'b', total: 40, dueDate: '2026-12-01' }),  // not yet due
    ], 'EUR', TODAY);

    expect(t.outstanding).toBe(140);
    expect(t.overdue).toBe(100);
    expect(t.overdueCount).toBe(1);
  });

  it('leaves drafts and cancelled invoices out of the money', () => {
    // Nothing has been billed to anyone, so counting a draft would promise
    // income the store has never been asked for.
    const totals = invoiceLedgerTotals([
      invoice({ id: 'a', total: 999, status: 'draft' }),
      invoice({ id: 'b', total: 999, status: 'cancelled' }),
      invoice({ id: 'c', total: 25, status: 'sent' }),
    ], 'EUR', TODAY);

    expect(totals).toHaveLength(1);
    expect(totals[0].outstanding).toBe(25);
  });

  it('files an invoice with no stamped currency under the book\'s own', () => {
    const [t] = invoiceLedgerTotals([
      { id: 'legacy', total: 60, status: 'sent' },
    ], 'CAD', TODAY);

    expect(t.code).toBe('CAD');
    expect(t.outstanding).toBe(60);
  });

  it('reads the stored symbol as well as the ISO code', () => {
    // Older invoices were stamped with the symbol only; both must land in the
    // same bucket or one store's balance splits across two lines.
    const totals = invoiceLedgerTotals([
      invoice({ id: 'a', total: 10, currency: 'US$', currencyCode: undefined }),
      invoice({ id: 'b', total: 15, currency: 'US$', currencyCode: 'USD' }),
    ], 'EUR', TODAY);

    expect(totals).toHaveLength(1);
    expect(totals[0].code).toBe('USD');
    expect(totals[0].outstanding).toBe(25);
  });

  it('puts the book\'s own currency first and the rest alphabetically', () => {
    const totals = invoiceLedgerTotals([
      invoice({ id: 'a', total: 1, currency: 'US$', currencyCode: 'USD' }),
      invoice({ id: 'b', total: 1, currency: 'CA$', currencyCode: 'CAD' }),
      invoice({ id: 'c', total: 1, currency: '€', currencyCode: 'EUR' }),
    ], 'EUR', TODAY);

    expect(totals.map(t => t.code)).toEqual(['EUR', 'CAD', 'USD']);
  });

  it('does not let floating-point drift creep into the total', () => {
    const [t] = invoiceLedgerTotals(
      Array.from({ length: 10 }, (_, i) => invoice({ id: `x${i}`, total: 0.1 })),
      'EUR', TODAY,
    );
    expect(t.outstanding).toBe(1);
  });

  it('survives junk rows', () => {
    expect(invoiceLedgerTotals(null, 'EUR', TODAY)).toEqual([]);
    expect(invoiceLedgerTotals([null, undefined, 'nope'], 'EUR', TODAY)).toEqual([]);
  });
});

describe('invoiceTotalsCopy', () => {
  it('names the late invoices when some are past due', () => {
    const [t] = invoiceLedgerTotals([
      invoice({ id: 'a', total: 100, dueDate: '2026-07-01' }),
      invoice({ id: 'b', total: 40, dueDate: '2026-12-01' }),
    ], 'EUR', TODAY);
    const copy = invoiceTotalsCopy(t);

    expect(copy.status).toBe('overdue');
    expect(copy.amount).toBe(140);
    expect(copy.sub).toContain('1 past due');
    expect(copy.sub).toContain('€100.00');
  });

  it('says so plainly when nothing is late', () => {
    const [t] = invoiceLedgerTotals([
      invoice({ id: 'a', total: 40, dueDate: '2026-12-01' }),
    ], 'EUR', TODAY);
    const copy = invoiceTotalsCopy(t);

    expect(copy.status).toBe('outstanding');
    expect(copy.sub).toContain('none past due');
  });

  it('states all-clear outright rather than as a bare zero', () => {
    const [t] = invoiceLedgerTotals([
      invoice({ id: 'a', total: 90, status: 'paid' }),
    ], 'EUR', TODAY);
    const copy = invoiceTotalsCopy(t);

    expect(copy.status).toBe('clear');
    expect(copy.label).toBe('All paid');
    expect(copy.sub).toContain('€90.00 collected');
  });

  it('keeps the copy free of jargon the publisher would not recognise', () => {
    const [t] = invoiceLedgerTotals([invoice({ id: 'a', total: 10 })], 'EUR', TODAY);
    const copy = invoiceTotalsCopy(t);
    const words = `${copy.label} ${copy.sub}`.toLowerCase();
    for (const jargon of ['firestore', 'bucket', 'null', 'undefined', 'nan']) {
      expect(words).not.toContain(jargon);
    }
  });

  it('survives an empty bucket', () => {
    const copy = invoiceTotalsCopy(undefined);
    expect(copy.code).toBe('EUR');
    expect(copy.status).toBe('clear');
  });
});

describe('invoiceSummaryCounts', () => {
  it('counts everything, the drafts, and the late ones', () => {
    const counts = invoiceSummaryCounts([
      invoice({ id: 'a', status: 'draft' }),
      invoice({ id: 'b', status: 'sent', dueDate: '2026-07-01' }),
      invoice({ id: 'c', status: 'sent', dueDate: '2026-12-01' }),
      invoice({ id: 'd', status: 'paid', dueDate: '2026-01-01' }),
    ], TODAY);

    expect(counts).toEqual({ total: 4, drafts: 1, overdue: 1 });
  });

  it('treats an invoice with no status as a draft', () => {
    expect(invoiceSummaryCounts([{ id: 'a', total: 5 }], TODAY).drafts).toBe(1);
  });

  it('survives junk', () => {
    expect(invoiceSummaryCounts(null, TODAY)).toEqual({ total: 0, drafts: 0, overdue: 0 });
  });
});

describe('renderInvoices wiring', () => {
  const render = extractDecl('renderInvoices');
  const summaryHtml = extractDecl('invoiceSummaryHtml');

  it('prints each invoice card in the currency it was billed in', () => {
    // The card used to format every total with the BOOK's currency, so a store
    // billed in US$ appeared on the list as euros.
    expect(render).toContain('fmt(inv.total || 0, inv.currency ?? cur)');
  });

  it('assigns the overdue flag on both branches so a payment clears it', () => {
    expect(render).toContain('inv._overdue = invoiceIsOverdue(inv, todayStr)');
    expect(render).not.toContain('inv._overdue = true');
  });

  it('totals per currency rather than summing into the book currency', () => {
    expect(render).toContain('invoiceLedgerTotals(');
    expect(render).not.toMatch(/outstanding \+= /);
  });

  it('reuses the house pill and chip classes instead of new badge shapes', () => {
    expect(summaryHtml).toContain('class="pill gold"');
    expect(summaryHtml).toContain('class="pill amber"');
    expect(summaryHtml).toContain('class="chip-status gray"');
  });

  it('shows the currency tag only once there is more than one currency', () => {
    expect(summaryHtml).toContain('.length > 1');
  });

  it('escapes the copy it interpolates', () => {
    expect(summaryHtml).toContain('escapeHtml(copy.label)');
    expect(summaryHtml).toContain('escapeHtml(copy.sub)');
  });
});
