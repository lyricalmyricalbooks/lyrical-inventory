import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  STICKY_TOP_PROP,
  applyStickyOffset,
  initStickyOffset,
  stickyChromeHeight,
} from '../src/lib/sticky-header.js';

const ROOT = join(import.meta.dirname, '..');

/** Builds a stand-in header whose computed position and height are controlled. */
function fakeHeader({ position = 'sticky', height = 64 } = {}) {
  const el = document.createElement('div');
  el.className = 'app-header';
  el.getBoundingClientRect = () => ({ height, width: 800, top: 0, left: 0, bottom: height, right: 800 });
  return { el, position };
}

/** A window stub reporting the given position for every element passed in. */
function fakeView(position, extras = {}) {
  return {
    getComputedStyle: () => ({ position }),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    ...extras,
  };
}

let target;
beforeEach(() => {
  target = document.createElement('div');
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe('stickyChromeHeight', () => {
  it('measures an element that is actually pinned to the top', () => {
    const { el } = fakeHeader({ height: 71.4 });
    expect(stickyChromeHeight(el, fakeView('sticky'))).toBe(71);
    expect(stickyChromeHeight(el, fakeView('fixed'))).toBe(71);
  });

  it('contributes no offset for chrome that scrolls away with the page', () => {
    const { el } = fakeHeader();
    expect(stickyChromeHeight(el, fakeView('static'))).toBe(0);
    expect(stickyChromeHeight(el, fakeView('relative'))).toBe(0);
  });

  it('returns 0 for a missing element, an unmeasurable one, or a zero-height one', () => {
    expect(stickyChromeHeight(null, fakeView('sticky'))).toBe(0);
    expect(stickyChromeHeight({}, fakeView('sticky'))).toBe(0);
    const { el } = fakeHeader({ height: 0 });
    expect(stickyChromeHeight(el, fakeView('sticky'))).toBe(0);
  });

  it('survives a view that cannot compute style at all', () => {
    const { el } = fakeHeader();
    expect(stickyChromeHeight(el, undefined)).toBe(0);
    expect(stickyChromeHeight(el, { getComputedStyle() { throw new Error('detached'); } })).toBe(0);
  });
});

describe('applyStickyOffset', () => {
  it('writes a px value onto the target', () => {
    expect(applyStickyOffset(64, target)).toBe(64);
    expect(target.style.getPropertyValue(STICKY_TOP_PROP)).toBe('64px');
  });

  it('clamps nonsense to 0 rather than emitting an invalid length', () => {
    for (const bad of [-40, NaN, undefined, null, 'tall']) {
      expect(applyStickyOffset(bad, target)).toBe(0);
      expect(target.style.getPropertyValue(STICKY_TOP_PROP)).toBe('0px');
    }
  });

  it('does not throw when there is nothing to write to', () => {
    expect(applyStickyOffset(20, null)).toBe(20);
  });
});

describe('initStickyOffset', () => {
  it('publishes the header height immediately and observes it for changes', () => {
    const { el } = fakeHeader({ height: 88 });
    const observe = vi.fn();
    const disconnect = vi.fn();
    class RO {
      constructor(cb) { this.cb = cb; RO.last = this; }
      observe(node) { observe(node); }
      disconnect() { disconnect(); }
    }
    const view = fakeView('sticky', { ResizeObserver: RO });

    const stop = initStickyOffset({ header: el, target, view });
    expect(target.style.getPropertyValue(STICKY_TOP_PROP)).toBe('88px');
    expect(observe).toHaveBeenCalledWith(el);
    expect(view.addEventListener).toHaveBeenCalledWith('resize', expect.any(Function));

    // The header wraps to a second row — the offset must follow it.
    el.getBoundingClientRect = () => ({ height: 122 });
    RO.last.cb();
    expect(target.style.getPropertyValue(STICKY_TOP_PROP)).toBe('122px');

    stop();
    expect(disconnect).toHaveBeenCalled();
    expect(view.removeEventListener).toHaveBeenCalledWith('resize', expect.any(Function));
  });

  it('falls back to 0px with no header, so tables render exactly as before', () => {
    const stop = initStickyOffset({ header: null, target, view: fakeView('sticky') });
    expect(target.style.getPropertyValue(STICKY_TOP_PROP)).toBe('0px');
    expect(() => stop()).not.toThrow();
  });

  it('still publishes and stays teardown-safe without ResizeObserver', () => {
    const { el } = fakeHeader({ height: 60 });
    const view = fakeView('sticky');
    const stop = initStickyOffset({ header: el, target, view });
    expect(target.style.getPropertyValue(STICKY_TOP_PROP)).toBe('60px');
    expect(() => stop()).not.toThrow();
  });

  it('does not blow up when the ResizeObserver constructor throws', () => {
    const { el } = fakeHeader({ height: 60 });
    const view = fakeView('sticky', { ResizeObserver: function Broken() { throw new Error('nope'); } });
    expect(() => initStickyOffset({ header: el, target, view })).not.toThrow();
    expect(target.style.getPropertyValue(STICKY_TOP_PROP)).toBe('60px');
  });
});

describe('sticky ledger header wiring', () => {
  const html = readFileSync(join(ROOT, 'index.html'), 'utf8');
  const css = readFileSync(join(ROOT, 'src/styles/system.css'), 'utf8');

  it('marks the three page-scrolling ledgers, and only those', () => {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const wraps = [...doc.querySelectorAll('.tbl-wrap.sys-sticky-head')];
    const bodies = wraps.map((w) => w.querySelector('tbody')?.id);
    expect(bodies.sort()).toEqual(['hist-body', 'ledger-body', 'tc-ledger-body']);
  });

  it('never marks a wrapper that is already its own scroll container', () => {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    for (const wrap of doc.querySelectorAll('.tbl-wrap.sys-sticky-head')) {
      // An inline max-height/overflow would make `top` resolve against the
      // wrapper rather than the page, pushing the header down inside the panel.
      expect(wrap.getAttribute('style') || '').not.toMatch(/overflow|max-height/);
    }
  });

  it('drops the wrapper out of being a scroll container so sticky can resolve', () => {
    expect(css).toMatch(/\.tbl-wrap\.sys-sticky-head\s*\{[^}]*overflow:\s*clip/);
  });

  it('gives the pinned cells their own background and a tokenised layer', () => {
    const rule = css.match(/\.tbl-wrap\.sys-sticky-head \.tbl thead th\s*\{([^}]*)\}/);
    expect(rule).toBeTruthy();
    expect(rule[1]).toMatch(/position:\s*sticky/);
    expect(rule[1]).toMatch(/top:\s*var\(--sticky-top, 0px\)/);
    expect(rule[1]).toMatch(/background:\s*var\(--surface-inverse\)/);
    expect(rule[1]).toMatch(/z-index:\s*var\(--z-raised\)/);
  });

  it('hands the wrapper back its sideways scroll on phone widths', () => {
    expect(css).toMatch(/@media \(max-width: 768px\)\s*\{\s*\.tbl-wrap\.sys-sticky-head\s*\{[^}]*overflow-x:\s*auto/);
  });
});
