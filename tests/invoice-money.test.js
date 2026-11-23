// @vitest-environment jsdom
// Invoices, driven through the real app: open "New invoice", pick the shop,
// add lines with the book buttons, type copies / discount / tax into the same
// boxes the screen has, save it, then mark it paid through the "what arrived"
// form. Checked: the figures the editor shows, the invoice that is stored and
// sent to the cloud, and what paying it does to the consignment ledger and the
// shop's owed balance.
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { loadApp, makeBook } from './helpers/load-app.js';

const HARBOUR = 'harbour';
const ORCHARD = 'orchard';
const STORE = { id: 7, name: 'Corner Books', city: 'Guelph', email: 'orders@example.com', amountOwed: 72 };

// Two copies and one copy sold on consignment, not yet paid for: 72 owed.
const pendingSales = () => [
  { id: 'led-1', storeId: 7, storeName: 'Corner Books', type: 'Sale', date: '2026-09-01', qty: 2, rate: 40, amountDue: 48, status: 'pending', paid: 'pending' },
  { id: 'led-2', storeId: 7, storeName: 'Corner Books', type: 'Sale', date: '2026-09-15', qty: 1, rate: 40, amountDue: 24, status: 'pending', paid: 'pending' },
];

let app;
let win;
const $ = (id) => document.getElementById(id);
const state = () => app.main.states[HARBOUR];
const saved = () => app.cloud.lastSave(HARBOUR)?.state;

function type(id, value) {
  const el = $(id);
  el.value = String(value);
  el.dispatchEvent(new window.Event('input', { bubbles: true }));
}

/** The line inputs as the screen draws them, by line and field. */
function lineInput(i, field) {
  return document.querySelector(`#inv-items-body [data-i="${i}"] [data-f="${field}"]`);
}
function typeInLine(i, field, value) {
  const el = lineInput(i, field);
  el.value = String(value);
  el.dispatchEvent(new window.Event('input', { bubbles: true }));
}

const editorTotals = () => ({
  subtotal: $('inv-sub-val').textContent,
  discount: $('inv-disc-val').textContent,
  tax: $('inv-tax-val').textContent,
  total: $('inv-total-val').textContent,
});

/** New invoice to Corner Books: 3 × Harbour Lights (40) + 2 × Orchard Songs (25). */
function startTwoLineInvoice() {
  win.openCreateInvoice();
  $('inv-store').value = String(STORE.id);
  win.onInvoiceStoreChange();
  win.addInvoiceBookLine(HARBOUR);
  win.addInvoiceBookLine(ORCHARD);
  typeInLine(0, 'qty', 3);
  typeInLine(1, 'qty', 2);
}

beforeAll(async () => {
  app = await loadApp({
    books: [
      makeBook({ id: HARBOUR, title: 'Harbour Lights', currency: 'CA$', listPrice: 40 }),
      makeBook({ id: ORCHARD, title: 'Orchard Songs', currency: 'CA$', listPrice: 25 }),
    ],
  });
  win = app.window;
}, 30000);

beforeEach(async () => {
  await app.resetBook(HARBOUR, { stores: [{ ...STORE }], ledger: pendingSales(), invoices: [], invoiceSeq: 0 });
  await app.resetBook(ORCHARD, { invoices: [] });
  if (app.main.activeBook !== HARBOUR) win.switchBook(HARBOUR);
});

describe('a new invoice with two lines', () => {
  it('fills each line with its book\'s price and works out the total and tax', () => {
    startTwoLineInvoice();
    expect(lineInput(0, 'unitPrice').value).toBe('40.00');
    expect(lineInput(1, 'unitPrice').value).toBe('25.00');
    type('inv-tax', 13);
    win.recalcInvoiceTotals();
    // 3 × 40 + 2 × 25 = 170; 13% tax = 22.10.
    expect(editorTotals()).toEqual({ subtotal: 'CA$170.00', discount: 'CA$0.00', tax: 'CA$22.10', total: 'CA$192.10' });
  });

  it('takes a store discount off before the tax', () => {
    startTwoLineInvoice();
    type('inv-tax', 13);
    win.applyDiscountPreset(20);
    // 170 less 20% = 136; 13% of 136 = 17.68.
    expect(editorTotals()).toEqual({ subtotal: 'CA$170.00', discount: '−CA$34.00', tax: 'CA$17.68', total: 'CA$153.68' });
  });

  it('is stored, with every figure, on the book that issued it and sent to the cloud', async () => {
    startTwoLineInvoice();
    type('inv-tax', 13);
    win.applyDiscountPreset(20);
    win.saveInvoice('sent');
    await app.settle();

    expect(state().invoices).toHaveLength(1);
    const inv = state().invoices[0];
    expect(inv).toMatchObject({
      storeId: 7, storeName: 'Corner Books', status: 'sent',
      subtotal: 170, discount: 34, discountType: 'percent', discountRate: 20,
      taxRate: 13, tax: 17.68, total: 153.68, currency: 'CA$', currencyCode: 'CAD',
    });
    expect(inv.items.map(it => [it.description, it.qty, it.unitPrice, it.bookId]))
      .toEqual([['Harbour Lights', 3, 40, HARBOUR], ['Orchard Songs', 2, 25, ORCHARD]]);
    // Filed under both titles it bills.
    expect(inv.bookIds.sort()).toEqual([HARBOUR, ORCHARD]);
    expect(saved().invoices[0]).toMatchObject({ id: inv.id, total: 153.68, tax: 17.68 });
    // Writing an invoice records no money: the shop's balance is untouched.
    expect(state().stores[0].amountOwed).toBe(72);
    expect(app.toast()).toMatch(/Invoice saved/);
  });

  it('is not saved without a shop to bill', () => {
    startTwoLineInvoice();
    $('inv-store').value = '';
    win.saveInvoice('sent');
    expect(state().invoices).toEqual([]);
    expect(app.toast()).toMatch(/Choose a store/);
  });

  it('is not saved when it comes to nothing', () => {
    win.openCreateInvoice();
    $('inv-store').value = String(STORE.id);
    win.addInvoiceItem('Gift copy', 1, 0);
    win.saveInvoice('sent');
    expect(state().invoices).toEqual([]);
    expect(app.toast()).toMatch(/greater than zero/);
  });
});

