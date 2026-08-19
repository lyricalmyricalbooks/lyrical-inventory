import { describe, it, expect, beforeEach } from 'vitest';
import { buildHarness } from './helpers/extract-decl.js';

// The Website-orders screen is where a Big Cartel sale becomes a stock
// movement, and the strip above the queue used to be three fixed captions
// (Source: Gmail / Channel: Big Cartel / Action: Inventory update) that read
// the same on every book on every day. It now carries the three facts the
// screen is actually asked for — how many orders are waiting, how many are
// already counted, and how stale the last Gmail read is — plus a scanning
// state, because a Gmail scan is three retries deep at worst and used to leave
// the pre-scan queue on screen for all of it.

function makeHarness() {
  return buildHarness({
    names: ['webScanRelativeTime', 'webScanStatTile', 'webScanStatusHtml', 'webOrdersSkeletonHtml'],
    deps: { escapeHtml: (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c])) },
    returns: '{ webScanRelativeTime, webScanStatTile, webScanStatusHtml, webOrdersSkeletonHtml }',
  });
}

const mount = (html) => {
  document.body.innerHTML = `<div class="web-orders-status">${html}</div>`;
  return document.body.firstElementChild;
};

beforeEach(() => { document.body.innerHTML = ''; });

describe('webScanRelativeTime', () => {
  const NOW = Date.parse('2026-08-19T12:00:00Z');
  const ago = (ms) => new Date(NOW - ms).toISOString();

  it('reads "Never" when Gmail has never been scanned', () => {
    // A blank tile would look like a zero. "Never" is the actual state.
    const h = makeHarness();
    expect(h.webScanRelativeTime(null, NOW)).toBe('Never');
    expect(h.webScanRelativeTime('', NOW)).toBe('Never');
    expect(h.webScanRelativeTime('not-a-date', NOW)).toBe('Never');
  });

  it('collapses anything under a minute to "Just now"', () => {
    expect(makeHarness().webScanRelativeTime(ago(30 * 1000), NOW)).toBe('Just now');
  });

  it('counts minutes, then hours, then days', () => {
    const h = makeHarness();
    expect(h.webScanRelativeTime(ago(12 * 60000), NOW)).toBe('12 min ago');
    expect(h.webScanRelativeTime(ago(60 * 60000), NOW)).toBe('1 hour ago');
    expect(h.webScanRelativeTime(ago(3 * 3600000), NOW)).toBe('3 hours ago');
    expect(h.webScanRelativeTime(ago(26 * 3600000), NOW)).toBe('1 day ago');
    expect(h.webScanRelativeTime(ago(3 * 86400000), NOW)).toBe('3 days ago');
  });

  it('falls back to a calendar date once the scan is over a week old', () => {
    // "9 days ago" stops being useful; the date is what you'd act on.
    const out = makeHarness().webScanRelativeTime(ago(9 * 86400000), NOW);
    expect(out).not.toContain('ago');
    expect(out).toMatch(/\d/);
  });

  it('treats a clock that drifted backwards as fresh, not negative', () => {
    // A device whose clock is a few minutes slow must not report "-4 min ago".
    expect(makeHarness().webScanRelativeTime(ago(-4 * 60000), NOW)).toBe('Just now');
  });
});

