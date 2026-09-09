import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeEach, describe, expect, it } from 'vitest';
import { extractDecl, mainJs } from './helpers/extract-decl.js';
import {
  BILL_TO_PERSON,
  BILL_TO_STORE,
  billToPayload,
  billToPersonFrom,
  invoiceBillToMode,
  normalizeBillToPerson,
} from '../src/lib/invoices.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const indexHtml = readFileSync(path.join(__dirname, '../index.html'), 'utf8');

// The publisher bills a consignment store most of the time, but not always —
// a reader buying direct, a school, a festival organiser have no store record
// and never should get one. Both kinds of bill are written into the same
// recipient fields so the printed invoice, the email and the PDF are unchanged.

describe('invoiceBillToMode', () => {
  it('reads the mode an invoice was saved with', () => {
    expect(invoiceBillToMode({ billTo: 'person' })).toBe(BILL_TO_PERSON);
    expect(invoiceBillToMode({ billTo: 'store', storeId: 4 })).toBe(BILL_TO_STORE);
  });

  it('treats every invoice written before this existed as a store bill', () => {
    // They all carried a store id, because a store was the only choice.
    expect(invoiceBillToMode({ storeId: 7, storeName: 'Casa Bosques' })).toBe(BILL_TO_STORE);
    expect(invoiceBillToMode({})).toBe(BILL_TO_STORE);
    expect(invoiceBillToMode(null)).toBe(BILL_TO_STORE);
  });

  it('infers a person from a named recipient with no store behind it', () => {
    expect(invoiceBillToMode({ storeId: null, storeName: 'Maria Rossi' })).toBe(BILL_TO_PERSON);
  });

  it('ignores an unrecognised value rather than inventing a third mode', () => {
    expect(invoiceBillToMode({ billTo: 'walrus', storeId: 3 })).toBe(BILL_TO_STORE);
  });
});

describe('normalizeBillToPerson', () => {
  it('trims every field and never leaves one undefined', () => {
    const p = normalizeBillToPerson({ name: '  Maria Rossi ', email: ' m@r.it ' });
    expect(p.name).toBe('Maria Rossi');
    expect(p.email).toBe('m@r.it');
    expect(p.phone).toBe('');
    expect(p.country).toBe('');
  });

  it('survives being handed nothing at all', () => {
    expect(normalizeBillToPerson().name).toBe('');
  });
});

describe('billToPayload', () => {
  const store = {
    id: 12, name: 'Casa Bosques', email: 'hola@casabosques.com', city: 'Mexico City',
    contact: 'Ana', phone: '+52 55 1234', address: 'Calle 1', region: 'CDMX',
    postal: '06700', country: 'Mexico', rate: 40,
  };

  it('flattens a chosen store exactly as the editor always has', () => {
    const out = billToPayload(BILL_TO_STORE, { store });
    expect(out.billTo).toBe(BILL_TO_STORE);
    expect(out.storeId).toBe(12);
    expect(out.storeName).toBe('Casa Bosques');
    expect(out.storeContact).toBe('Ana');
    expect(out.storeCountry).toBe('Mexico');
  });

  it('writes a hand-typed person into the same fields, with no store id', () => {
    const out = billToPayload(BILL_TO_PERSON, {
      person: { name: ' Maria Rossi ', email: 'maria@example.com', city: 'Milan' },
    });
    expect(out.billTo).toBe(BILL_TO_PERSON);
    expect(out.storeId).toBeNull();
    expect(out.storeName).toBe('Maria Rossi');
    expect(out.storeEmail).toBe('maria@example.com');
    expect(out.storeCity).toBe('Milan');
  });

  it('leaves the contact line empty for a person, so the name prints once', () => {
    const out = billToPayload(BILL_TO_PERSON, { person: { name: 'Maria Rossi' } });
    expect(out.storeContact).toBe('');
  });

  it('carries the same keys either way, so nothing downstream has to branch', () => {
    const storeKeys = Object.keys(billToPayload(BILL_TO_STORE, { store })).sort();
    const personKeys = Object.keys(billToPayload(BILL_TO_PERSON, { person: { name: 'X' } })).sort();
    expect(personKeys).toEqual(storeKeys);
  });

  it('round-trips a saved person back into the form it was typed in', () => {
    const saved = billToPayload(BILL_TO_PERSON, {
      person: { name: 'Maria Rossi', email: 'maria@example.com', phone: '+39 02', address: 'Via Roma 1', city: 'Milan', region: 'MI', postal: '20121', country: 'Italy' },
    });
    expect(billToPersonFrom(saved)).toEqual({
      name: 'Maria Rossi', email: 'maria@example.com', phone: '+39 02', address: 'Via Roma 1',
      city: 'Milan', region: 'MI', postal: '20121', country: 'Italy',
    });
  });
});

// ── the editor, running against the real markup ─────────────────────────
const INVOICE_MODAL = (() => {
  const start = indexHtml.indexOf('<div class="inv-billto-switch">');
  const end = indexHtml.indexOf('<div id="inv-books-hint"');
  expect(start, 'expected the bill-to switch in index.html').toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  return indexHtml.slice(start, end);
})();

const harness = () => {
  const factory = new Function(
    '$', 'invoiceBillToMode', 'BILL_TO_STORE', 'BILL_TO_PERSON', 'refreshUnsavedMarkers',
    [
      extractDecl('INV_PERSON_FIELDS'),
      extractDecl('currentInvoiceBillToMode'),
      extractDecl('readInvoicePersonForm'),
      extractDecl('fillInvoicePersonForm'),
      extractDecl('setInvoiceBillToMode'),
      'return { currentInvoiceBillToMode, readInvoicePersonForm, fillInvoicePersonForm, setInvoiceBillToMode };',
    ].join('\n'),
  );
  return factory(id => document.getElementById(id), invoiceBillToMode, BILL_TO_STORE, BILL_TO_PERSON, () => { });
};

