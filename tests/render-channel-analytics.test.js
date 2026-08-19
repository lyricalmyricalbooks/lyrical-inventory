import { describe, it, expect, beforeEach } from 'vitest';
import { buildHarness } from './helpers/extract-decl.js';
import { escapeHtml } from '../src/lib/html.js';
import { fmt } from '../src/lib/money.js';

// The combined "sales by channel" panel on the all-books overview.
//
// The redesign's whole premise is that the bar and the percentage beside it are
// the SAME number. The previous version drew each bar relative to the LEADER
// while labelling it with share of TOTAL, so the top channel's bar always ran
// the full width whatever its actual share — a reader glancing at the chart
// concluded one channel was everything.
//
// (The per-book table on the single-book dashboard is a different view: it uses
// channelMixRows, which exposes a separate leader-scaled `barPct` on purpose.
// See channel-mix.test.js — that decision is untouched here.)

function makeHarness({ data, cur = 'CA$' } = {}) {
  return buildHarness({
    names: ['CHANNEL_COLORS', '_CHAN_FALLBACK', 'channelColor', 'chanLabel', 'renderChannelAnalytics'],
    deps: {
      $: (id) => document.getElementById(id),
      escapeHtml,
      fmt,
      window: { _allChData: data, _allChCur: cur },
    },
    returns: '{ renderChannelAnalytics }',
  });
}

const mount = () => {
  document.body.innerHTML = '<div id="all-ch-analytics"></div>';
  return document.getElementById('all-ch-analytics');
};

const book = (over = {}) => ({
  id: 'b1', title: 'Bookmark Letters', cur: 'CA$', total: 300,
  channels: [{ chan: 'Website', rev: 300, txns: 3, units: 4, share: 100 }],
  bestChan: 'Website',
  ...over,
});

const data = (channelTotals, books) => ({
  'CA$': { channelTotals, books: books || [book()] },
});

const widths = () => [...document.querySelectorAll('.ch-row-fill')]
  .map(el => parseFloat(el.style.width));
const pcts = () => [...document.querySelectorAll('.ch-row:not(.ch-row-head):not(.ch-row-total) .ch-row-pct')]
  .map(el => el.textContent.trim());

beforeEach(() => { document.body.innerHTML = ''; });

describe('renderChannelAnalytics — bars carry share of total', () => {
  it('draws each bar at its share of combined revenue, not against the leader', () => {
    const h = makeHarness({
      data: data({
        Website: { txns: 3, units: 4, revenue: 750 },
        'Book fair': { txns: 1, units: 1, revenue: 250 },
      }),
    });
    mount();
    h.renderChannelAnalytics();

    // 750 of 1000 is 75% — under the old leader scale this was 100%.
    expect(widths()).toEqual([75, 25]);
  });

  it('makes the bar width and the percentage beside it the same number', () => {
    const h = makeHarness({
      data: data({
        Website: { txns: 3, units: 4, revenue: 440 },
        'In person': { txns: 2, units: 3, revenue: 280 },
        Consignment: { txns: 1, units: 2, revenue: 280 },
      }),
    });
    mount();
    h.renderChannelAnalytics();

    const w = widths();
    const p = pcts();
    expect(w).toHaveLength(3);
    w.forEach((width, i) => {
      expect(Math.round(width) + '%').toBe(p[i]);
    });
  });

  it('has the bars sum to the whole, so the chart accounts for every dollar', () => {
    const h = makeHarness({
      data: data({
        Website: { txns: 3, units: 4, revenue: 500 },
        'In person': { txns: 2, units: 3, revenue: 300 },
        Direct: { txns: 1, units: 1, revenue: 200 },
      }),
    });
    mount();
    h.renderChannelAnalytics();

    const sum = widths().reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(100, 6);
  });

  it('orders channels biggest earner first', () => {
    const h = makeHarness({
      data: data({
        Direct: { txns: 1, units: 1, revenue: 50 },
        Website: { txns: 3, units: 4, revenue: 500 },
        'In person': { txns: 2, units: 3, revenue: 200 },
      }),
    });
    mount();
    h.renderChannelAnalytics();

    const names = [...document.querySelectorAll('.ch-row:not(.ch-row-head):not(.ch-row-total) .ch-row-name span:last-child')]
      .map(el => el.textContent.trim());
    expect(names).toEqual(['Website', 'In person', 'Direct']);
  });

  it('draws an empty bar rather than a NaN width when nothing has sold', () => {
    // width:NaN% is ignored by the browser, leaving a bar at whatever the
    // previous render left — the opposite of "no sales".
    const h = makeHarness({
      data: data({ Website: { txns: 0, units: 0, revenue: 0 } }),
    });
    mount();
    h.renderChannelAnalytics();

    expect(widths()).toEqual([0]);
    expect(document.body.innerHTML).not.toContain('NaN');
  });
});

