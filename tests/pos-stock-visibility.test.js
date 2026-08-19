import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { posStockView, posOversellSummary, POS_LOW_STOCK_AT } from '../src/lib/pos-stock.js';
import { buildHarness, mainJs } from './helpers/extract-decl.js';

const read = rel => fs.readFileSync(path.join(process.cwd(), rel), 'utf8');

// The POS register is the screen worked with a customer standing there, and it
// said nothing at all about stock: a card carried a title, a price and a +/-
// counter, so six copies could be tapped up when two were in the box. The sale
// wrote through, on-hand stopped at 0, and the missing copies only surfaced
// later as the "unaccounted copies" drift banner on History. These cases pin
// the two things that changed: every card now says how many are left, and a
// cart that outruns the records says so before Complete Sale is pressed.

describe('posStockView', () => {
  it('says nothing for a title that is not stock-tracked', () => {
    // POS-only guest and consignment titles deliberately never touch the
    // catalog or the ledger, so they have no on-hand to report. A zero here
    // would read as "out of stock" and stop a sale that is perfectly fine.
    const view = posStockView({ onHand: null, inCart: 2 });
    expect(view.tracked).toBe(false);
    expect(view.level).toBe('untracked');
    expect(view.label).toBe('');
  });

  it('treats a missing on-hand the same as an untracked one', () => {
    expect(posStockView({}).tracked).toBe(false);
    expect(posStockView({ onHand: undefined }).tracked).toBe(false);
    expect(posStockView({ onHand: NaN }).tracked).toBe(false);
  });

  it('counts down as the cart fills', () => {
    expect(posStockView({ onHand: 12, inCart: 0 }).label).toBe('12 left');
    expect(posStockView({ onHand: 12, inCart: 2 }).label).toBe('10 left');
    expect(posStockView({ onHand: 12, inCart: 9 }).label).toBe('3 left');
  });

  it('stays neutral while there is plenty, so the pill is not noise', () => {
    const view = posStockView({ onHand: 40, inCart: 1 });
    expect(view.level).toBe('ok');
    expect(view.pill).toBe('gray');
    expect(view.glyph).toBe('');
  });

  it('warns in amber once only a few are left', () => {
    const view = posStockView({ onHand: POS_LOW_STOCK_AT, inCart: 0 });
    expect(view.level).toBe('low');
    expect(view.pill).toBe('amber');
  });

  it('flags the cart that clears the shelf without calling it an error', () => {
    const view = posStockView({ onHand: 2, inCart: 2 });
    expect(view.level).toBe('last');
    expect(view.pill).toBe('amber');
    expect(view.remaining).toBe(0);
    expect(view.shortBy).toBe(0);
  });

  it('calls out a title with nothing on hand at all', () => {
    const view = posStockView({ onHand: 0, inCart: 0 });
    expect(view.level).toBe('out');
    expect(view.pill).toBe('red');
    expect(view.label).toBe('Out of stock');
  });

  it('reports the shortfall when the cart outruns the records', () => {
    const view = posStockView({ onHand: 2, inCart: 6 });
    expect(view.level).toBe('short');
    expect(view.pill).toBe('red');
    expect(view.shortBy).toBe(4);
    expect(view.label).toContain('4 more');
    expect(view.srText).toContain('6 copies');
    expect(view.srText).toContain('only 2');
  });

  it('never prints a negative stock count', () => {
    // `remaining` keeps the true arithmetic so the shortfall is reportable, but
    // no label may ever read "-4 left" — a stock count that goes below zero is
    // the bug being reported, not a number to show.
    const view = posStockView({ onHand: 1, inCart: 5 });
    expect(view.remaining).toBe(-4);
    expect(view.label).not.toMatch(/-\d/);
  });

  it('ignores a negative or fractional on-hand rather than propagating it', () => {
    expect(posStockView({ onHand: -3, inCart: 0 }).level).toBe('out');
    expect(posStockView({ onHand: 7.8, inCart: 1.9 }).label).toBe('6 left');
  });

  it('uses singular wording for a single copy', () => {
    expect(posStockView({ onHand: 0, inCart: 1 }).srText).toContain('1 copy');
    expect(posStockView({ onHand: 5, inCart: 4 }).srText).toContain('1 copy');
  });
});

