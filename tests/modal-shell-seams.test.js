import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from 'vitest';

// Resolved via __dirname rather than `new URL(..., import.meta.url)` — see the
// note in tests/book-strip-kpi-alignment.test.js for why.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const styles = readFileSync(path.join(__dirname, '../src/style.css'), 'utf8').replace(/\r\n/g, '\n');
const html = readFileSync(path.join(__dirname, '../index.html'), 'utf8').replace(/\r\n/g, '\n');

// The lookbehind keeps a single-selector lookup from matching the tail of a
// grouped one — `.modal-footer::before` must not resolve to the shared
// `.modal-title::after,\n.modal-footer::before` block.
const rule = (selector) => {
  const m = styles.match(
    new RegExp(`(?:^|(?<!,)\\n)${selector.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\$&')}\\s*\\{([\\s\\S]*?)\\n?\\}`)
  );
  expect(m, `missing rule for ${selector}`).not.toBeNull();
  return m[1];
};

// The dialog is a pinned header / scrolling body / pinned footer shell. The
// block padding has to live on the header and footer rather than on .modal,
// because a sticky child can only pin flush against the scrollport edge —
// padding left on .modal would sit above the pinned header and leak a strip of
// scrolling content through the gap. If someone ever restores a blanket
// `padding:var(--space-6)` here, that leak comes straight back.
test('the dialog gives its block padding to the pinned header and footer', () => {
  const modal = rule('.modal');
  expect(modal).toMatch(/padding:\s*0\s+var\(--space-6\);/);
  expect(modal).not.toMatch(/padding:\s*var\(--space-6\);/);

  expect(rule('.modal-title')).toMatch(/padding:\s*var\(--space-6\)\s+0\s+var\(--space-4\);/);
  expect(rule('.modal-footer')).toMatch(/padding:\s*var\(--space-3\)\s+0\s+var\(--space-6\);/);
});

// The two dialogs in this app that render without a standard header or footer
// (the receipt lightbox, the invoice paper) would otherwise lose that padding
// outright and sit flush against their own border.
test('a dialog missing a header or footer gets that padding back', () => {
  expect(styles).toMatch(
    /\.modal:not\(:has\(\.modal-title\)\)\s*\{\s*padding-top:\s*var\(--space-6\);\s*\}/
  );
  expect(styles).toMatch(
    /\.modal:not\(:has\(\.modal-footer\)\)\s*\{\s*padding-bottom:\s*var\(--space-6\);\s*\}/
  );
});

test('both pinned edges carry an opaque fill, a hairline and a z-index', () => {
  for (const [selector, edge, seam] of [
    ['.modal-title', /top:\s*0;/, /border-bottom:\s*1px solid var\(--border-default\);/],
    ['.modal-footer', /bottom:\s*0;/, /border-top:\s*1px solid var\(--border-default\);/],
  ]) {
    const block = rule(selector);
    expect(block, selector).toMatch(/position:\s*sticky;/);
    expect(block, selector).toMatch(edge);
    expect(block, selector).toMatch(seam);
    // Without an opaque fill the body scrolls straight through the pinned bar;
    // without the z-index it scrolls over the top of it.
    expect(block, selector).toMatch(/background:\s*var\(--surface-page\);/);
    expect(block, selector).toMatch(/z-index:\s*var\(--z-raised\);/);
  }
});

// The scrims are what stop a field label being guillotined through its
// x-height on the seam. The +1px is load-bearing: a percentage offset on an
// absolutely positioned box resolves against the containing block's padding
// box, so a plain 100% starts the scrim inside the border and paints its
// opaque end over the hairline.
test('the scrims sit clear of the hairline and out of the footer flex row', () => {
  const shared = rule('.modal-title::after,\\n.modal-footer::before');
  expect(shared).toMatch(/position:\s*absolute;/);
  expect(shared).toMatch(/pointer-events:\s*none;/);
  expect(shared).toMatch(/height:\s*var\(--space-3\);/);

  expect(rule('.modal-title::after')).toMatch(
    /top:\s*calc\(100% \+ 1px\);[\s\S]*linear-gradient\(to bottom,\s*var\(--surface-page\),\s*transparent\)/
  );
  expect(rule('.modal-footer::before')).toMatch(
    /bottom:\s*calc\(100% \+ 1px\);[\s\S]*linear-gradient\(to top,\s*var\(--surface-page\),\s*transparent\)/
  );
});

// The phone breakpoint has to repeat the split, or a dialog on a phone gets
// the header's padding from nowhere and the modal's from a rule that no
// longer sets it.
test('the phone breakpoint keeps the same three-part split', () => {
  const mobile = styles.slice(styles.indexOf('/* ============ MOBILE / TABLET'));
  expect(mobile).toMatch(/\.modal\{[\s\S]*?padding:\s*0\s+var\(--space-4\);/);
  expect(mobile).toMatch(/\.modal:not\(:has\(\.modal-title\)\)\{padding-top:var\(--space-4\);\}/);
  expect(mobile).toMatch(/\.modal:not\(:has\(\.modal-footer\)\)\{padding-bottom:var\(--space-4\);\}/);
  expect(mobile).toMatch(/\.modal-title\{[^}]*padding:var\(--space-4\) 0 var\(--space-3\);/);
  expect(mobile).toMatch(/\.modal-footer\{[^}]*padding:var\(--space-3\) 0 var\(--space-4\);/);
});

// The whole shell rests on .modal-title being the dialog's first element: it is
// what the pinned header is, and what the padding guard keys off. A dialog that
// opens with something else would pin that something else against the top edge.
test('every dialog still opens with its title, bar the two that have none', () => {
  const opens = [...html.matchAll(/<div\b[^>]*\bclass="((?:[^"]*\s)?modal(?:\s[^"]*)?)"[^>]*>/g)];
  expect(opens.length).toBeGreaterThan(30);

  const headless = [];
  for (const m of opens) {
    const first = /<(\w+)([^>]*?)\/?>/.exec(html.slice(m.index + m[0].length));
    const cls = first && /class="([^"]*)"/.exec(first[2]);
    if (!cls || !cls[1].split(/\s+/).includes('modal-title')) headless.push(m[1]);
  }
  expect(headless.sort()).toEqual(['modal invoice-view-modal', 'modal tc-lightbox-modal']);
});

// Twelve footers used to hand-pick their own 14/16/18px top gap, so no two
// dialogs put their buttons the same distance below the last field. The shared
// rule owns that gap now; an inline copy would silently ragged it again.
test('no dialog footer hand-picks its own spacing any more', () => {
  const footers = [...html.matchAll(/<div class="modal-footer[^"]*"[^>]*style="([^"]*)"/g)];
  for (const [, style] of footers) {
    expect(style, style).not.toMatch(/(?:^|;)\s*(?:margin-top|padding-top|border-top)\s*:/);
  }
});