describe('renderChannelAnalytics — summary and totals', () => {
  it('states the combined revenue, transactions and units once each', () => {
    // The old panel printed the total in the hero AND again in a metric tile.
    const h = makeHarness({
      data: data({
        Website: { txns: 3, units: 4, revenue: 750 },
        'Book fair': { txns: 1, units: 2, revenue: 250 },
      }),
    });
    const host = mount();
    h.renderChannelAnalytics();

    expect(host.querySelector('.ch-summary-total').textContent).toContain('1,000.00');
    const stats = [...host.querySelectorAll('.ch-stat strong')].map(e => e.textContent.trim());
    expect(stats[0]).toBe('4');    // transactions
    expect(stats[1]).toBe('6');    // units
  });

  it('closes the table with a totals row that matches the summary', () => {
    const h = makeHarness({
      data: data({
        Website: { txns: 3, units: 4, revenue: 750 },
        'Book fair': { txns: 1, units: 2, revenue: 250 },
      }),
    });
    const host = mount();
    h.renderChannelAnalytics();

    const total = host.querySelector('.ch-row-total');
    expect(total).not.toBeNull();
    expect(total.querySelector('.ch-row-pct').textContent.trim()).toBe('100%');
    expect(total.querySelector('.ch-row-rev').textContent).toContain('1,000.00');
    expect(total.querySelector('.ch-row-vol').textContent).toContain('4 txn');
  });

  it('names the leading channel and its share', () => {
    const h = makeHarness({
      data: data({
        Website: { txns: 3, units: 4, revenue: 750 },
        'Book fair': { txns: 1, units: 2, revenue: 250 },
      }),
    });
    const host = mount();
    h.renderChannelAnalytics();

    expect(host.querySelector('.ch-insight-lead').textContent.trim()).toBe('Website leads at 75%');
  });

  it('counts only channels that actually earned', () => {
    const h = makeHarness({
      data: data({
        Website: { txns: 3, units: 4, revenue: 750 },
        Gratuity: { txns: 2, units: 2, revenue: 0 },
      }),
    });
    const host = mount();
    h.renderChannelAnalytics();

    expect(host.querySelector('.ch-insight-sub').textContent).toContain('1 active channel');
  });
});

describe('renderChannelAnalytics — currency and escaping', () => {
  it('shows no currency toggle when only one currency is in play', () => {
    const h = makeHarness({ data: data({ Website: { txns: 1, units: 1, revenue: 100 } }) });
    const host = mount();
    h.renderChannelAnalytics();
    expect(host.querySelector('.ch-cur-toggle')).toBeNull();
  });

  it('offers a toggle per currency once a second one appears', () => {
    const h = makeHarness({
      data: {
        'CA$': { channelTotals: { Website: { txns: 1, units: 1, revenue: 100 } }, books: [book()] },
        '€': { channelTotals: { Website: { txns: 1, units: 1, revenue: 80 } }, books: [book({ cur: '€' })] },
      },
    });
    const host = mount();
    h.renderChannelAnalytics();

    const btns = [...host.querySelectorAll('.ch-cur-btn')];
    expect(btns).toHaveLength(2);
    expect(btns[0].className).toContain('active');
  });

  it('escapes a channel name instead of injecting markup', () => {
    const h = makeHarness({
      data: data({ '<img src=x onerror=alert(1)>': { txns: 1, units: 1, revenue: 100 } }),
    });
    const host = mount();
    h.renderChannelAnalytics();

    expect(host.querySelector('img')).toBeNull();
    expect(host.textContent).toContain('<img src=x onerror=alert(1)>');
  });

  it('shows an empty state when no sales exist at all', () => {
    const h = makeHarness({ data: {} });
    const host = mount();
    h.renderChannelAnalytics();
    expect(host.textContent).toContain('No sales yet');
  });
});
