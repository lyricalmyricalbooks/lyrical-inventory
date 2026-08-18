import { describe, it, expect, beforeEach } from 'vitest';
import { buildHarness } from './helpers/extract-decl.js';
import { escapeHtml } from '../src/lib/html.js';

// The stock and break-even bars on the all-books overview — the first screen
// the publisher sees on opening the app. A bar that renders past its trough, or
// with a NaN width, misreports inventory on the screen most glanced at.

function makeHarness() {
  return buildHarness({
    names: ['bookProgressBarHtml'],
    deps: { escapeHtml },
    returns: '{ bookProgressBarHtml }',
  });
}

function mount(html) {
  document.body.innerHTML = `<div class="book-progress-wrapper">${html}</div>`;
  return {
    track: document.querySelector('.bar-track'),
    fill: document.querySelector('.bar-fill'),
  };
}

beforeEach(() => { document.body.innerHTML = ''; });

describe('bookProgressBarHtml', () => {
  it('sets the fill width to the percentage it was given', () => {
    const h = makeHarness();
    const { fill } = mount(h.bookProgressBarHtml({ pct: 71 }));
    expect(fill.style.width).toBe('71%');
  });

  it('clamps a percentage above 100 so the fill cannot overrun its trough', () => {
    // Stock recorded above the print run (a correction, or a reprint not yet
    // logged) would otherwise paint the bar past its own container.
    const h = makeHarness();
    const { fill, track } = mount(h.bookProgressBarHtml({ pct: 140 }));
    expect(fill.style.width).toBe('100%');
    expect(track.getAttribute('aria-valuenow')).toBe('100');
  });

  it('clamps a negative percentage to zero', () => {
    const h = makeHarness();
    const { fill } = mount(h.bookProgressBarHtml({ pct: -12 }));
    expect(fill.style.width).toBe('0%');
  });

  it('falls back to zero rather than rendering a NaN width', () => {
    // A book with no print run recorded divides by zero upstream. "width:NaN%"
    // is ignored by the browser, leaving a full-looking bar — the opposite of
    // the truth.
    const h = makeHarness();
    for (const bad of [NaN, undefined, null, 'lots', Infinity]) {
      const { fill, track } = mount(h.bookProgressBarHtml({ pct: bad }));
      expect(fill.style.width).toBe('0%');
      expect(track.getAttribute('aria-valuenow')).toBe('0');
    }
  });

  it('announces itself to a screen reader as a progress bar with a real value', () => {
    // The headline figure on the app's first screen was previously a bare div
    // with a title on its wrapper — nothing a screen reader would report.
    const h = makeHarness();
    const { track } = mount(h.bookProgressBarHtml({
      pct: 71, label: 'Stock on hand for Bookmark Letters',
      valueText: '212 of 300 copies on hand',
    }));

    expect(track.getAttribute('role')).toBe('progressbar');
    expect(track.getAttribute('aria-valuemin')).toBe('0');
    expect(track.getAttribute('aria-valuemax')).toBe('100');
    expect(track.getAttribute('aria-valuenow')).toBe('71');
    expect(track.getAttribute('aria-label')).toBe('Stock on hand for Bookmark Letters');
    // The raw percentage is not what a publisher wants read aloud — the counts are.
    expect(track.getAttribute('aria-valuetext')).toBe('212 of 300 copies on hand');
  });

  it('rounds the announced value while keeping the drawn width exact', () => {
    const h = makeHarness();
    const { track, fill } = mount(h.bookProgressBarHtml({ pct: 71.6 }));
    expect(track.getAttribute('aria-valuenow')).toBe('72');
    expect(fill.style.width).toBe('71.6%');
  });

  it('carries a low-stock tone onto the fill', () => {
    // Low stock already turns the on-hand figure red; the bar matches so a book
    // about to run out reads as such from the bar alone.
    const h = makeHarness();
    expect(mount(h.bookProgressBarHtml({ pct: 6, tone: 'danger' })).fill.className)
      .toContain('danger');
    expect(mount(h.bookProgressBarHtml({ pct: 40, tone: 'warn' })).fill.className)
      .toContain('warn');
    expect(mount(h.bookProgressBarHtml({ pct: 100, tone: 'done' })).fill.className)
      .toContain('done');
  });

  it('leaves the fill on its healthy default when no tone is given', () => {
    const h = makeHarness();
    const { fill } = mount(h.bookProgressBarHtml({ pct: 80 }));
    expect(fill.className.trim()).toBe('bar-fill');
  });

  it('escapes a book title in the label instead of injecting markup', () => {
    const h = makeHarness();
    const { track } = mount(h.bookProgressBarHtml({
      pct: 50,
      label: 'Stock on hand for <img src=x onerror=alert(1)>',
      valueText: '<script>alert(2)</script>',
    }));

    expect(document.querySelector('img')).toBeNull();
    expect(document.querySelector('script')).toBeNull();
    expect(track.getAttribute('aria-label')).toContain('<img src=x onerror=alert(1)>');
  });

  it('renders without a label or value text rather than printing undefined', () => {
    const h = makeHarness();
    const { track } = mount(h.bookProgressBarHtml({ pct: 30 }));
    expect(track.getAttribute('aria-label')).toBe('');
    expect(track.outerHTML).not.toContain('undefined');
  });
});
