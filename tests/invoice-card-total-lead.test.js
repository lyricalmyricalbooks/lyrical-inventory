import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from 'vitest';

// Resolved via __dirname rather than `new URL(..., import.meta.url)`: under the
// jsdom test environment the global URL is jsdom's, and node:fs / fileURLToPath
// reject a foreign URL object with "must be of scheme file". Passing a string
// keeps node's own parser in play, and matches how the rest of tests/ does it.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const html = readFileSync(path.join(__dirname, '../index.html'), 'utf8');
const mainJs = readFileSync(path.join(__dirname, '../src/main.js'), 'utf8');

/** Lift one rule block out of index.html's inline <style> by exact selector. */
function rule(selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = html.match(new RegExp(`(?:^|\\n)\\s*${escaped}\\s*\\{([^}]*)\\}`));
  expect(match, `no rule found for "${selector}"`).not.toBeNull();
  return match[1];
}

test('the invoice total leads its row instead of tying with the dates beside it', () => {
  const amount = rule('.invoice-card .inv-c-cell.amt strong');
  const figure = rule('.invoice-card .inv-c-cell strong');

  // Two steps up the scale (--text-lg 18px vs --text-base 13px) is what makes
  // the total read as the row's headline rather than a fourth equal column.
  expect(amount).toMatch(/font-size:\s*var\(--text-lg\)/);
  expect(figure).toMatch(/font-size:\s*var\(--text-base\)/);

  // Money stays mono so digits keep tabular alignment down the stack.
  expect(figure).toMatch(/font-family:\s*'DM Mono',\s*monospace/);
  // An 18px figure must not wrap its own column.
  expect(amount).toMatch(/white-space:\s*nowrap/);
});

test('invoice totals share one right edge so a column of them can be compared', () => {
  const amtCell = rule('.invoice-card .inv-c-cell.amt');
  expect(amtCell).toMatch(/text-align:\s*right/);

  // A step more gutter than the grid gap, or the enlarged figure butts against
  // the status pill and reads as part of the action cluster.
  expect(amtCell).toMatch(/padding-right:\s*var\(--space-2\)/);

  // The amount column needs a floor, or a long total reflows the grid and the
  // shared edge moves from card to card.
  expect(rule('.invoice-card')).toMatch(
    /grid-template-columns:\s*auto\s+minmax\(0,\s*1\.6fr\)\s+1fr\s+1fr\s+minmax\(124px,\s*1fr\)\s+auto/,
  );

  // Stacked at narrow widths every cell is full width, so the right-align is
  // deliberately dropped rather than left to float the total off on its own.
  const narrow = html.match(/@media \(max-width:780px\)\{([\s\S]*?)\n  \}/);
  expect(narrow).not.toBeNull();
  expect(narrow[1]).toMatch(/\.invoice-card \.inv-c-cell\.amt\{text-align:left;padding-right:0;\}/);
});

test('invoice captions sit on the Syne micro-label scale, a step below their figures', () => {
  const caption = rule('.invoice-card .inv-c-cell');

  expect(caption).toMatch(/font-family:\s*'Syne',\s*sans-serif/);
  expect(caption).toMatch(/font-size:\s*var\(--text-3xs\)/);
  expect(caption).toMatch(/text-transform:\s*uppercase/);
  expect(caption).toMatch(/letter-spacing:\s*var\(--tracking-caps\)/);

  // The figure has to reset both, or a date inherits the caption's tracking.
  const figure = rule('.invoice-card .inv-c-cell strong');
  expect(figure).toMatch(/letter-spacing:\s*0/);
  expect(figure).toMatch(/text-transform:\s*none/);
});

test('the invoice amount uses the readable gold, not the raw accent fill', () => {
  const amount = rule('.invoice-card .inv-c-cell.amt strong');
  expect(amount).toMatch(/color:\s*var\(--gold-text\)/);
  expect(amount).not.toMatch(/color:\s*var\(--gold\)/);
});

test('invoice card spacing and elevation come off the token scales', () => {
  const card = rule('.invoice-card');

  expect(card).toMatch(/padding:\s*var\(--space-4\)\s+var\(--space-5\)/);
  expect(card).toMatch(/margin-bottom:\s*var\(--space-3\)/);
  expect(card).toMatch(/gap:\s*var\(--space-4\)/);
  expect(card).toMatch(/box-shadow:\s*var\(--elev-1\)/);
  // Durations must come from the tokens — that is what collapses the hover
  // lift under prefers-reduced-motion.
  expect(card).toMatch(/transition:[^;]*var\(--dur-fast\)\s+var\(--ease-standard\)/);
  expect(rule('.invoice-card:hover')).toMatch(/box-shadow:\s*var\(--elev-hover\)/);
});

test('the invoice actions column is styled by class, not by inline style', () => {
  expect(rule('.invoice-card .inv-c-actions')).toMatch(/flex-direction:\s*column/);
  expect(rule('.invoice-card .inv-c-btns')).toMatch(/justify-content:\s*flex-end/);

  // The renderer used to re-declare both of these inline, fighting the class.
  const card = mainJs.match(/return `<div class="invoice-card">([\s\S]*?)<\/div>`;/);
  expect(card).not.toBeNull();
  expect(card[1]).toContain('<div class="inv-c-actions">');
  expect(card[1]).toContain('<div class="inv-c-btns">');
  expect(card[1]).not.toMatch(/class="inv-c-actions"\s+style=/);
});
