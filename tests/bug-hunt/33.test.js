import { test, expect } from 'vitest';
import { stampLedgerInvoiceLink } from '../../src/lib/consignment.js';
test('no-discount relink clears old discount note', () => {
  const s = { ledger: [{ id: 'L1', notes: 'Fair · Invoice Discount: 10%' }], hist: [], invoices: [] };
  stampLedgerInvoiceLink(s, 'L1', { id: 'i2', num: 'INV-2', discount: 0 });
  expect(s.ledger[0].notes).toBe('Fair');
});
