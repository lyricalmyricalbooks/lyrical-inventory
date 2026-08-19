import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  SCROLL_STATE_ATTR,
  SCROLL_EDGE_SELECTOR,
  tableScrollEdge,
  syncTableScrollEdges,
  initTableScrollEdges,
} from '../src/lib/table-scroll.js';

const ROOT = join(import.meta.dirname, '..');

/**
 * A stand-in wrapper with controllable scroll metrics. jsdom never lays
 * anything out, so scrollWidth/clientWidth/scrollLeft are defined here.
 */
function fakeWrap({ scrollWidth = 900, clientWidth = 375, scrollLeft = 0 } = {}) {
  const el = document.createElement('div');
  el.className = 'tbl-wrap sys-sticky-col';
  Object.defineProperty(el, 'scrollWidth', { value: scrollWidth, configurable: true });
  Object.defineProperty(el, 'clientWidth', { value: clientWidth, configurable: true });
  Object.defineProperty(el, 'scrollLeft', { value: scrollLeft, writable: true, configurable: true });
  return el;
}

/** A window stub reporting the given overflow-x for every element passed in. */
function fakeView(overflowX = 'auto', extras = {}) {
  return {
    getComputedStyle: () => ({ overflowX }),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    ...extras,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('tableScrollEdge', () => {
  it('reports where the reader is in the overflow', () => {
    const view = fakeView('auto');
    expect(tableScrollEdge(fakeWrap({ scrollLeft: 0 }), view)).toBe('start');
    expect(tableScrollEdge(fakeWrap({ scrollLeft: 200 }), view)).toBe('middle');
    expect(tableScrollEdge(fakeWrap({ scrollLeft: 525 }), view)).toBe('end');
  });

  it('says nothing to scroll when the table already fits', () => {
    const el = fakeWrap({ scrollWidth: 380, clientWidth: 380 });
    expect(tableScrollEdge(el, fakeView('auto'))).toBe('none');
  });

  // The desktop layout hides the wrapper's overflow. Advertising columns the
  // reader has no way to reach would be worse than showing nothing.
  it('says nothing to scroll when the overflow is clipped rather than scrollable', () => {
    const el = fakeWrap({ scrollWidth: 1400, clientWidth: 900 });
    expect(tableScrollEdge(el, fakeView('hidden'))).toBe('none');
    expect(tableScrollEdge(el, fakeView('clip'))).toBe('none');
    expect(tableScrollEdge(el, fakeView('visible'))).toBe('none');
    expect(tableScrollEdge(el, fakeView('auto'))).toBe('start');
  });

  it('tolerates the fractional metrics a zoomed or high-DPI display reports', () => {
    const view = fakeView('scroll');
    expect(tableScrollEdge(fakeWrap({ scrollLeft: 0.4 }), view)).toBe('start');
    expect(tableScrollEdge(fakeWrap({ scrollLeft: 524.6 }), view)).toBe('end');
  });

  // A right-to-left document runs scrollLeft negative; the edges still have to
  // read as edges rather than pinning to one state forever.
  it('reads the edges the same way when scrollLeft runs negative', () => {
    const view = fakeView('auto');
    expect(tableScrollEdge(fakeWrap({ scrollLeft: -525 }), view)).toBe('end');
    expect(tableScrollEdge(fakeWrap({ scrollLeft: -200 }), view)).toBe('middle');
  });

  it('degrades to none rather than throwing on nothing measurable', () => {
    expect(tableScrollEdge(null, fakeView('auto'))).toBe('none');
    const broken = fakeWrap();
    Object.defineProperty(broken, 'scrollWidth', { value: NaN, configurable: true });
    expect(tableScrollEdge(broken, fakeView('auto'))).toBe('none');
    const throwing = { getComputedStyle: () => { throw new Error('detached'); } };
    expect(tableScrollEdge(fakeWrap({ scrollLeft: 200 }), throwing)).toBe('middle');
  });
});

describe('syncTableScrollEdges', () => {
  it('stamps the measured state onto the wrapper', () => {
    const el = fakeWrap({ scrollLeft: 200 });
    expect(syncTableScrollEdges(el, fakeView('auto'))).toBe('middle');
    expect(el.getAttribute(SCROLL_STATE_ATTR)).toBe('middle');
  });

  it('writes the none state explicitly so the CSS can opt back out', () => {
    const el = fakeWrap({ scrollWidth: 300, clientWidth: 300 });
    el.setAttribute(SCROLL_STATE_ATTR, 'middle');
    syncTableScrollEdges(el, fakeView('auto'));
    expect(el.getAttribute(SCROLL_STATE_ATTR)).toBe('none');
  });
});

describe('initTableScrollEdges', () => {
  let root;
  beforeEach(() => {
    root = document.createElement('div');
    root.addEventListener = vi.fn(root.addEventListener.bind(root));
    root.removeEventListener = vi.fn(root.removeEventListener.bind(root));
  });

  it('publishes on start, follows the swipe, and tears down cleanly', () => {
    const el = fakeWrap({ scrollLeft: 0 });
    el.appendChild(document.createElement('table'));
    root.appendChild(el);
    const observe = vi.fn();
    const disconnect = vi.fn();
    const RO = { last: null };
    const view = fakeView('auto', {
      ResizeObserver: function Fake(cb) { RO.last = { cb }; this.observe = observe; this.disconnect = disconnect; },
    });

    const stop = initTableScrollEdges({ root, view });
    expect(el.getAttribute(SCROLL_STATE_ATTR)).toBe('start');
    // Both the wrapper and its table are watched: rows arriving change the
    // overflow without firing a scroll event.
    expect(observe).toHaveBeenCalledTimes(2);
    expect(view.addEventListener).toHaveBeenCalledWith('resize', expect.any(Function));
    expect(root.addEventListener).toHaveBeenCalledWith('scroll', expect.any(Function), true);

    el.scrollLeft = 300;
    el.dispatchEvent(new Event('scroll'));
    expect(el.getAttribute(SCROLL_STATE_ATTR)).toBe('middle');

    // Rows land; the observer re-measures without any scrolling.
    el.scrollLeft = 525;
    RO.last.cb();
    expect(el.getAttribute(SCROLL_STATE_ATTR)).toBe('end');

    stop();
    expect(disconnect).toHaveBeenCalled();
    expect(view.removeEventListener).toHaveBeenCalledWith('resize', expect.any(Function));
  });

  it('ignores scrolls from anything that is not an opted-in wrapper', () => {
    const other = document.createElement('div');
    root.appendChild(other);
    const stop = initTableScrollEdges({ root, view: fakeView('auto') });
    other.dispatchEvent(new Event('scroll'));
    expect(other.hasAttribute(SCROLL_STATE_ATTR)).toBe(false);
    expect(() => stop()).not.toThrow();
  });

  it('stays teardown-safe without ResizeObserver or a broken one', () => {
    const el = fakeWrap();
    root.appendChild(el);
    expect(() => initTableScrollEdges({ root, view: fakeView('auto') })()).not.toThrow();

    const view = fakeView('auto', { ResizeObserver: function Broken() { throw new Error('nope'); } });
    expect(() => initTableScrollEdges({ root, view })).not.toThrow();
    expect(el.getAttribute(SCROLL_STATE_ATTR)).toBe('start');
  });
});

describe('pinned ledger column wiring', () => {
  const html = readFileSync(join(ROOT, 'index.html'), 'utf8');
  const css = readFileSync(join(ROOT, 'src/styles/system.css'), 'utf8');
  const dark = readFileSync(join(ROOT, 'src/styles/theme-dark.css'), 'utf8');
  const main = readFileSync(join(ROOT, 'src/main.js'), 'utf8');

  it('marks the three long ledgers, and only those', () => {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const wraps = [...doc.querySelectorAll(SCROLL_EDGE_SELECTOR)];
    const bodies = wraps.map((w) => w.querySelector('tbody')?.id);
    expect(bodies.sort()).toEqual(['hist-body', 'ledger-body', 'tc-ledger-body']);
  });

  // A pinned column is only meaningful where the FIRST column is what tells you
  // which row you are on.
  it('pins a column that actually identifies the row', () => {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const heads = [...doc.querySelectorAll(SCROLL_EDGE_SELECTOR)]
      .map((w) => w.querySelector('thead th')?.textContent?.trim());
    expect(heads.sort()).toEqual(['Date', 'Date', 'Order #']);
  });

  it('is started at boot alongside the sticky header', () => {
    expect(main).toMatch(/import \{ initTableScrollEdges \} from '\.\/lib\/table-scroll\.js'/);
    expect(main).toMatch(/^initTableScrollEdges\(\);$/m);
  });

  it('only pins while the wrapper reports something left to scroll', () => {
    expect(css).toMatch(/\.tbl-wrap\.sys-sticky-col\[data-scroll\]:not\(\[data-scroll="none"\]\)[^{]*\{[^}]*position:\s*sticky/);
    expect(css).toMatch(/\.tbl-wrap\.sys-sticky-col\[data-scroll\]:not\(\[data-scroll="none"\]\)[^{]*\{[^}]*left:\s*0/);
  });

  // Full-width cells (empty states, "Show more", ledger totals) already span
  // the table — freezing one would freeze the whole row for nothing.
  it('leaves the full-width cells alone', () => {
    const pinned = css.match(/\.tbl-wrap\.sys-sticky-col\[data-scroll[^{]*tbody td:first-child[^{]*\{/g) || [];
    expect(pinned.length).toBeGreaterThan(0);
    for (const sel of pinned) expect(sel).toContain(':not([colspan])');
  });

  // The pinned cell must be opaque or the columns sliding under show through,
  // but it must still take hover / zebra / pending-row tints from the row.
  it('gives the pinned cell an opaque fill without stealing the row state', () => {
    expect(css).toMatch(/:where\(\.tbl-wrap\.sys-sticky-col \.tbl tbody td:first-child\)\s*\{[^}]*background-color:\s*inherit/);
    expect(css).toMatch(/\.tbl-wrap\.sys-sticky-col\[data-scroll\]:not\(\[data-scroll="none"\]\) \.tbl thead th:first-child\s*\{[^}]*background:\s*var\(--surface-inverse\)/);
  });

  it('tokenises the seam and themes it for dark mode', () => {
    expect(css).toMatch(/--elev-edge:/);
    expect(css).toMatch(/box-shadow:\s*inset 0 -1px 0 var\(--border-subtle\), var\(--elev-edge\)/);
    // Both dark blocks — the explicit choice and the follow-the-OS one.
    expect(dark.match(/--elev-edge:/g) || []).toHaveLength(2);
  });

  it('fades the right edge only while columns are still off-screen', () => {
    const fade = css.match(/@supports \(mask-image[^)]*\)[^{]*\{([\s\S]*?)\n\}/);
    expect(fade).toBeTruthy();
    expect(fade[1]).toContain('[data-scroll="start"]');
    expect(fade[1]).toContain('[data-scroll="middle"]');
    expect(fade[1]).not.toContain('[data-scroll="end"]');
  });
});
