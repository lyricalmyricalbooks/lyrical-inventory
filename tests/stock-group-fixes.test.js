import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { inventoryBreakdown } from '../src/lib/inventory.js';
import { tierEffectiveCap } from '../src/lib/earnings.js';
import { reminderBlockReason } from '../src/lib/payment-reminders.js';
import { refundsToRaise } from '../src/lib/stripe-sale-autorecord.js';

const main = readFileSync('src/main.js', 'utf8');
const fn = (name) => { const i = main.indexOf(name); return main.slice(i, i + 2600); };

describe('inventoryBreakdown with disposals', () => {
  it('does not take publisher write-offs out of the consignment count', () => {
    const s = { stock: 87, hist: [], ledger: [
      { type: 'Shipment', qty: 10 }, { type: 'Inventory Disposal', qty: 3 },
    ] };
    const b = inventoryBreakdown(s, { maxPrint: 100 });
    expect(b.onConsignment).toBe(10);
    expect(b.unaccounted).toBe(0);
  });
});

describe('profit tier template', () => {
  it('leaves the post break-even stage uncapped', () => {
    expect(tierEffectiveCap({ label: 'Pre Break-even', revenueUpTo: 1000 }, 1000)).toBe(1000);
    expect(tierEffectiveCap({ label: 'Post Break-even', revenueUpTo: null }, 1000)).toBeNull();
  });
});

describe('reminder back-off after an unfinished attempt', () => {
  const NOW = Date.UTC(2026, 9, 10, 15);
  const inv = (reminders) => ({ status: 'sent', dueDate: '2026-09-01', storeEmail: 'a@b.co', reminders });
  const opts = { today: '2026-10-10', days: 7, now: NOW };
  it('waits a day after a failed or in-flight send, then tries again', () => {
    expect(reminderBlockReason(inv([{ at: NOW - 3600000, status: 'failed' }]), opts)).toBe('recent-attempt');
    expect(reminderBlockReason(inv([{ at: NOW - 1000, status: 'sending' }]), opts)).toBe('recent-attempt');
    expect(reminderBlockReason(inv([{ at: NOW - 25 * 3600000, status: 'failed' }]), opts)).toBeNull();
  });
});

describe('stock-group wiring', () => {
  it('void of a held-cash sale removes its pending transfer and skips revenue', () => {
    const v = fn('function voidHistEntry(');
    expect(v).toContain('h.artistPending');
    expect(v).toContain('s.artistTransfers.splice');
  });
  it('ledger delete of a live sale reverses it via voidHistEntry', () => {
    const r = fn('export async function removeLedgerEntry');
    expect(r).toContain('voidHistEntry(s, BOOKS[bid], h)');
    expect(r).toContain("type === 'shippingIncome'");
  });
  it('POS minus-to-zero drops the price override', () => {
    expect(fn('window.posUpdateQty = function')).toContain('delete posPriceOverrides[bookId]');
  });
  it('CSV export skips consignment mirrors and keeps void status', () => {
    expect(fn('function exportAllToCSV')).toContain('if (h.consignmentLink) return;');
    expect(main).toContain("l.voided ? 'VOID' : (l.status || 'OK')");
  });
  it('valuation sold units skip mirrors, voided and gratuity rows', () => {
    expect(main).toContain('if (h.consignmentLink || h.voided || h.gratuity) continue;');
  });
  it('QR card falls back to the price its link charges', () => {
    expect(main).toContain('_qrPriceFallbackTitles.push');
  });
  it('partly refunded card payments stay in needs-review', () => {
    expect(main).toContain('p.refunded && p.fullyRefunded !== false');
  });
});

describe('second partial refund completing a refund', () => {
  const sale = (extra = {}) => ({ chargeId: 'ch_1', sheetsId: 'stripe-ch_1', qty: 1, paidAmount: 100, ...extra });
  it('is raised as full after an earlier partial was noted', () => {
    const noted = sale({ refundNoted: 're_1', refundPartial: true, refundedSoFar: 40 });
    const out = refundsToRaise([{ id: 're_1', chargeId: 'ch_1', amount: 40 }, { id: 're_2', chargeId: 'ch_1', amount: 60 }], [noted]);
    expect(out).toHaveLength(1);
    expect(out[0].full).toBe(true);
  });
  it('stays quiet if the second refund is still partial', () => {
    const noted = sale({ refundNoted: 're_1', refundPartial: true, refundedSoFar: 40 });
    expect(refundsToRaise([{ id: 're_2', chargeId: 'ch_1', amount: 10 }], [noted])).toHaveLength(0);
  });
});

describe('remaining stock-group fixes', () => {
  it('voiding an author-entered sale gives the copies back to the author', () => {
    expect(fn('function voidHistEntry(')).toContain('s.authorStock');
    expect(fn('function unvoidHistEntry(')).toContain('deductSaleFromStockBreakdown(s, h.qty, true)');
  });
  it('undoing a reversal syncs under the sale own book', () => {
    expect(main).toContain('withActiveBook(item.bookId, () => unvoidHistEntry(st, book, row))');
    expect(main).toContain('withActiveBook(item.bookId, () => voidHistEntry(st, book, row))');
  });
  it('the no-access message survives the sign-out it triggers', () => {
    expect(main).toContain('setupGate(_pendingGateMsg)');
    expect(main).toContain('_pendingGateMsg = `Your Google account');
  });
  it('book expense edit keeps its CAD value offline and the export flags unconverted expenses', () => {
    expect(main).toContain('const sameBasis = !fxRate');
    expect(main).toContain("if (isExpenseAwaitingRate(e)) { waitingExpenses.add(e); return 0; }");
  });
  it('the invoice sweep reads several pages and only advances when complete', () => {
    expect(main).toContain('fetchStripePaymentsForReconcile(10,');
    expect(main).toContain('if (!payments.truncated) writeStripeInvoiceStamp');
  });
});
