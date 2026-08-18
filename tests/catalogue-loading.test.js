import { describe, it, expect, beforeEach } from 'vitest';
import { buildHarness } from './helpers/extract-decl.js';

// The all-books overview is the landing screen and is visible from first paint,
// but it is only populated once every book has come back from Firestore. What
// fills the gap matters: on a cold PWA start a blank page is indistinguishable
// from an app that has lost the publisher's catalogue.

function makeHarness() {
  return buildHarness({
    names: ['catalogueSkeletonHtml', 'catalogueEmptyHtml', 'showCatalogueSkeleton'],
    deps: { $: (id) => document.getElementById(id) },
    returns: '{ catalogueSkeletonHtml, catalogueEmptyHtml, showCatalogueSkeleton }',
  });
}

const mountList = () => {
  document.body.innerHTML = '<div id="all-books-list"></div>';
  return document.getElementById('all-books-list');
};

beforeEach(() => { document.body.innerHTML = ''; });

describe('catalogueSkeletonHtml', () => {
  const render = (h, rows) => {
    const el = mountList();
    el.innerHTML = h.catalogueSkeletonHtml(rows);
    return el;
  };

  it('renders placeholder strips built on the real book-strip box', () => {
    // Reusing .book-strip is what keeps the padding, rail width and row height
    // identical, so the page does not jump when the real books land.
    const el = render(makeHarness());
    const strips = el.querySelectorAll('.book-strip.is-skeleton');
    expect(strips.length).toBe(3);
    expect(strips[0].querySelector('.book-strip-kpis')).not.toBeNull();
  });

  it('gives each placeholder the same four KPI tiles as a real strip', () => {
    const el = render(makeHarness());
    expect(el.querySelector('.book-strip-kpis').querySelectorAll('.bsk').length).toBe(4);
  });

  it('announces "loading" to a screen reader and hides the decorative boxes', () => {
    // A screen reader should hear the status, not four columns of empty boxes.
    const el = render(makeHarness());
    const status = el.querySelector('[role="status"]');

    expect(status).not.toBeNull();
    expect(status.getAttribute('aria-live')).toBe('polite');
    expect(status.textContent).toContain('Loading');
    expect(status.className).toBe('sr-only');
    el.querySelectorAll('.book-strip.is-skeleton').forEach(strip => {
      expect(strip.getAttribute('aria-hidden')).toBe('true');
    });
  });

  it('honours a requested row count', () => {
    expect(render(makeHarness(), 1).querySelectorAll('.book-strip').length).toBe(1);
    expect(render(makeHarness(), 5).querySelectorAll('.book-strip').length).toBe(5);
  });

  it('clamps an absurd or malformed row count instead of flooding the page', () => {
    // Nothing should be able to ask this for 10,000 placeholder rows.
    const h = makeHarness();
    expect(render(h, 999).querySelectorAll('.book-strip').length).toBe(6);
    expect(render(h, 0).querySelectorAll('.book-strip').length).toBe(1);
    expect(render(h, -4).querySelectorAll('.book-strip').length).toBe(1);
    expect(render(h, NaN).querySelectorAll('.book-strip').length).toBe(3);
    expect(render(h, 'lots').querySelectorAll('.book-strip').length).toBe(3);
  });

  it('renders nothing clickable — there is no book behind a placeholder', () => {
    const el = render(makeHarness());
    expect(el.querySelector('button')).toBeNull();
    expect(el.querySelector('[onclick]')).toBeNull();
  });
});

describe('catalogueEmptyHtml', () => {
  it('explains what the screen is for and offers a way to add a book', () => {
    // Distinct from the skeleton: that one says "wait", this says "there is
    // nothing here, and here is what to do about it".
    const el = mountList();
    el.innerHTML = makeHarness().catalogueEmptyHtml();

    expect(el.querySelector('.empty-state.sys-empty')).not.toBeNull();
    expect(el.querySelector('.e-icon')).not.toBeNull();
    expect(el.textContent).toContain('No books in your catalogue yet');
    expect(el.querySelector('.sys-empty-actions .btn')).not.toBeNull();
  });

  it('is not mistaken for the loading state', () => {
    const el = mountList();
    el.innerHTML = makeHarness().catalogueEmptyHtml();
    expect(el.querySelector('.skeleton-line')).toBeNull();
    expect(el.querySelector('.book-strip')).toBeNull();
  });
});

describe('showCatalogueSkeleton', () => {
  it('paints placeholders into the empty list', () => {
    const h = makeHarness();
    const el = mountList();
    h.showCatalogueSkeleton();
    expect(el.querySelectorAll('.book-strip.is-skeleton').length).toBe(3);
  });

  it('refuses to paint over real books once they have loaded', () => {
    // A later boot step calling this again must not wipe the catalogue the
    // publisher is already looking at.
    const h = makeHarness();
    const el = mountList();
    el.dataset.loaded = '1';
    el.innerHTML = '<div class="book-strip">Real book</div>';

    h.showCatalogueSkeleton();

    expect(el.textContent).toContain('Real book');
    expect(el.querySelector('.is-skeleton')).toBeNull();
  });

  it('does nothing when the list is not on the page', () => {
    // Author mode hides this panel entirely, and boot still runs.
    const h = makeHarness();
    document.body.innerHTML = '';
    expect(() => h.showCatalogueSkeleton()).not.toThrow();
  });
});