describe('the bill-to switch in the invoice editor', () => {
  let api;

  beforeEach(() => {
    document.body.innerHTML = INVOICE_MODAL;
    api = harness();
  });

  it('starts on the store side, with the hand-typed fields out of the way', () => {
    expect(api.currentInvoiceBillToMode()).toBe(BILL_TO_STORE);
    expect(document.getElementById('inv-billto-store-group').hidden).toBe(false);
    expect(document.getElementById('inv-billto-person-group').hidden).toBe(true);
    expect(document.getElementById('inv-person-details').hidden).toBe(true);
  });

  it('swaps to the hand-typed recipient and back', () => {
    api.setInvoiceBillToMode(BILL_TO_PERSON);
    expect(api.currentInvoiceBillToMode()).toBe(BILL_TO_PERSON);
    expect(document.getElementById('inv-billto-store-group').hidden).toBe(true);
    expect(document.getElementById('inv-person-details').hidden).toBe(false);
    expect(document.getElementById('inv-billto-tab-person').getAttribute('aria-selected')).toBe('true');
    expect(document.getElementById('inv-billto-tab-store').getAttribute('aria-selected')).toBe('false');

    api.setInvoiceBillToMode(BILL_TO_STORE);
    expect(api.currentInvoiceBillToMode()).toBe(BILL_TO_STORE);
    expect(document.getElementById('inv-person-details').hidden).toBe(true);
    expect(document.getElementById('inv-billto-tab-store').classList.contains('active')).toBe(true);
  });

  it('drops a half-picked store when the bill moves to a person', () => {
    // Otherwise a store chosen a moment ago is still selected behind the form
    // and lands on a bill addressed to somebody else entirely.
    const sel = document.getElementById('inv-store');
    sel.innerHTML = '<option value="">— Select store —</option><option value="12">Casa Bosques</option>';
    sel.value = '12';
    const preview = document.getElementById('inv-store-preview');
    preview.innerHTML = '<strong>Email:</strong> hola@casabosques.com';
    preview.style.display = 'block';

    api.setInvoiceBillToMode(BILL_TO_PERSON);

    expect(sel.value).toBe('');
    expect(preview.innerHTML).toBe('');
    expect(preview.style.display).toBe('none');
  });

  it('turns off the pending-sales import for a person, who has no ledger', () => {
    const btn = document.getElementById('inv-import-pending-btn');
    expect(btn.disabled).toBe(false);

    api.setInvoiceBillToMode(BILL_TO_PERSON);
    expect(btn.disabled).toBe(true);

    api.setInvoiceBillToMode(BILL_TO_STORE);
    expect(btn.disabled).toBe(false);
  });

  it('reads back and refills every hand-typed field', () => {
    api.setInvoiceBillToMode(BILL_TO_PERSON);
    const typed = {
      name: 'Maria Rossi', email: 'maria@example.com', phone: '+39 02 1234',
      address: 'Via Roma 1', city: 'Milan', region: 'MI', postal: '20121', country: 'Italy',
    };
    api.fillInvoicePersonForm(typed);
    expect(api.readInvoicePersonForm()).toEqual(typed);

    api.fillInvoicePersonForm(null);
    expect(api.readInvoicePersonForm().name).toBe('');
    expect(api.readInvoicePersonForm().country).toBe('');
  });
});

describe('the invoice editor markup and save path', () => {
  it('offers both sides of the switch, with the store side selected by default', () => {
    expect(INVOICE_MODAL).toContain('setInvoiceBillToMode(\'store\')');
    expect(INVOICE_MODAL).toContain('setInvoiceBillToMode(\'person\')');
    expect(INVOICE_MODAL).toMatch(/<input type="hidden" id="inv-billto-mode" value="store">/);
  });

  it('keeps the hand-typed fields inside the modal so unsaved-changes still tracks them', () => {
    for (const f of ['name', 'email', 'phone', 'address', 'city', 'region', 'postal', 'country']) {
      expect(INVOICE_MODAL).toContain(`id="inv-person-${f}"`);
    }
  });

  it('saves the recipient through the one shared helper, for either kind of bill', () => {
    const save = extractDecl('saveInvoice', mainJs);
    expect(save).toContain('billToPayload(billToMode, { store, person })');
    // A bill with nobody's name on it is not a bill.
    expect(save).toContain('Enter the name this invoice is billed to');
    // The store path keeps its own guard.
    expect(save).toContain('Choose a store to bill');
  });

  it('reopens a saved invoice on the side it was written on', () => {
    const open = extractDecl('openCreateInvoice', mainJs);
    expect(open).toContain('invoiceBillToMode(inv)');
    expect(open).toContain('billToPersonFrom(inv)');
    // A new invoice starts clean on the store side.
    expect(open).toContain('fillInvoicePersonForm(null)');
    expect(open).toContain('setInvoiceBillToMode(BILL_TO_STORE, { silent: true })');
  });

  it('refuses to pull consignment sales onto a hand-typed bill', () => {
    const prefill = extractDecl('prefillFromPendingSales', mainJs);
    expect(prefill).toContain('Pending sales only apply to consignment stores');
  });

  it('exposes the switch to the markup that calls it', () => {
    expect(mainJs).toContain('setInvoiceBillToMode, prefillFromPendingSales');
  });
});
