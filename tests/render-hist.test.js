import { describe, it, expect, beforeEach } from 'vitest';
import { buildHarness } from './helpers/extract-decl.js';

import { escapeHtml } from '../src/lib/html.js';
import { fmt, fmtD, paymentSummary } from '../src/lib/money.js';
import { buildOrderTimeline, inventoryBreakdown } from '../src/lib/inventory.js';
import { reconcileConsignmentInvoiceLinks } from '../src/lib/consignment.js';
import { linkedShippingSummary } from '../src/lib/shipping-reconciliation.js';

// Order History is where a mis-rendered row reads as a sale that didn't happen
// or stock the publisher doesn't have, so this covers what it actually puts on
// screen rather than what src/main.js says.
//
// The aggregation underneath (buildOrderTimeline, inventoryBreakdown,
// reconcileConsignmentInvoiceLinks, the money formatters) is imported for real
// — only the handful of main.js-local collaborators are supplied by the
// harness, and even those are the genuine extracted source. What's stubbed is
// just the ambient state renderHist reads: the book, the state, and the DOM
// lookup.

const BOOK = { id: 'book-1', title: 'Test Book', currency: 'CA$', maxPrint: 100, accent: '#c8693a' };

function mountDom() {
  document.body.innerHTML = `
    <div id="hist-filter-bar"></div>
    <div id="hist-recon"></div>
    <table><tbody id="hist-body"></tbody></table>
  `;
}

function makeHarness({ state, book = BOOK, isPublisher = true, submissions = {} } = {}) {
  return buildHarness({
    names: [
      'CHANNEL_COLORS', '_CHAN_FALLBACK', 'HIST_PAGE',
      'channelColor', 'chanLabel',
      'renderConsignHistRow', 'renderOrderShippingSummary',
      'renderHist',
    ],
    deps: {
      // Ambient state renderHist reads out of module scope.
      getState: () => state,
      getBook: () => book,
      activeBook: book.id,
      $: (id) => document.getElementById(id),
      window: { authorSubmissions: submissions, IS_PUBLISHER: isPublisher },
      TAX_CENTER: { businessExpenses: [] },
      // The real implementations — this is the logic worth exercising.
      escapeHtml, fmt, fmtD, paymentSummary,
      buildOrderTimeline, inventoryBreakdown,
      reconcileConsignmentInvoiceLinks, linkedShippingSummary,
    },
    moduleState: `
      let histChanFilter = null;
      let _histLimit = HIST_PAGE;
      let _histPageSig = null;
    `,
    returns: `{
      renderHist,
      setChanFilter: (v) => { histChanFilter = v; },
      setLimit: (v) => { _histLimit = v; },
      HIST_PAGE,
    }`,
  });
}

const rows = () => [...document.querySelectorAll('#hist-body tr.hist-row')];
const cells = (tr) => [...tr.querySelectorAll('td')].map(td => td.textContent.trim());

beforeEach(mountDom);

