import { describe, it, expect, beforeEach } from 'vitest';
import { buildHarness } from './helpers/extract-decl.js';
import { escapeHtml } from '../src/lib/html.js';

// The checkout column is the screen under the most time pressure in the app —
// a customer is standing at the fair table while it is read and tapped. A
// mis-tap here removes a line or charges the wrong amount, so what it puts on
// screen is worth covering directly.
//
// buildPOSCartRows does all the money work and is left alone; these helpers
// only format what it produces, which is exactly the split being tested.

function makeHarness({ isPublisher = true } = {}) {
  return buildHarness({
    names: ['posCartRowHtml', 'posCartEmptyHtml', 'posSyncCheckoutAvailability'],
    deps: {
      escapeHtml,
      // Deliberately simple: the formatter is covered by money.test.js, and a
      // real one here would hide which text came from which field.
      posFormat: (amount, code) => `${code} ${Number(amount ?? 0).toFixed(2)}`,
      $: (id) => document.getElementById(id),
      window: { IS_PUBLISHER: isPublisher },
    },
    returns: '{ posCartRowHtml, posCartEmptyHtml, posSyncCheckoutAvailability }',
  });
}

const row = (over = {}) => ({
  book: { id: 'book-1', title: 'Bookmark Letters' },
  qty: 2,
  sourceCode: 'EUR',
  sourceUnit: 12,
  listUnit: 12,
  overridden: false,
  sourceLine: 24,
  convertedUnit: 12,
  convertedLine: 24,
  ...over,
});

function mount(html) {
  document.body.innerHTML = `<div id="cart">${html}</div>`;
  return document.getElementById('cart');
}

beforeEach(() => { document.body.innerHTML = ''; });

describe('posCartRowHtml', () => {
  it('shows the title, the quantity × unit price, and the line total', () => {
    const h = makeHarness();
    const el = mount(h.posCartRowHtml(row(), 'EUR'));

    expect(el.querySelector('.pos-line-title').textContent).toBe('Bookmark Letters');
    expect(el.querySelector('.pos-line-meta').textContent).toContain('2');
    expect(el.querySelector('.pos-line-meta').textContent).toContain('EUR 12.00');
    expect(el.querySelector('.pos-line-total').textContent).toBe('EUR 24.00');
  });

  it('puts the line total in tabular figures', () => {
    // Financial invariant: money stacks in a column here, so the digits have to
    // be the same width or the totals do not line up down the cart.
    const h = makeHarness();
    const el = mount(h.posCartRowHtml(row(), 'EUR'));
    expect(el.querySelector('.pos-line-total').classList.contains('mono-num')).toBe(true);
  });

  it('converts the line total into the transaction currency when a rate exists', () => {
    const h = makeHarness();
    const el = mount(h.posCartRowHtml(row({ convertedLine: 31.2 }), 'CAD'));
    expect(el.querySelector('.pos-line-total').textContent).toBe('CAD 31.20');
  });

  it('falls back to the book’s own currency when there is no rate', () => {
    // Showing a converted-looking number with no rate behind it would be a
    // wrong price on a real sale, so the native amount is shown instead.
    const h = makeHarness();
    const el = mount(h.posCartRowHtml(row({ convertedLine: null }), 'CAD'));
    expect(el.querySelector('.pos-line-total').textContent).toBe('EUR 24.00');
  });

  it('shows the original price struck through when the price was adjusted', () => {
    const h = makeHarness();
    const el = mount(h.posCartRowHtml(row({ overridden: true, sourceUnit: 10, listUnit: 12 }), 'EUR'));

    expect(el.querySelector('.pos-line-was').textContent).toBe('EUR 12.00');
    expect(el.querySelector('.pos-line-now').textContent).toBe('EUR 10.00');
    expect(el.querySelector('.pos-line-adj')).not.toBeNull();
  });

  it('gives all three line controls a real tap target and keeps remove distinct', () => {
    // These were three identical ~20px pills, one of which deleted the line.
    const h = makeHarness();
    const el = mount(h.posCartRowHtml(row(), 'EUR'));
    const btns = [...el.querySelectorAll('.pos-line-btn')];

    expect(btns).toHaveLength(3);
    const remove = el.querySelector('.pos-line-btn.danger');
    expect(remove).not.toBeNull();
    // The destructive one is the only one carrying the danger role, and it is
    // an icon rather than a third word-shaped button.
    expect(btns.filter(b => b.classList.contains('danger'))).toHaveLength(1);
    expect(remove.getAttribute('onclick')).toContain('posRemoveItem');
    // Icon-only, so it needs its own accessible name.
    expect(remove.getAttribute('aria-label')).toContain('Bookmark Letters');
  });

  it('wires each control to its own book id', () => {
    const h = makeHarness();
    const el = mount(h.posCartRowHtml(row({ book: { id: 'bk-42', title: 'Salt' } }), 'EUR'));
    const onclicks = [...el.querySelectorAll('.pos-line-btn')].map(b => b.getAttribute('onclick'));

    expect(onclicks[0]).toBe("openPosPriceModal('bk-42')");
    expect(onclicks[1]).toBe("posGenerateLineQR('bk-42')");
    expect(onclicks[2]).toBe("posRemoveItem('bk-42')");
  });

  it('escapes a book title instead of injecting markup', () => {
    const h = makeHarness();
    const el = mount(h.posCartRowHtml(row({
      book: { id: 'b1', title: '<img src=x onerror=alert(1)>' },
    }), 'EUR'));

    expect(el.querySelector('img')).toBeNull();
    expect(el.querySelector('.pos-line-title').textContent).toBe('<img src=x onerror=alert(1)>');
  });

  it('renders a placeholder rather than the word undefined for a missing title', () => {
    const h = makeHarness();
    const el = mount(h.posCartRowHtml(row({ book: { id: 'b1' } }), 'EUR'));
    expect(el.querySelector('.pos-line-title').textContent).toBe('Untitled');
    expect(el.textContent).not.toContain('undefined');
  });
});

