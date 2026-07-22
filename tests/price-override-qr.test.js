import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('Manual Price Override & Payment QR Code Integration Tests', () => {
  it('verifies HTML elements for single-book and printable payment QR price overrides exist', () => {
    const htmlPath = path.join(process.cwd(), 'index.html');
    const html = fs.readFileSync(htmlPath, 'utf8');

    expect(html).toContain('id="m-qr-print"');
    expect(html).toContain('id="qrp-base-cur"');
    expect(html).toContain('id="qrp-books-list"');
    expect(html).toContain('id="m-payment-qr"');
    expect(html).toContain('id="pqr-currency"');
    expect(html).toContain('id="pqr-override-price"');
    expect(html).toContain('id="pqr-gen-stripe-btn"');
  });

  it('verifies price override and Stripe link creation functions are defined in main.js', () => {
    const jsPath = path.join(process.cwd(), 'src/main.js');
    const js = fs.readFileSync(jsPath, 'utf8');

    expect(js).toContain('function updateSingleBookPaymentQR');
    expect(js).toContain('function generateSingleBookStripeQR');
    expect(js).toContain('function renderQRPrintBookList');
    expect(js).toContain('printPaymentQRCodes');
    expect(js).toContain('createStripePaymentLinkForAmount');
  });
});
