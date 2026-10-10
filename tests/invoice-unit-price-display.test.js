import { describe, it, expect } from 'vitest';
import { formatInvoiceUnitPrice, invoiceLineAmount } from '../src/lib/invoices.js';

// A line imported from a consignment sale: 3 copies, 23.38 due. The unit price is
// 23.38 / 3, which is not a whole-cent amount. It must print with enough digits
// that "3 x price" visibly agrees with the line total, and the billed total stays 23.38.
describe('printed invoice unit price', () => {
  const item = { qty: 3, unitPrice: 23.38 / 3 };

  it('keeps the billed line total exactly the amount due', () => {
    expect(invoiceLineAmount(item)).toBe(23.38);
  });

  it('prints a non-cent unit price to four decimals, not a rounded 7.79', () => {
    expect(formatInvoiceUnitPrice(item.unitPrice, '€')).toBe('€7.7933');
    expect(Math.round(3 * Number(formatInvoiceUnitPrice(item.unitPrice).replace(/[^0-9.]/g, '')) * 100) / 100).toBe(23.38);
  });

  it('leaves ordinary whole-cent prices exactly as before', () => {
    expect(formatInvoiceUnitPrice(12, '€')).toBe('€12.00');
    expect(formatInvoiceUnitPrice(1234.5, 'CA$')).toBe('CA$1,234.50');
    expect(formatInvoiceUnitPrice(undefined, '$')).toBe('$0.00');
  });
});
