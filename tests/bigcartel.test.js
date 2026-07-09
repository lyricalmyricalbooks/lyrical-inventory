import { describe, it, expect } from 'vitest';
import { extractBigCartelLabeledMoney, extractBigCartelShippingPaidFromText } from '../src/lib/bigcartel.js';

describe('Big Cartel receipt parsing', () => {
  it('extracts same-line CA$ money labels', () => {
    expect(extractBigCartelLabeledMoney('Subtotal CA$65.00', ['Subtotal'])).toBe(65);
  });

  it('derives named-method shipping from same-line total rows', () => {
    const body = `Subtotal CA$65.00
Tax CA$0.00
Tracked packet CA$12.00
Total CA$77.00`;

    expect(extractBigCartelShippingPaidFromText(body, 65)).toBe(12);
  });

  it('parses explicit shipping rows with prefixed currency', () => {
    const body = `Subtotal
CA$65.00
Shipping
CA$9.95
Tax
CA$0.00
Total
CA$74.95`;

    expect(extractBigCartelShippingPaidFromText(body, 65)).toBe(9.95);
  });
});