describe('renderHist — order rows', () => {
  it('renders one row per history entry with quantity, price and line total', () => {
    const h = makeHarness({
      state: {
        stock: 98, hist: [
          { num: '1002', chan: 'Direct', qty: 1, price: 20, date: '2026-07-20', notes: '' },
          { num: '1001', chan: 'Website', qty: 2, price: 15, date: '2026-07-19', notes: '' },
        ], ledger: [], stores: [],
      },
    });
    h.renderHist();

    const r = rows();
    expect(r).toHaveLength(2);
    expect(cells(r[0])[0]).toContain('1002');
    expect(cells(r[0])[2]).toBe('-1');
    expect(cells(r[0])[4]).toContain('20');   // 1 × 20
    expect(cells(r[1])[2]).toBe('-2');
    expect(cells(r[1])[4]).toContain('30');   // 2 × 15
  });

  it('shows a running stock-after column counting down from the print run', () => {
    // The column publishers read to sanity-check inventory: 100 printed, then
    // 1 and 2 sold, so the newest row must land on 97 and the older on 98.
    const h = makeHarness({
      state: {
        stock: 97, hist: [
          { num: '1002', chan: 'Direct', qty: 1, price: 20, date: '2026-07-20' },
          { num: '1001', chan: 'Direct', qty: 2, price: 20, date: '2026-07-19' },
        ], ledger: [], stores: [],
      },
    });
    h.renderHist();

    const after = rows().map(tr => cells(tr)[5]);
    expect(after).toEqual(['97', '98']);
  });

  it('interleaves consignment ledger movements with direct sales by date', () => {
    const h = makeHarness({
      state: {
        stock: 80, hist: [{ num: '1001', chan: 'Direct', qty: 1, price: 20, date: '2026-07-20' }],
        ledger: [
          { id: 1, type: 'Shipment', storeName: 'Bookshop A', qty: 10, date: '2026-07-15', notes: '' },
        ],
        stores: [],
      },
    });
    h.renderHist();

    const r = rows();
    expect(r).toHaveLength(2);
    expect(r[0].textContent).toContain('1001');
    expect(r[1].textContent).toContain('Bookshop A');
    expect(r[1].textContent).toContain('SENT');
    expect(cells(r[1])[2]).toBe('-10');   // left on-hand for the store
  });

  it('marks a voided row and drops its negative sign', () => {
    const h = makeHarness({
      state: {
        stock: 100,
        hist: [{ num: '1001', chan: 'Direct', qty: 3, price: 20, date: '2026-07-20', voided: true }],
        ledger: [], stores: [],
      },
    });
    h.renderHist();

    const r = rows()[0];
    expect(r.className).toContain('voided');
    expect(r.textContent).toContain('Void');
    expect(cells(r)[2]).toBe('3');   // not '-3' — a void didn't move stock
  });

  it('shows an empty state rather than a blank table when there are no orders', () => {
    const h = makeHarness({ state: { stock: 100, hist: [], ledger: [], stores: [] } });
    h.renderHist();

    expect(rows()).toHaveLength(0);
    expect(document.getElementById('hist-body').textContent).toContain('No orders yet');
  });
});

describe('renderHist — escaping', () => {
  it('escapes order numbers and notes instead of injecting markup', () => {
    const h = makeHarness({
      state: {
        stock: 100,
        hist: [{
          num: '<img src=x onerror=alert(1)>',
          chan: 'Direct', qty: 1, price: 20, date: '2026-07-20',
          notes: '<script>alert(2)</script>',
        }],
        ledger: [], stores: [],
      },
    });
    h.renderHist();

    const body = document.getElementById('hist-body');
    expect(body.querySelector('img')).toBeNull();
    expect(body.querySelector('script')).toBeNull();
    // Present as text, so the data is still shown — just inert.
    expect(body.textContent).toContain('<img src=x onerror=alert(1)>');
  });
});

