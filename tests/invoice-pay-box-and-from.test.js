// The per-invoice "Pay this invoice" switch, and the business details shown
// under the name at the top of an invoice.
import { beforeAll, describe, expect, it } from 'vitest';
import { loadApp, makeBook } from './helpers/load-app.js';

let app;
let doc;
const SETTINGS_KEY = 'lm-invoice-settings';

beforeAll(async () => {
  app = await loadApp({ books: [makeBook({ id: 'bk', listPrice: 40, paymentLink: 'https://paypal.me/sample' })] });
  doc = app.window.document;
}, 30000);

function invoice(extra = {}) {
  return {
    id: 'inv-t1', num: 'BK-001', storeName: 'Corner Books', date: '2026-11-16', dueDate: '2026-12-16',
    items: [{ description: 'Book', qty: 2, unitPrice: 20 }], subtotal: 40, total: 40, currency: '€',
    paymentLink: 'https://buy.stripe.com/test_abc', status: 'sent', ...extra,
  };
}

function setSettings(o) { app.window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(o)); }

describe('the "Pay this invoice" box', () => {
  it('shows on an invoice by default, including older ones saved before the switch existed', () => {
    const html = app.window.renderInvoicePaperHTML(invoice());
    expect(html).toContain('Pay this invoice');
    expect(app.window.invoiceEmailPlainText(invoice())).toContain('Pay securely online');
  });

  it('disappears from the paper and the email when switched off for that invoice', () => {
    const inv = invoice({ hidePayLink: true });
    expect(app.window.renderInvoicePaperHTML(inv)).not.toContain('Pay this invoice');
    expect(app.window.invoiceEmailPlainText(inv)).not.toContain('Pay securely online');
    expect(app.window.buildInvoiceEmailHTML(inv)).not.toContain('Pay this invoice');
    // The link itself is kept, so switching it back on needs nothing re-typed.
    expect(app.window.effectivePaymentLink(inv)).toContain('https://buy.stripe.com/test_abc');
    expect(app.window.invoiceShownPayLink(inv)).toBe('');
  });

  it('is on, with the link field visible, on a new invoice form', () => {
    app.window.openCreateInvoice();
    expect(doc.getElementById('inv-show-pay').checked).toBe(true);
    expect(doc.getElementById('inv-paylink-group').hidden).toBe(false);
    const box = doc.getElementById('inv-show-pay');
    box.checked = false;
    box.dispatchEvent(new app.window.Event('change', { bubbles: true }));
    expect(doc.getElementById('inv-paylink-group').hidden).toBe(true);
  });
});

describe('business details under the name', () => {
  it('prints address, email, phone and tax ID under the name', () => {
    setSettings({ name: 'Lyricalmyrical Books', addr: '1 Sample St\nToronto ON', email: 'hi@example.com', phone: '555-0100', vat: 'HST 123' });
    const html = app.window.renderInvoicePaperHTML(invoice());
    for (const bit of ['1 Sample St', 'Toronto ON', 'hi@example.com', '555-0100', 'VAT/Tax ID: HST 123']) expect(html).toContain(bit);
    expect(app.window.buildInvoiceEmailHTML(invoice())).toContain('555-0100');
  });

  it('shows them in a From card on the invoice form, and says when they are missing', () => {
    setSettings({ name: 'Lyricalmyrical Books', addr: '1 Sample St' });
    app.window.openCreateInvoice();
    const from = doc.getElementById('inv-from');
    expect(from.textContent).toContain('1 Sample St');
    expect(from.textContent).toContain('Edit details');

    setSettings({ name: 'Lyricalmyrical Books' });
    app.window.openCreateInvoice();
    expect(from.textContent).toContain('No address or contact details yet');
    expect(from.textContent).toContain('Add your details');
  });
});
