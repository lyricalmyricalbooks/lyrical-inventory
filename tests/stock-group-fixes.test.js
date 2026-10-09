import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { inventoryBreakdown } from '../src/lib/inventory.js';
import { tierEffectiveCap } from '../src/lib/earnings.js';
import { reminderBlockReason } from '../src/lib/payment-reminders.js';

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
