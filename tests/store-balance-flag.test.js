import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { storeBalanceSlug, storeBalanceComparison } from '../src/lib/consignment.js';

const read = rel => fs.readFileSync(path.join(process.cwd(), rel), 'utf8');

// A consignment store card keeps its own running totals, and the ledger below
// keeps the events those totals summarise. When the two drift apart the card
// showed a red "Unbalanced" chip whose only explanation lived in a `title`
// tooltip — which a tablet at a fair never shows and a keyboard never reaches.
// These cases pin the replacement: a pill button that opens an explainer naming
// the figure that actually disagrees.

describe('storeBalanceSlug', () => {
  it('passes a normal numeric store id straight through', () => {
    expect(storeBalanceSlug(1755600000000)).toBe('1755600000000');
  });

  it('escapes punctuation so the id is legal inside a DOM id', () => {
    expect(storeBalanceSlug('store 7')).toBe('store_32_7');
    expect(storeBalanceSlug('a.b')).toBe('a_46_b');
  });

  it('never collapses two different store ids onto one popover id', () => {
    // The failure this guards: both cards' buttons opening the same panel, so
    // one store's numbers explain the other's. A lossy "strip punctuation"
    // slug would map all three of these to "ab".
    const ids = ['a b', 'a-b', 'a.b', 'ab'];
    expect(new Set(ids.map(storeBalanceSlug)).size).toBe(ids.length);
  });

  it('still produces a usable id for a missing or empty id', () => {
    expect(storeBalanceSlug(undefined)).toBe('unknown');
    expect(storeBalanceSlug('')).toBe('unknown');
    expect(storeBalanceSlug(null)).toBe('unknown');
  });
});

describe('storeBalanceComparison', () => {
  const store = { sent: 20, sold: 6, returned: 2, outstanding: 12 };

  it('pairs every card figure with what the ledger adds up to', () => {
    const rows = storeBalanceComparison(store, { sent: 20, sold: 6, returned: 2, outstanding: 12 });
    expect(rows.map(r => r.key)).toEqual(['sent', 'sold', 'returned', 'outstanding']);
    expect(rows.every(r => r.off === false)).toBe(true);
    expect(rows.find(r => r.key === 'sold')).toMatchObject({ card: 6, ledger: 6 });
  });

  it('flags only the figures that actually disagree', () => {
    // A sale recorded on the card but never written into the ledger: sold and
    // outstanding drift, sent and returned are still fine.
    const rows = storeBalanceComparison(store, { sent: 20, sold: 5, returned: 2, outstanding: 13 });
    const off = rows.filter(r => r.off).map(r => r.key);
    expect(off).toEqual(['sold', 'outstanding']);
  });

  it('gives every row a plain-language label rather than a field name', () => {
    const labels = storeBalanceComparison(store, {}).map(r => r.label);
    expect(labels).toEqual([
      'Sent to the store',
      'Sold by the store',
      'Returned to you',
      'Still on their shelf',
    ]);
  });

  it('reads missing or nonsense figures as zero instead of rendering undefined', () => {
    const rows = storeBalanceComparison({}, undefined);
    expect(rows.every(r => r.card === 0 && r.ledger === 0 && r.off === false)).toBe(true);

    const [sent] = storeBalanceComparison({ sent: null }, { sent: '4' });
    expect(sent).toMatchObject({ card: 0, ledger: 4, off: true });
  });

  it('survives being handed no store at all', () => {
    expect(storeBalanceComparison(null, null)).toHaveLength(4);
  });
});

