import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { buildHarness, mainJs } from './helpers/extract-decl.js';
import { escapeHtml } from '../src/lib/html.js';

// The tally sheet and the payment QR sheet used to be two buttons, two dialogs
// and two saved presets for one table at one fair — the seller set the same
// books up twice, every time. They are one dialog now, which puts real weight
// on two things this suite covers:
//
//   1. ONE book list feeding both sheets. A title with no way to take payment
//      is legitimate on the tally sheet and impossible on the QR sheet, so the
//      merged list has to stay honest about which titles actually become cards.
//   2. The print order. `printPaymentQRCodes` awaits (it can mint Stripe links
//      for door prices), and a window.open() after an await is a pop-up the
//      browser never traces back to the click. The QR window therefore has to
//      be opened up front, and cleaned up if the tally sheet bails.

const BOOKS = {
  'linked-a': { id: 'linked-a', title: 'Salt & Tide', author: 'R. Vane', currency: '€', listPrice: 24, stripeLink: 'https://buy.stripe.com/a' },
  'linked-b': { id: 'linked-b', title: 'Night Ferry', author: 'R. Vane', currency: '€', listPrice: 18, paymentLink: 'https://buy.stripe.com/b' },
  'no-link': { id: 'no-link', title: 'Chapbook No. 4', author: 'M. Oyelaran', currency: '€', listPrice: 12 },
};

function mountModal() {
  document.body.innerHTML = `
    <select id="qrp-base-cur"><option value="auto" selected>auto</option><option value="EUR">EUR</option></select>
    <div id="st-pack-total"></div>
    <div id="fk-books-list"></div>
    <div id="fk-summary"></div>
    <button id="fk-print-btn"></button>
    <div id="fk-opts-tracker"></div>
    <div id="fk-opts-qr"></div>
    <label><input type="radio" name="fk-mode" value="both" checked></label>
    <label><input type="radio" name="fk-mode" value="tracker"></label>
    <label><input type="radio" name="fk-mode" value="qr"></label>
  `;
}

function pickMode(value) {
  document.querySelectorAll('input[name="fk-mode"]').forEach((el) => { el.checked = el.value === value; });
}

function makeHarness({ stripeKey = '' } = {}) {
  return buildHarness({
    names: [
      '_stOnHandHint', '_fkPackedTotal', '_stUpdatePackTotal',
      '_fkBookPrintsQR', '_fkSelectionCounts', '_fkUpdateSummary',
      'fairKitSelectionChanged', 'fairKitMode', 'fairKitModeChanged',
      'renderFairKitBookList',
    ],
    deps: {
      posBooksMap: () => BOOKS,
      posResolveBook: (id) => BOOKS[id] || null,
      getReconStripeKey: () => stripeKey,
      currencyToCode: () => 'EUR',
      convertCurrency: (amount) => amount,
      deriveOnHand: () => 7,
      escapeHtml,
      window: globalThis.window,
      document: globalThis.document,
    },
    moduleState: `
      let salesTrackerCustomBooks = [];
      let salesTrackerQtyBrought = {};
    `,
    returns: `{
      renderFairKitBookList, fairKitModeChanged, fairKitSelectionChanged,
      _fkSelectionCounts, _fkPackedTotal,
      addCustom: (b) => salesTrackerCustomBooks.push(b),
    }`,
  });
}

describe('fair kit book list — one list, two sheets', () => {
  beforeEach(mountModal);

  it('gives every catalog row both sheets\' marker classes and both fields', () => {
    const fk = makeHarness();
    fk.renderFairKitBookList();

    const rows = document.querySelectorAll('.fk-book');
    expect(rows).toHaveLength(3);

    // One checkbox answering to both sheets' selectors is what lets the tally
    // and QR print paths keep querying for what they print, unchanged.
    const check = document.querySelector('#fk-pick-linked-a');
    expect(check.classList.contains('st-book-check')).toBe(true);
    expect(check.classList.contains('qrp-book-check')).toBe(true);
    expect(check.dataset.kind).toBe('inv');
    expect(check.checked).toBe(true);

    expect(document.querySelector('#fk-qty-linked-a')).not.toBeNull();
    expect(document.querySelector('#qrp-override-linked-a')).not.toBeNull();
  });

  it('keeps an unlinked title selectable and says on the row why it gets no QR', () => {
    const fk = makeHarness();
    fk.renderFairKitBookList();

    expect(document.querySelector('#fk-pick-no-link').checked).toBe(true);
    expect(document.querySelector('#fk-pick-no-link').disabled).toBe(false);
    expect(document.body.innerHTML).toContain('Tally only · no link');
  });

  it('offers the door price as the way to get a QR once a Stripe key is saved', () => {
    const fk = makeHarness({ stripeKey: 'sk_test_x' });
    fk.renderFairKitBookList();
    expect(document.body.innerHTML).toContain('QR needs a door price');
  });

  it('shows custom titles as tally-only, with no door price field', () => {
    const fk = makeHarness();
    fk.addCustom({ title: 'Fair-only zine', author: '', qty: 4 });
    fk.renderFairKitBookList();

    const custom = document.querySelector('#fk-pick-custom-0');
    expect(custom.dataset.kind).toBe('custom');
    // No .qrp-book-check: a title with no catalog record can never be a card.
    expect(custom.classList.contains('qrp-book-check')).toBe(false);
    expect(document.querySelector('#qrp-override-custom-0')).toBeNull();
    expect(document.querySelector('#fk-qty-custom-0').value).toBe('4');
  });
});