describe('posOversellSummary', () => {
  const fine = [
    { title: 'The Hound', onHand: 10, inCart: 2 },
    { title: 'Altrove', onHand: 4, inCart: 4 },
  ];

  it('returns nothing when every line is covered', () => {
    // Nothing at all, not an "all good" banner: a reassurance the seller has to
    // read past on every sale is noise sitting on top of the Complete button.
    expect(posOversellSummary(fine)).toBeNull();
    expect(posOversellSummary([])).toBeNull();
    expect(posOversellSummary()).toBeNull();
  });

  it('never flags an untracked title', () => {
    expect(posOversellSummary([{ title: 'Guest zine', onHand: null, inCart: 9 }])).toBeNull();
  });

  it('names the book and both numbers when one line is short', () => {
    const summary = posOversellSummary([{ title: 'The Hound', onHand: 2, inCart: 5 }]);
    expect(summary.count).toBe(1);
    expect(summary.copies).toBe(3);
    expect(summary.message).toContain('The Hound');
    expect(summary.message).toContain('5');
    expect(summary.message).toContain('2');
  });

  it('totals the shortfall across several short lines', () => {
    const summary = posOversellSummary([
      { title: 'The Hound', onHand: 2, inCart: 5 },
      { title: 'Altrove', onHand: 0, inCart: 1 },
      { title: 'Sistema', onHand: 30, inCart: 1 },
    ]);
    expect(summary.count).toBe(2);
    expect(summary.copies).toBe(4);
    expect(summary.titles).toEqual(['The Hound', 'Altrove']);
    expect(summary.message).toContain('2 titles');
  });

  it('says what happens if the sale goes through anyway', () => {
    // The warning must never read as a refusal. The seller may have brought
    // copies the records don't know about, and blocking a sale at a fair table
    // is worse than an off-by-two stock count.
    const summary = posOversellSummary([{ title: 'The Hound', onHand: 1, inCart: 3 }]);
    expect(summary.note).toMatch(/go ahead/i);
    expect(summary.note).toContain('0');
    expect(summary.srText).toContain(summary.message);
  });

  it('survives a malformed line without throwing', () => {
    expect(() => posOversellSummary([null, undefined, {}])).not.toThrow();
    expect(posOversellSummary([{ onHand: 0, inCart: 2 }].concat(null)).titles).toEqual(['Untitled']);
  });
});

describe('posOnHandFor', () => {
  const build = ({ states = {}, posOnly = [] } = {}) => buildHarness({
    names: ['posOnHandFor'],
    deps: { states, isPosOnlyBook: id => posOnly.includes(id) },
    returns: 'posOnHandFor',
  });

  it('reads the same per-book stock figure every other screen reads', () => {
    const posOnHandFor = build({ states: { hound: { stock: 17 } } });
    expect(posOnHandFor('hound')).toBe(17);
  });

  it('reports a POS-only title as untracked even if a state exists', () => {
    const posOnHandFor = build({ states: { guest: { stock: 4 } }, posOnly: ['guest'] });
    expect(posOnHandFor('guest')).toBeNull();
  });

  it('returns null rather than guessing when the book has no state yet', () => {
    const posOnHandFor = build();
    expect(posOnHandFor('nobody')).toBeNull();
  });

  it('returns null for a state whose stock is not a real number', () => {
    const posOnHandFor = build({ states: { hound: { stock: undefined }, altrove: { stock: 'ten' } } });
    expect(posOnHandFor('hound')).toBeNull();
    expect(posOnHandFor('altrove')).toBeNull();
  });
});