describe('store balance flag markup', () => {
  const mainJs = read('src/main.js');
  const renderStores = mainJs.slice(mainJs.indexOf('function renderStores()'), mainJs.indexOf('async function removeStore'));

  it('drops the hardcoded red badge for the house status pill', () => {
    // #c0392b never themed: in dark mode it stayed a light-mode red on a dark
    // card. .pill.red resolves through --status-critical, which flips.
    expect(renderStores).not.toContain('#c0392b');
    expect(renderStores).toContain('class="pill red store-balance-flag"');
  });

  it('makes the flag a real button that opens the explainer', () => {
    expect(renderStores).toMatch(/<button type="button" class="pill red store-balance-flag" popovertarget="\$\{balancePopId\}"/);
    expect(renderStores).toContain('class="store-balance-pop" popover');
  });

  it('keeps a tooltip fallback and a screen-reader label on the flag', () => {
    expect(renderStores).toMatch(/store-balance-flag[^>]*title="/);
    expect(renderStores).toMatch(/store-balance-flag[^>]*aria-label="/);
  });

  it('names the popover to assistive tech', () => {
    expect(renderStores).toContain('aria-labelledby="${balancePopId}-title"');
    expect(renderStores).toContain('id="${balancePopId}-title"');
  });

  it('shows the two sides as a table so the figures line up in mono', () => {
    // td.r carries DM Mono in .tbl — the ledger-precision rule for any column
    // of quantities.
    expect(renderStores).toContain('<th class="r">On the card</th>');
    expect(renderStores).toContain('<th class="r">In the ledger</th>');
    expect(renderStores).toContain('<td class="r">${r.card ?? \'—\'}</td>');
  });

  it('marks the disputed figure on the card itself, not only in the popover', () => {
    expect(renderStores).toContain("rowOff('sent')");
    expect(renderStores).toContain("rowOff('sold')");
    expect(renderStores).toContain("rowOff('outstanding')");
  });

  it('leaves the double-entry balance check itself untouched', () => {
    // The drift detection is the data pipeline; this change is presentation
    // only. If these go, the flag stops appearing when it should.
    expect(renderStores).toContain('const calculatedOutstanding = ledgerSent - ledgerSold - ledgerReturned;');
    expect(renderStores).toContain('const isUnbalanced =');
  });
});

describe('store balance flag styling', () => {
  const css = read('src/style.css');
  const darkCss = read('src/styles/theme-dark.css');
  const rule = name => {
    const start = css.indexOf(name);
    expect(start).toBeGreaterThan(-1);
    return css.slice(start, css.indexOf('}', start));
  };

  it('gives the pill-sized flag a full 44px tap target without inflating it', () => {
    // Fitts's Law: the pill renders 19px tall — a miss waiting to happen on a
    // tablet — so 13px of invisible hit area is pushed out top and bottom
    // (19 + 26 = 45px) instead of enlarging the badge itself.
    expect(rule('.store-balance-flag::after')).toContain('inset:-13px -6px');
  });

  it('has hover, active and focus-visible feedback', () => {
    expect(css).toContain('.store-balance-flag:hover{transform:translateY(-1px)');
    expect(css).toContain('.store-balance-flag:active{transform:scale(.975)');
    expect(css).toContain('.store-balance-flag:focus-visible{');
  });

  it('hides the popover panel by default so an unsupporting browser cannot leak it inline', () => {
    expect(rule('.store-balance-pop{')).toContain('display:none');
    expect(css).toContain('.store-balance-pop:popover-open{display:flex;}');
  });

  it('animates in on a spring curve, behind a reduced-motion guard', () => {
    expect(css).toContain('@media (prefers-reduced-motion: no-preference){');
    const motion = css.slice(css.indexOf('.store-balance-pop{\n    opacity:1'));
    expect(motion).toContain('var(--ease-spring)');
    expect(motion).toContain('@starting-style');
  });

  it('themes the disputed figure in both light and dark mode', () => {
    expect(rule('.sk-v.is-off{')).toContain('var(--status-critical)');
    // .theme-dark .sk-v.warn out-specifies the base rule, so dark has to restate it.
    expect(darkCss).toContain('.theme-dark .sk-v.is-off {');
  });

  it('uses semantic tokens rather than raw colour values', () => {
    const block = css.slice(css.indexOf('/* ── STORE BALANCE FLAG'), css.indexOf('/* CONSIGNMENT PRESET STORE DIRECTORY'));
    expect(block).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });
});