describe('fair kit counts what will actually print', () => {
  beforeEach(mountModal);

  it('counts a title with no link on the tally sheet but not the QR sheet', () => {
    const fk = makeHarness();
    fk.renderFairKitBookList();

    const counts = fk._fkSelectionCounts();
    expect(counts.titles).toBe(3);
    expect(counts.qrCards).toBe(2);
    expect(counts.noCard).toBe(1);
  });

  it('promotes an unlinked title to a card once it has a door price and a key', () => {
    const fk = makeHarness({ stripeKey: 'sk_test_x' });
    fk.renderFairKitBookList();
    expect(fk._fkSelectionCounts().qrCards).toBe(2);

    document.querySelector('#qrp-override-no-link').value = '15';
    expect(fk._fkSelectionCounts().qrCards).toBe(3);
  });

  it('does not promise a card for a door price with no Stripe key to mint one', () => {
    const fk = makeHarness();
    fk.renderFairKitBookList();
    document.querySelector('#qrp-override-no-link').value = '15';
    expect(fk._fkSelectionCounts().qrCards).toBe(2);
  });

  it('never counts a card for a row whose title has left the catalog', () => {
    const fk = makeHarness({ stripeKey: 'sk_test_x' });
    fk.renderFairKitBookList();

    const stale = document.querySelector('#fk-pick-linked-a');
    stale.value = 'retired-last-season';
    document.querySelector('#qrp-override-linked-a').id = 'qrp-override-retired-last-season';
    document.querySelector('#qrp-override-retired-last-season').value = '20';

    expect(fk._fkSelectionCounts().qrCards).toBe(1);
  });

  it('drops a title from both counts when it is unchecked', () => {
    const fk = makeHarness();
    fk.renderFairKitBookList();
    document.querySelector('#fk-pick-linked-a').checked = false;

    const counts = fk._fkSelectionCounts();
    expect(counts.titles).toBe(2);
    expect(counts.qrCards).toBe(1);
  });

  it('totals the packed copies across catalog and custom titles', () => {
    const fk = makeHarness();
    fk.addCustom({ title: 'Fair-only zine', author: '', qty: 4 });
    fk.renderFairKitBookList();
    document.querySelector('#fk-qty-linked-a').value = '10';
    fk.fairKitSelectionChanged(); // what typing in the field triggers

    expect(fk._fkPackedTotal()).toBe(14);
    expect(document.getElementById('st-pack-total').textContent).toContain('14 books packed');
  });
});

describe('fair kit footer read-out', () => {
  beforeEach(mountModal);

  it('names both sheets, with the titles that will have no card', () => {
    const fk = makeHarness();
    fk.renderFairKitBookList();

    const summary = document.getElementById('fk-summary').textContent;
    expect(summary).toContain('3 titles');
    expect(summary).toContain('2 cards');
    expect(summary).toContain('1 title without a payment link');
  });

  it('only describes the sheet being printed', () => {
    const fk = makeHarness();
    fk.renderFairKitBookList();

    pickMode('tracker');
    fk.fairKitModeChanged();
    expect(document.getElementById('fk-summary').textContent).not.toContain('QR sheet');
    expect(document.getElementById('fk-opts-qr').hidden).toBe(true);
    expect(document.getElementById('fk-opts-tracker').hidden).toBe(false);

    pickMode('qr');
    fk.fairKitModeChanged();
    expect(document.getElementById('fk-summary').textContent).not.toContain('Tally sheet');
    expect(document.getElementById('fk-opts-tracker').hidden).toBe(true);
  });

  it('hides the per-book field that belongs to the sheet not being printed', () => {
    const fk = makeHarness();
    fk.renderFairKitBookList();
    const list = document.getElementById('fk-books-list');

    pickMode('tracker');
    fk.fairKitModeChanged();
    expect(list.classList.contains('fk-hide-price')).toBe(true);
    expect(list.classList.contains('fk-hide-qty')).toBe(false);

    pickMode('qr');
    fk.fairKitModeChanged();
    expect(list.classList.contains('fk-hide-qty')).toBe(true);
    expect(list.classList.contains('fk-hide-price')).toBe(false);

    pickMode('both');
    fk.fairKitModeChanged();
    expect(list.classList.contains('fk-hide-qty')).toBe(false);
    expect(list.classList.contains('fk-hide-price')).toBe(false);
  });

  it('blocks the print button when nothing would come out of the printer', () => {
    const fk = makeHarness();
    fk.renderFairKitBookList();
    expect(document.getElementById('fk-print-btn').disabled).toBe(false);

    document.querySelectorAll('.st-book-check').forEach((el) => { el.checked = false; });
    fk.fairKitSelectionChanged();
    expect(document.getElementById('fk-print-btn').disabled).toBe(true);
  });

  it('blocks a QR-only print when no selected title can take payment', () => {
    const fk = makeHarness();
    fk.renderFairKitBookList();
    document.querySelector('#fk-pick-linked-a').checked = false;
    document.querySelector('#fk-pick-linked-b').checked = false;

    pickMode('qr');
    fk.fairKitModeChanged();
    expect(document.getElementById('fk-print-btn').disabled).toBe(true);
    expect(document.getElementById('fk-summary').textContent).toContain('payment link or a door price');
  });
});