describe('renderHist — channel filter', () => {
  const filtered = () => makeHarness({
    state: {
      stock: 100, hist: [
        { num: '1003', chan: 'Website', qty: 1, price: 20, date: '2026-07-20' },
        { num: '1002', chan: 'Direct', qty: 1, price: 20, date: '2026-07-19' },
        { num: '1001', chan: 'Website', qty: 1, price: 20, date: '2026-07-18' },
      ], ledger: [], stores: [],
    },
  });

  it('narrows the table to the selected channel', () => {
    const h = filtered();
    h.setChanFilter({ bookId: 'book-1', chan: 'Website' });
    h.renderHist();

    const r = rows();
    expect(r).toHaveLength(2);
    // The number cell also carries the inline edit affordance.
    expect(r.map(tr => cells(tr)[0].replace('✎', ''))).toEqual(['1003', '1001']);
  });

  it('shows a clearable chip with the match count while filtered', () => {
    const h = filtered();
    h.setChanFilter({ bookId: 'book-1', chan: 'Website' });
    h.renderHist();

    const bar = document.getElementById('hist-filter-bar');
    expect(bar.style.display).not.toBe('none');
    expect(bar.textContent).toContain('2 found');
    expect(bar.querySelector('button').getAttribute('onclick')).toBe('clearHistChanFilter()');
  });

  it('counts pending submissions in the filtered total, and shows them', () => {
    // The chip is a "did my filter find everything" check, so an awaiting-
    // approval sale on that channel has to be part of the count as well as the
    // table — otherwise the number disagrees with the rows underneath it.
    const h = makeHarness({
      state: {
        stock: 100, hist: [
          { num: '1003', chan: 'Website', qty: 1, price: 20, date: '2026-07-20' },
          { num: '1002', chan: 'Direct', qty: 1, price: 20, date: '2026-07-19' },
        ], ledger: [], stores: [],
      },
      submissions: {
        'book-1': {
          sales: {
            sub1: { data: JSON.stringify({ num: '9001', chan: 'Website', qty: 1, price: 20, date: '2026-07-21' }) },
          },
        },
      },
    });
    h.setChanFilter({ bookId: 'book-1', chan: 'Website' });
    h.renderHist();

    expect(rows()).toHaveLength(2);   // one settled + one pending
    expect(document.getElementById('hist-filter-bar').textContent).toContain('2 found');
  });

  it('excludes pending submissions on other channels from the filter', () => {
    const h = makeHarness({
      state: {
        stock: 100,
        hist: [{ num: '1003', chan: 'Website', qty: 1, price: 20, date: '2026-07-20' }],
        ledger: [], stores: [],
      },
      submissions: {
        'book-1': {
          sales: {
            sub1: { data: JSON.stringify({ num: '9001', chan: 'Direct', qty: 1, price: 20, date: '2026-07-21' }) },
          },
        },
      },
    });
    h.setChanFilter({ bookId: 'book-1', chan: 'Website' });
    h.renderHist();

    expect(rows()).toHaveLength(1);
    expect(document.getElementById('hist-filter-bar').textContent).toContain('1 found');
  });

  it('hides the chip and the reconciliation panel appropriately', () => {
    const h = filtered();
    h.renderHist();   // unfiltered
    expect(document.getElementById('hist-filter-bar').style.display).toBe('none');
    expect(document.getElementById('hist-recon').style.display).not.toBe('none');

    h.setChanFilter({ bookId: 'book-1', chan: 'Website' });
    h.renderHist();
    // Reconciliation totals describe the whole book, so they'd be misleading
    // next to a filtered subset.
    expect(document.getElementById('hist-recon').style.display).toBe('none');
  });

  it('drops a filter belonging to a different book', () => {
    const h = filtered();
    h.setChanFilter({ bookId: 'some-other-book', chan: 'Website' });
    h.renderHist();
    expect(rows()).toHaveLength(3);
    expect(document.getElementById('hist-filter-bar').style.display).toBe('none');
  });

  it('reports no matches for a channel with no orders', () => {
    const h = filtered();
    h.setChanFilter({ bookId: 'book-1', chan: 'Consignment' });
    h.renderHist();
    expect(rows()).toHaveLength(0);
    expect(document.getElementById('hist-body').textContent).toContain('No Consignment orders');
  });
});

describe('renderHist — reconciliation panel', () => {
  it('reports printed, on-hand and sell-through', () => {
    const h = makeHarness({
      state: {
        stock: 75,
        hist: [{ num: '1001', chan: 'Direct', qty: 25, price: 20, date: '2026-07-20' }],
        ledger: [], stores: [],
      },
    });
    h.renderHist();

    const recon = document.getElementById('hist-recon');
    expect(recon.textContent).toContain('Total Printed');
    expect(recon.querySelector('.hist-kpi-val').textContent).toBe('100');
    expect(recon.textContent).toContain('25.0% sell-through rate');
  });

  it('renders the progress bar within 0-100% even if figures disagree', () => {
    // Guards a real hazard: sell-through is derived from two counts that can
    // drift apart, and an out-of-range width would paint outside the track.
    const h = makeHarness({
      state: {
        stock: 5,
        hist: [{ num: '1001', chan: 'Direct', qty: 500, price: 20, date: '2026-07-20' }],
        ledger: [], stores: [],
      },
    });
    h.renderHist();

    const fill = document.querySelector('.hist-progress-bar-fill');
    const width = parseFloat(fill.style.width);
    expect(width).toBeGreaterThanOrEqual(0);
    expect(width).toBeLessThanOrEqual(100);
  });
});