describe('webScanStatusHtml', () => {
  const NOW = Date.parse('2026-08-19T12:00:00Z');

  it('renders exactly three tiles built on the real .web-stat box', () => {
    // Reusing .web-stat is what keeps the surface, border and dark-theme
    // override applying unchanged.
    const el = mount(makeHarness().webScanStatusHtml({ now: NOW }));
    const tiles = el.querySelectorAll('.web-stat.web-stat-live');
    expect(tiles.length).toBe(3);
    tiles.forEach((t) => {
      expect(t.querySelector('.web-stat-label')).not.toBeNull();
      expect(t.querySelector('.web-stat-value')).not.toBeNull();
      expect(t.querySelector('.web-stat-sub')).not.toBeNull();
    });
  });

  it('reports the waiting and already-applied counts', () => {
    const el = mount(makeHarness().webScanStatusHtml({ newCount: 3, appliedCount: 8, now: NOW }));
    const values = [...el.querySelectorAll('.web-stat-value')].map((v) => v.textContent);
    expect(values[0]).toBe('3');
    expect(values[1]).toBe('8');
  });

  it('highlights the waiting tile only when something is actually waiting', () => {
    // A tile that is always gold carries no information. Gold has to mean
    // "there is work here".
    const h = makeHarness();
    const busy = mount(h.webScanStatusHtml({ newCount: 2, now: NOW }));
    expect(busy.querySelectorAll('.web-stat-live.is-ready').length).toBe(1);

    const clear = mount(h.webScanStatusHtml({ newCount: 0, now: NOW }));
    expect(clear.querySelectorAll('.web-stat-live.is-ready').length).toBe(0);
    expect(clear.querySelector('.web-stat-sub').textContent).toContain('Nothing waiting');
  });

  it('says "order" for one and "orders" for more than one', () => {
    const h = makeHarness();
    const one = mount(h.webScanStatusHtml({ newCount: 1, now: NOW }));
    expect(one.querySelector('.web-stat-sub').textContent).toContain('New order ');
    const many = mount(h.webScanStatusHtml({ newCount: 4, now: NOW }));
    expect(many.querySelector('.web-stat-sub').textContent).toContain('New orders ');
  });

  it('shows the last scan as elapsed time with the exact timestamp underneath', () => {
    const iso = new Date(NOW - 2 * 3600000).toISOString();
    const el = mount(makeHarness().webScanStatusHtml({ lastScan: iso, now: NOW }));
    const tile = el.querySelectorAll('.web-stat-live')[2];
    expect(tile.querySelector('.web-stat-value').textContent).toBe('2 hours ago');
    expect(tile.querySelector('.web-stat-sub').textContent).toBe(new Date(iso).toLocaleString());
  });

  it('tells a never-scanned publisher what to press', () => {
    const el = mount(makeHarness().webScanStatusHtml({ now: NOW }));
    const tile = el.querySelectorAll('.web-stat-live')[2];
    expect(tile.querySelector('.web-stat-value').textContent).toBe('Never');
    expect(tile.querySelector('.web-stat-sub').textContent).toContain('Scan Gmail');
  });

  it('coerces junk counts to a number rather than printing them', () => {
    // The counts come from a render, but a tile must never read "undefined".
    const el = mount(makeHarness().webScanStatusHtml({ newCount: undefined, appliedCount: null, now: NOW }));
    const values = [...el.querySelectorAll('.web-stat-value')].map((v) => v.textContent);
    expect(values[0]).toBe('0');
    expect(values[1]).toBe('0');
  });

  it('swaps to shimmer placeholders while a scan is running', () => {
    const el = mount(makeHarness().webScanStatusHtml({ scanning: true }));
    const tiles = el.querySelectorAll('.web-stat-live.is-scanning');
    expect(tiles.length).toBe(3);
    expect(el.querySelectorAll('.skeleton-line').length).toBe(9);
  });

  it('hides the shimmering boxes from a screen reader and announces the scan instead', () => {
    // Three columns of empty boxes are noise; "Scanning Gmail" is the status.
    const el = mount(makeHarness().webScanStatusHtml({ scanning: true }));
    el.querySelectorAll('.web-stat-live').forEach((t) => {
      expect(t.getAttribute('aria-hidden')).toBe('true');
    });
    const status = el.querySelector('[role="status"]');
    expect(status).not.toBeNull();
    expect(status.className).toBe('sr-only');
    expect(status.textContent).toContain('Scanning Gmail');
  });
});

describe('webScanStatTile', () => {
  it('escapes whatever it is handed', () => {
    const el = mount(makeHarness().webScanStatTile('<b>L</b>', '<i>V</i>', '<u>S</u>'));
    expect(el.querySelector('b')).toBeNull();
    expect(el.querySelector('.web-stat-value').textContent).toBe('<i>V</i>');
  });

  it('falls back to an em dash rather than rendering "undefined"', () => {
    const el = mount(makeHarness().webScanStatTile('Label', undefined, undefined));
    expect(el.querySelector('.web-stat-value').textContent).toBe('—');
    expect(el.querySelector('.web-stat-sub').textContent).toBe('');
  });
});

describe('webOrdersSkeletonHtml', () => {
  const render = (rows) => {
    document.body.innerHTML = `<div class="orders-list">${makeHarness().webOrdersSkeletonHtml(rows)}</div>`;
    return document.body.firstElementChild;
  };

  it('stands in with real order cards so the queue keeps its height', () => {
    const el = render();
    const cards = el.querySelectorAll('.order-card.is-skeleton');
    expect(cards.length).toBe(3);
    // Same two rows as a real card — that is what makes the height match.
    expect(cards[0].querySelector('.order-card-top')).not.toBeNull();
    expect(cards[0].querySelector('.order-card-bottom')).not.toBeNull();
  });

  it('honours a requested row count and never renders zero cards', () => {
    expect(render(1).querySelectorAll('.order-card').length).toBe(1);
    expect(render(0).querySelectorAll('.order-card').length).toBe(1);
  });

  it('announces the scan and hides the placeholder cards from a screen reader', () => {
    const el = render();
    const status = el.querySelector('[role="status"]');
    expect(status.className).toBe('sr-only');
    expect(status.textContent).toContain('Scanning Gmail');
    el.querySelectorAll('.order-card').forEach((c) => {
      expect(c.getAttribute('aria-hidden')).toBe('true');
    });
  });
});