describe('posStockLines', () => {
  const build = (posCart, books, onHand = {}) => buildHarness({
    names: ['posStockLines'],
    deps: {
      posCart,
      posResolveBook: id => books[id] || null,
      posOnHandFor: id => (id in onHand ? onHand[id] : null),
    },
    returns: 'posStockLines',
  });

  it('describes each cart line by title, on-hand and quantity', () => {
    const lines = build(
      { hound: 3 },
      { hound: { id: 'hound', title: 'The Hound' } },
      { hound: 2 },
    )();
    expect(lines).toEqual([{ title: 'The Hound', onHand: 2, inCart: 3 }]);
  });

  it('skips a line whose quantity has been tapped back to zero', () => {
    const lines = build({ hound: 0, altrove: 1 }, { altrove: { title: 'Altrove' } }, { altrove: 5 })();
    expect(lines.map(l => l.title)).toEqual(['Altrove']);
  });

  it('falls back to a placeholder title rather than rendering undefined', () => {
    const lines = build({ ghost: 1 }, {}, { ghost: 0 })();
    expect(lines[0].title).toBe('Untitled');
  });
});

describe('register wiring', () => {
  const html = read('index.html');
  const css = read('src/style.css');

  it('paints a stock pill on every catalog card in the register', () => {
    expect(mainJs).toContain('pos-stock-pill');
    expect(mainJs).toMatch(/posStockView\(\{\s*onHand: posOnHandFor\(book\.id\)/);
  });

  it('reuses the shipped pill vocabulary instead of a new colour set', () => {
    // UX_PATTERNS.md: amber = needs attention, red = error, gray = inert.
    // Anything else here would be a parallel status language on one screen.
    const pills = new Set([
      posStockView({ onHand: 9, inCart: 0 }).pill,
      posStockView({ onHand: 2, inCart: 0 }).pill,
      posStockView({ onHand: 2, inCart: 2 }).pill,
      posStockView({ onHand: 0, inCart: 0 }).pill,
      posStockView({ onHand: 1, inCart: 4 }).pill,
    ]);
    for (const p of pills) expect(['gray', 'amber', 'red']).toContain(p);
  });

  it('hosts the shortfall banner both above Complete Sale and in the confirm dialog', () => {
    expect(html).toContain('id="pos-oversell-note"');
    expect(html).toContain('id="pos-confirm-oversell"');
    expect(mainJs).toContain("posRenderOversellNote('pos-oversell-note'");
    expect(mainJs).toContain("posRenderOversellNote('pos-confirm-oversell'");
  });

  it('announces the banner to a screen reader when it appears', () => {
    for (const id of ['pos-oversell-note', 'pos-confirm-oversell']) {
      const tag = html.match(new RegExp(`<div[^>]*id="${id}"[^>]*>`))[0];
      expect(tag).toContain('aria-live="polite"');
      expect(tag).toContain('hidden');
    }
  });

  it('keeps the banner hidden until there is something to say', () => {
    expect(css).toContain('.pos-oversell-note[hidden]{display:none;}');
    expect(mainJs).toMatch(/if \(!summary\) \{\s*host\.hidden = true;/);
  });

  it('themes the banner from status tokens, so it flips with dark mode', () => {
    const block = css.slice(css.indexOf('.pos-oversell-note{'), css.indexOf('.pos-oversell-note[hidden]'));
    expect(block).toContain('var(--status-critical-bg)');
    expect(block).toContain('var(--status-critical)');
    expect(block).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });

  it('lets a critical card take its border from the pill via :has()', () => {
    expect(css).toContain('.pos-card:has(.pos-stock-pill.red)');
  });

  it('escapes the book title before it reaches the banner markup', () => {
    // The message is plain text out of a pure module and carries a book title,
    // which a publisher types. It has to be escaped at the render boundary.
    expect(mainJs).toMatch(/escapeHtml\(summary\.message\)/);
  });
});
