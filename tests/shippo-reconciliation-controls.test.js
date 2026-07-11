import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

describe('Shippo reconciliation controls', () => {
  it('declares close, reopen, and clear-list controls in the UI', () => {
    const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

    expect(html).toContain('closeShippingReconciliation()');
    expect(html).toContain('openShippingReconciliation()');
    expect(html).toContain('clearShippingReconciliationList()');
    expect(html).toContain('id="shipping-reconciliation-close"');
    expect(html).toContain('id="shipping-reconciliation-clear"');
  });

  it('supports dismissing imported expenses without removing them from the ledger', () => {
    const main = fs.readFileSync(path.join(root, 'src/main.js'), 'utf8');

    expect(main).toContain("expense.shippingMatchStatus !== 'dismissed'");
    expect(main).toContain("expense.shippingMatchStatus = 'dismissed'");
    expect(main).toContain('clearShippingReconciliationList');
    expect(main).toContain('closeShippingReconciliation, openShippingReconciliation, clearShippingReconciliationList');
  });
});