describe('renderHist — pending author submissions', () => {
  const submissions = {
    'book-1': {
      sales: {
        sub1: {
          data: JSON.stringify({ num: '9001', chan: 'Direct', qty: 1, price: 20, date: '2026-07-21', notes: 'from author' }),
        },
      },
    },
  };

  it('offers approve and reject to the publisher', () => {
    const h = makeHarness({
      state: { stock: 100, hist: [], ledger: [], stores: [] },
      submissions, isPublisher: true,
    });
    h.renderHist();

    const body = document.getElementById('hist-body');
    expect(body.textContent).toContain('Submitted');
    expect(body.querySelector('.appr-btn.approve').getAttribute('onclick'))
      .toBe("approveSubmission('sales', 'sub1')");
    expect(body.querySelector('.appr-btn.reject')).not.toBeNull();
  });

  it('shows an author only that it is awaiting the publisher', () => {
    const h = makeHarness({
      state: { stock: 100, hist: [], ledger: [], stores: [] },
      submissions, isPublisher: false,
    });
    h.renderHist();

    const body = document.getElementById('hist-body');
    expect(body.textContent).toContain('Awaiting Publisher');
    expect(body.querySelector('.appr-btn')).toBeNull();
  });

  it('leaves the stock-after column unknown for an unapproved sale', () => {
    const h = makeHarness({
      state: { stock: 100, hist: [], ledger: [], stores: [] },
      submissions, isPublisher: true,
    });
    h.renderHist();
    // It hasn't moved stock yet, so showing a number would be a lie.
    expect(cells(rows()[0])[5]).toBe('?');
  });
});

describe('renderHist — pagination', () => {
  const many = (n) => ({
    stock: 100 - n,
    hist: Array.from({ length: n }, (_, i) => ({
      num: String(2000 + i), chan: 'Direct', qty: 1, price: 10,
      date: `2026-07-${String(1 + (i % 28)).padStart(2, '0')}`,
    })),
    ledger: [], stores: [],
  });

  it('caps the first page and offers to show more', () => {
    const h = makeHarness({ state: many(120) });
    h.renderHist();

    expect(rows()).toHaveLength(h.HIST_PAGE);
    const more = document.querySelector('.hist-more-row');
    expect(more).not.toBeNull();
    expect(more.textContent).toContain(`showing ${h.HIST_PAGE} of 120`);
    expect(more.textContent).toContain('Show all 120');
  });

  it('renders everything once the limit is raised', () => {
    // Mirrors how "Show all" actually works: the first render establishes the
    // page signature, the button raises the limit, and the re-render honours
    // it. Raising the limit before any render would be undone — renderHist
    // resets it whenever the book or channel filter changes, which is the
    // point of the signature.
    const h = makeHarness({ state: many(120) });
    h.renderHist();
    h.setLimit(Number.MAX_SAFE_INTEGER);
    h.renderHist();

    expect(rows()).toHaveLength(120);
    expect(document.querySelector('.hist-more-row')).toBeNull();
  });

  it('resets to the first page when the channel filter changes', () => {
    const h = makeHarness({ state: many(120) });
    h.renderHist();
    h.setLimit(Number.MAX_SAFE_INTEGER);
    h.renderHist();
    expect(rows()).toHaveLength(120);

    // Switching filters is a new page signature, so paging starts over rather
    // than dumping every row of the newly filtered set.
    h.setChanFilter({ bookId: 'book-1', chan: 'Direct' });
    h.renderHist();
    expect(rows()).toHaveLength(h.HIST_PAGE);
  });

  it('does not offer more when everything already fits', () => {
    const h = makeHarness({ state: many(3) });
    h.renderHist();
    expect(rows()).toHaveLength(3);
    expect(document.querySelector('.hist-more-row')).toBeNull();
  });
});