describe('posCartEmptyHtml', () => {
  it('says what to do next rather than only reporting that the cart is empty', () => {
    // An empty till is the normal state between customers, not an error.
    const h = makeHarness();
    const el = mount(h.posCartEmptyHtml());

    expect(el.querySelector('.e-icon')).not.toBeNull();
    expect(el.textContent).toContain('Nothing in the cart yet');
    // The two ways to start a sale.
    expect(el.textContent).toContain('start a sale');
    expect(el.querySelector('kbd')).not.toBeNull();
  });
});

describe('posSyncCheckoutAvailability', () => {
  const mountButtons = () => {
    document.body.innerHTML = `
      <button id="pos-checkout-btn">Complete Sale</button>
      <button id="pos-sale-qr-btn">Pay by QR</button>`;
    return {
      checkout: document.getElementById('pos-checkout-btn'),
      qr: document.getElementById('pos-sale-qr-btn'),
    };
  };

  it('disables both checkout actions while the cart is empty', () => {
    const h = makeHarness();
    const { checkout, qr } = mountButtons();
    h.posSyncCheckoutAvailability(false);

    expect(checkout.disabled).toBe(true);
    expect(qr.disabled).toBe(true);
  });

  it('explains why, so the disabled state is not a dead end', () => {
    const h = makeHarness();
    const { checkout, qr } = mountButtons();
    h.posSyncCheckoutAvailability(false);

    expect(checkout.getAttribute('title')).toBe('Add a book to the cart first');
    expect(qr.getAttribute('title')).toBe('Add a book to the cart first');
  });

  it('re-enables both and drops the explanation once something is in the cart', () => {
    const h = makeHarness();
    const { checkout, qr } = mountButtons();
    h.posSyncCheckoutAvailability(false);
    h.posSyncCheckoutAvailability(true);

    expect(checkout.disabled).toBe(false);
    expect(qr.disabled).toBe(false);
    // Left behind, the hint would contradict a button that now works.
    expect(checkout.getAttribute('title')).toBeNull();
    expect(qr.getAttribute('title')).toBeNull();
  });

  it('does not throw when the checkout column is not mounted', () => {
    // renderPOS runs on tabs where the POS panel is absent from the DOM.
    const h = makeHarness();
    document.body.innerHTML = '';
    expect(() => h.posSyncCheckoutAvailability(true)).not.toThrow();
  });
});
