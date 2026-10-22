// The register's printable receipt: what a customer takes home. Driven through
// the real app, like pos-sale-robustness.
import { describe, it, expect, beforeAll } from 'vitest';
import { loadApp, makeBook } from './helpers/load-app.js';

const ODD = 'odd';
let app;
let win;

beforeAll(async () => {
  app = await loadApp({
    books: [makeBook({ id: ODD, title: 'Fish & <Chips> "Vol. 1"', currency: 'CA$', listPrice: 20, maxPrint: 50 })],
  });
  win = app.window;
}, 30000);

describe('printed receipt', () => {
  it('prints a title with markup characters as text, with the payment and total', () => {
    const written = [];
    const fakeWin = { document: { write: (h) => written.push(h), close() {} }, focus() {}, print() {} };
    win.open = () => fakeWin;
    win.posSetCurrency('CAD');
    win.posUpdateQty(ODD, 2);
    document.getElementById('pos-payment-method').value = 'Card';
    win.posCheckout();
    win.posPrintReceipt();

    const html = written.join('');
    expect(html).toContain('Fish &amp; &lt;Chips&gt; &quot;Vol. 1&quot;');
    expect(html).not.toContain('<Chips>');
    expect(html).toContain('Payment: Card');
    expect(html).toMatch(/Total: [^<]*40/);
  });
});
