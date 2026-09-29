import { describe, it, expect } from 'vitest';
import { appSource } from './helpers/extract-decl.js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

describe('Shippo reconciliation controls', () => {
  it('offers linking in the review inbox and no longer carries the old worklist panel', () => {
    const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

    expect(html).toContain('data-ri-action="linkCertain"');
    expect(html).not.toContain('closeShippingReconciliation()');
    expect(html).not.toContain('id="shipping-reconciliation-close"');
  });

  it('supports dismissing imported expenses without removing them from the ledger', () => {
    const main = appSource;

    expect(main).toContain("expense.shippingMatchStatus !== 'dismissed'");
    expect(main).toContain("expense.shippingMatchStatus = 'dismissed'");
    expect(main).toContain('clearShippingReconciliationList');
    expect(main).toContain('clearShippingReconciliationList');
  });
});