describe('billing a shop for its consignment sales, then marking it paid', () => {
  async function invoiceThePendingSales() {
    win.openCreateInvoice(STORE.id); // pulls the shop's unpaid sales in
    expect(document.querySelectorAll('#inv-items-body .inv-item-row')).toHaveLength(2);
    expect($('inv-total-val').textContent).toBe('CA$72.00');
    win.saveInvoice('sent');
    await app.settle();
    const inv = state().invoices[0];
    win.viewInvoice(inv.id);
    return inv;
  }

  it('links each sale to the invoice', async () => {
    const inv = await invoiceThePendingSales();
    expect(inv.total).toBe(72);
    expect(inv.items.map(it => it._ledgerId)).toEqual(['led-1', 'led-2']);
    expect(state().ledger.map(e => e.invoiceId)).toEqual([inv.id, inv.id]);
    expect(state().ledger.every(e => e.status === 'pending')).toBe(true);
  });

  it('paid in full: the invoice, both sales and the shop\'s balance all settle', async () => {
    const inv = await invoiceThePendingSales();
    win.markInvoicePaidFromView();
    expect($('cp-amount').value).toBe('72.00');
    expect($('cp-expected').textContent).toContain('Invoice total: CA$72.00');
    win.confirmConsignPayment();
    await app.settle();

    const paid = state().invoices[0];
    expect(paid).toMatchObject({ id: inv.id, status: 'paid' });
    expect(typeof paid.paidAt).toBe('number');
    // Paid exactly what was billed, in the bill's currency: nothing extra stamped.
    expect(paid.payment).toBeUndefined();
    expect(state().ledger.map(e => e.status)).toEqual(['paid', 'paid']);
    expect(state().stores[0].amountOwed).toBe(0);
    expect(saved().invoices[0].status).toBe('paid');
    expect(saved().ledger.map(e => e.status)).toEqual(['paid', 'paid']);
    expect(saved().stores[0].amountOwed).toBe(0);
    expect(app.toast()).toMatch(/marked paid/);
  });

  it('paid short: still settled, and the amount that actually arrived is kept', async () => {
    await invoiceThePendingSales();
    win.markInvoicePaidFromView();
    $('cp-amount').value = '70.00';
    win.confirmConsignPayment();
    await app.settle();

    const paid = state().invoices[0];
    expect(paid.status).toBe('paid');
    expect(paid.payment).toMatchObject({ currency: 'CAD', amount: 70 });
    expect(state().stores[0].amountOwed).toBe(0);
  });

  it('paid in US dollars: records what arrived and its Canadian value', async () => {
    await invoiceThePendingSales();
    win.markInvoicePaidFromView();
    $('cp-cur').value = 'USD';
    win.onConsignPaymentCurrencyChange();
    $('cp-amount').value = '52.00';
    $('cp-fx-rate').value = '1.4';
    win.confirmConsignPayment();
    await app.settle();

    const paid = state().invoices[0];
    expect(paid.status).toBe('paid');
    expect(paid.payment).toMatchObject({ currency: 'USD', amount: 52 });
    expect(paid.payment.convertedTotal).toBeCloseTo(72.8, 2);
    expect(state().ledger.map(e => e.status)).toEqual(['paid', 'paid']);
    // The two sales share the payment between them, in proportion.
    const parts = state().ledger.map(e => e.payment?.convertedTotal || 0);
    expect(parts[0] + parts[1]).toBeCloseTo(72.8, 2);
    expect(state().stores[0].amountOwed).toBe(0);
    expect(app.toast()).toMatch(/paid — US\$52\.00/);
  });
});