describe('printFairKit ordering', () => {
  function makePrintHarness({ trackerPrints = true, qrPrints = true } = {}) {
    const calls = [];
    const qrWindow = { closed: false, close: () => { qrWindow.closed = true; calls.push('qr-window-closed'); } };

    const harness = buildHarness({
      names: ['fairKitMode', 'printFairKit'],
      deps: {
        _fkOpenQrPrintWindow: () => { calls.push('open-qr-window'); return qrWindow; },
        printSalesTracker: (opts) => { calls.push(`tracker:${opts?.closeModal}`); return trackerPrints; },
        printPaymentQRCodes: async (opts) => {
          calls.push(`qr:${opts?.win === qrWindow ? 'reused-window' : 'new-window'}`);
          return qrPrints;
        },
        closeM: (id) => calls.push(`close:${id}`),
        showToast: () => {},
        document: globalThis.document,
      },
      returns: '{ printFairKit }',
    });
    return { ...harness, calls, qrWindow };
  }

  beforeEach(mountModal);

  it('opens the QR window before the awaited work, and reuses it', async () => {
    const { printFairKit, calls } = makePrintHarness();
    await printFairKit();

    expect(calls[0]).toBe('open-qr-window');
    expect(calls).toContain('qr:reused-window');
    expect(calls).toContain('close:fair-kit');
    // The tally sheet must not close the shared dialog out from under the QR
    // half — printFairKit closes it once, at the end.
    expect(calls).toContain('tracker:false');
  });

  it('closes the pre-opened QR window when the tally sheet bails', async () => {
    const { printFairKit, calls, qrWindow } = makePrintHarness({ trackerPrints: false });
    await printFairKit();

    expect(qrWindow.closed).toBe(true);
    expect(calls).not.toContain('qr:reused-window');
    expect(calls).not.toContain('close:fair-kit');
  });

  it('prints one sheet on its own without opening a stray window', async () => {
    const { printFairKit, calls } = makePrintHarness();

    pickMode('tracker');
    await printFairKit();
    expect(calls).toEqual(['tracker:undefined']);

    calls.length = 0;
    pickMode('qr');
    await printFairKit();
    expect(calls).toEqual(['qr:new-window']);
  });
});

describe('fair kit wiring', () => {
  const html = fs.readFileSync(path.join(process.cwd(), 'index.html'), 'utf8');

  it('replaces the two POS print buttons with one combined entry point', () => {
    expect(html).toContain('openFairKitModal()');
    expect(html).not.toContain('openSalesTrackerModal()');
    expect(html).not.toContain('openQRPrintModal()');
    expect(html).toContain('id="m-fair-kit"');
  });

  it('keeps both sheets\' settings in the one dialog', () => {
    for (const id of ['st-cols', 'st-currency', 'st-notes', 'qrp-cols', 'qrp-base-cur', 'qrp-fit-one-page']) {
      expect(html).toContain(`id="${id}"`);
    }
  });

  // A panel with its own scrollbar hides rows behind an edge nobody notices —
  // and on a packing list, a hidden row is a book left at home.
  it('leaves the dialog itself as the only scrolling surface', () => {
    const modal = html.slice(html.indexOf('id="m-fair-kit"'), html.indexOf('<!-- WEB ANALYTICS'));
    expect(modal).not.toMatch(/overflow|max-height/);

    const css = fs.readFileSync(path.join(process.cwd(), 'src/style.css'), 'utf8');
    const section = css.slice(css.indexOf('FAIR PRINT KIT MODAL'));
    expect(section).not.toMatch(/overflow|max-height/);
  });

  it('sends both print paths at the same modal, so neither can strand the other', () => {
    expect(mainJs).not.toContain("closeM('sales-tracker')");
    expect(mainJs).not.toContain("closeM('qr-print')");
  });
});

// A guard on the pop-up rule that the ordering test can only assert indirectly:
// the source itself must not open the QR window after an await.
describe('printFairKit source', () => {
  it('opens the QR window before anything is awaited', () => {
    const fn = mainJs.slice(mainJs.indexOf('async function printFairKit('));
    const body = fn.slice(0, fn.indexOf('\n}\n'));
    // The both-sheets path: the window has to exist before the awaited call
    // that fills it, or the browser blocks it as an untraceable pop-up.
    expect(body.indexOf('_fkOpenQrPrintWindow()')).toBeGreaterThan(-1);
    expect(body.indexOf('_fkOpenQrPrintWindow()'))
      .toBeLessThan(body.indexOf('await printPaymentQRCodes({ closeModal: false, win: qrWin })'));
  });
});
