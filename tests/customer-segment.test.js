import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  describeCustomerFilters,
  joinFilterLabels,
  SEGMENT_CHANNEL_LABELS,
} from '../src/lib/customer-segment.js';

// The Customers tab carries five independent filters and three buttons that act
// on whatever survives them — Copy segment, Export segment, Email segment.
// Nothing on the screen used to say which filters were on, so a book filter left
// over from a previous session could quietly turn "email my mailing list" into
// "email eleven people", with no way to notice until after it had gone out.
// These tests hold the plain-language description, the way out, and the
// escaping in place.

const html = fs.readFileSync(path.join(process.cwd(), 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(process.cwd(), 'src/style.css'), 'utf8');
const main = fs.readFileSync(path.join(process.cwd(), 'src/main.js'), 'utf8');

const ids = (entries) => entries.map(e => e.id);
const labels = (entries) => entries.map(e => e.label);

describe('describeCustomerFilters', () => {
  it('says nothing when nothing is filtered', () => {
    // The bar has to stay invisible in the ordinary case. A permanent
    // "no filters applied" strip is the kind of noise people learn to skip,
    // and then miss the one time it matters.
    expect(describeCustomerFilters()).toEqual([]);
    expect(describeCustomerFilters({})).toEqual([]);
    expect(describeCustomerFilters({ search: '   ', bookId: '', channel: '', spend: '', orders: '' })).toEqual([]);
  });

  it('names each filter the way the owner would say it out loud', () => {
    const out = describeCustomerFilters({
      search: 'ashby',
      bookId: 'b1',
      channel: 'Stripe',
      spend: '100',
      orders: 'repeat',
    }, { bookTitle: () => 'Small Hours' });

    expect(ids(out)).toEqual(['search', 'book', 'channel', 'spend', 'orders']);
    expect(labels(out)).toEqual([
      'Search “ashby”',
      'Book: Small Hours',
      'Channel: Stripe (direct card)',
      'Spent over $100',
      'Repeat buyers (2+ orders)',
    ]);
  });

  it('lists filters in the order the controls appear on screen', () => {
    // The chips sit directly under the filter panel, so they have to read
    // left-to-right in the same order or they stop being scannable.
    const out = describeCustomerFilters({ orders: 'single', channel: 'Website', search: 'x' });
    expect(ids(out)).toEqual(['search', 'channel', 'orders']);
  });

  it('falls back to the book id when the book has since been deleted', () => {
    // The filter still holds an id nothing resolves. Rendering "Book: undefined"
    // would leave an invisible filter the owner cannot see to remove.
    const out = describeCustomerFilters({ bookId: 'gone-2019' }, { bookTitle: () => '' });
    expect(out).toEqual([{ id: 'book', label: 'Book: gone-2019' }]);

    const noResolver = describeCustomerFilters({ bookId: 'gone-2019' });
    expect(noResolver).toEqual([{ id: 'book', label: 'Book: gone-2019' }]);
  });

  it('shows an unknown channel value rather than dropping it', () => {
    const out = describeCustomerFilters({ channel: 'Kickstarter' });
    expect(out).toEqual([{ id: 'channel', label: 'Channel: Kickstarter' }]);
  });

  it('ignores a spend filter that is not a usable amount', () => {
    // "Any amount" is the empty value; zero and junk mean the same thing and
    // narrow nothing, so a chip for them would be a filter that cannot be removed.
    expect(describeCustomerFilters({ spend: '0' })).toEqual([]);
    expect(describeCustomerFilters({ spend: 'abc' })).toEqual([]);
    expect(describeCustomerFilters({ spend: '' })).toEqual([]);
    expect(describeCustomerFilters({ spend: 25 })).toEqual([{ id: 'spend', label: 'Spent over $25' }]);
  });

  it('survives junk input without throwing', () => {
    expect(() => describeCustomerFilters(null)).not.toThrow();
    expect(describeCustomerFilters(null)).toEqual([]);
    expect(describeCustomerFilters({ search: 5 })).toEqual([{ id: 'search', label: 'Search “5”' }]);
    expect(describeCustomerFilters({ bookId: 'b' }, { bookTitle: 'not a function' }))
      .toEqual([{ id: 'book', label: 'Book: b' }]);
  });

  it('covers every channel the filter dropdown offers', () => {
    // A value in the <select> with no label here would render as a raw code
    // in the chip. Keep the two lists in step.
    const inSelect = Array.from(
      html.matchAll(/<select id="cust-channel-filter"[\s\S]*?<\/select>/g)
    )[0][0];
    const values = Array.from(inSelect.matchAll(/<option value="([^"]+)"/g)).map(m => m[1]);
    expect(values.length).toBeGreaterThan(0);
    values.forEach(v => expect(SEGMENT_CHANNEL_LABELS[v]).toBeTruthy());
  });
});

describe('joinFilterLabels', () => {
  it('reads as a sentence rather than a list', () => {
    expect(joinFilterLabels([])).toBe('');
    expect(joinFilterLabels([{ label: 'Book: Small Hours' }])).toBe('Book: Small Hours');
    expect(joinFilterLabels([{ label: 'a' }, { label: 'b' }])).toBe('a and b');
    expect(joinFilterLabels([{ label: 'a' }, { label: 'b' }, { label: 'c' }])).toBe('a, b and c');
  });

  it('is safe on junk', () => {
    expect(joinFilterLabels(null)).toBe('');
    expect(joinFilterLabels([{ label: '' }, null, { label: 'a' }])).toBe('a');
  });
});

describe('the segment filter bar in the Customers tab', () => {
  it('has a host element that starts hidden', () => {
    expect(html).toMatch(/id="cust-active-filters"[^>]*class="seg-filter-bar"/);
    expect(html).toMatch(/id="cust-active-filters"[^>]*\bhidden\b/);
  });

  it('announces itself to a screen reader when it appears', () => {
    // The bar materialises as a side effect of changing a dropdown, so the
    // change has to be spoken, not just drawn.
    expect(html).toMatch(/id="cust-active-filters"[^>]*aria-live="polite"/);
  });

  it('sits above the Copy / Export / Email buttons it is warning about', () => {
    const barAt = html.indexOf('id="cust-active-filters"');
    const emailAt = html.indexOf('emailCustomerSegment()');
    expect(barAt).toBeGreaterThan(-1);
    expect(emailAt).toBeGreaterThan(barAt);
  });

  it('escapes the filter labels it renders', () => {
    // Book titles and the search box are both free text a person types.
    expect(main).toMatch(/const safe = escapeHtml\(f\.label\);/);
    expect(main).toMatch(/escapeHtml\(joinFilterLabels\(active\)\)/);
  });

  it('offers a way out for one filter and for all of them', () => {
    expect(main).toMatch(/function clearCustomerFilter\(id\)/);
    expect(main).toMatch(/function clearCustomerFilters\(\)/);
    // Both have to reach the window or the inline handlers are dead links.
    expect(main).toMatch(/clearCustomerFilter, clearCustomerFilters,/);
  });

  it('clears the search box by hand, because the renderer only re-syncs the dropdowns', () => {
    const fn = main.slice(main.indexOf('function clearCustomerFilters()'));
    expect(fn.slice(0, 400)).toMatch(/\$\('cust-search'\)/);
  });

  it('hides the bar rather than letting flex override the hidden attribute', () => {
    expect(css).toMatch(/\.seg-filter-bar\[hidden\]\s*\{\s*display:\s*none;\s*\}/);
  });

  it('gives the remove control a full-size tap target without inflating the chip', () => {
    // A 20px glyph is a miss waiting to happen on a phone at a book fair.
    expect(css).toMatch(/\.pile-chip-x::after\{content:'';position:absolute;inset:-12px;\}/);
  });

  it('gives the remove control hover, active and focus-visible states', () => {
    expect(css).toMatch(/\.pile-chip-x:hover\{/);
    expect(css).toMatch(/\.pile-chip-x:active\{/);
    expect(css).toMatch(/\.pile-chip-x:focus-visible\{/);
  });

  it('stands its motion down for anyone who asked for less of it', () => {
    expect(css).toMatch(/@media \(prefers-reduced-motion:reduce\)\{\.pile-chip-x:active\{transform:none;\}\}/);
  });

  it('adapts to the width of its own panel, not the viewport', () => {
    const bar = css.slice(css.indexOf('.seg-filter-bar {'));
    expect(bar.slice(0, 2000)).toMatch(/@container \(max-width: 560px\)/);
    expect(bar.slice(0, 400)).toMatch(/container-type: inline-size/);
  });

  it('shows the two counts in tabular figures', () => {
    expect(main).toMatch(/<strong class="mono-num">\$\{n\}<\/strong> of <strong class="mono-num">\$\{all\}<\/strong>/);
  });
});

describe('the empty buyer table', () => {
  const emptyFn = main.slice(
    main.indexOf('function _custEmptyHtml('),
    main.indexOf('function _custEmptyHtml(') + 2200,
  );

  it('tells the two empty situations apart', () => {
    // "Filtered to nothing" and "no buyers yet" need opposite advice, and giving
    // the wrong one sends the owner looking for a problem that is not there.
    expect(emptyFn).toMatch(/No buyers match these filters/);
    expect(emptyFn).toMatch(/No buyers with an email yet/);
  });

  it('names the filters that emptied it', () => {
    expect(emptyFn).toMatch(/none of them match \$\{clause\}/);
  });

  it('warns that the segment actions would reach nobody', () => {
    expect(emptyFn).toMatch(/would reach nobody/);
  });

  it('uses the rich empty state with an icon and a call to action', () => {
    expect(emptyFn.match(/empty-state sys-empty/g)).toHaveLength(2);
    expect(emptyFn.match(/sys-empty-actions/g)).toHaveLength(2);
    expect(emptyFn).toMatch(/clearCustomerFilters\(\)/);
    expect(emptyFn).toMatch(/customerPullStripe\(\)/);
  });

  it('counts the buyers that are hidden, in tabular figures', () => {
    expect(emptyFn).toMatch(/<strong class="mono-num">\$\{n\}<\/strong> buyer/);
  });

  it('is rendered by the buyer table instead of the old one-line dead end', () => {
    expect(main).toMatch(/_custEmptyHtml\(all\.length, activeFilters\)/);
    expect(main).not.toMatch(/No customers match this filter\./);
  });

  it('renders as a panel rather than a data row', () => {
    // Nine nowrap header cells push a centred panel off the right of a phone
    // screen, where the way out cannot be read or tapped. Same treatment Order
    // History already uses.
    expect(main).toMatch(/<tr class="sys-empty-row"><td colspan="9">/);
    expect(css).toMatch(/\.tbl tbody tr\.sys-empty-row td,/);
    expect(css).toMatch(/\.tbl:has\(> tbody > tr\.sys-empty-row\) thead,?/);
  });

  it('leaves the Order History empty row working', () => {
    expect(css).toMatch(/\.tbl tbody tr\.hist-empty-row td,/);
    expect(css).toMatch(/\.tbl:has\(> tbody > tr\.hist-empty-row\) thead,/);
  });
});
