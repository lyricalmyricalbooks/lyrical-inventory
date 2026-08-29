import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from 'vitest';

// Resolved via __dirname rather than `new URL(..., import.meta.url)`: under the
// jsdom test environment the global URL is jsdom's, and node:fs / fileURLToPath
// reject a foreign URL object with "must be of scheme file". Passing a string
// keeps node's own parser in play, and matches how the rest of tests/ does it.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const styles = readFileSync(path.join(__dirname, '../src/style.css'), 'utf8');
const markup = readFileSync(path.join(__dirname, '../index.html'), 'utf8');
const mainJs = readFileSync(path.join(__dirname, '../src/main.js'), 'utf8');

// The four column roles that give a wide list table a reading order: one cell
// leads, one anchors, the rest recede. Pinned here because each carries a
// specific design decision that is invisible once it works.
test('wide-table column roles keep their figure treatment', () => {
  const lead = styles.match(/\.tbl td\.lead-cell\s*\{([\s\S]*?)\}/);
  const money = styles.match(/\.tbl td\.money-cell\s*\{([\s\S]*?)\}/);
  const date = styles.match(/\.tbl td\.date-cell\s*\{([\s\S]*?)\n\}/);
  const text = styles.match(/\.tbl td\.text-cell\s*\{([\s\S]*?)\}/);

  expect(lead).not.toBeNull();
  expect(money).not.toBeNull();
  expect(date).not.toBeNull();
  expect(text).not.toBeNull();

  // The row's subject carries real weight so each row has an entry point.
  expect(lead[1]).toMatch(/font-weight:\s*600;/);

  // The headline figure steps back up to primary text — the whole point of the
  // change is that money stops sitting in the muted meta register.
  expect(money[1]).toMatch(/color:\s*var\(--content-primary\);/);
  // 500, not 600: DM Mono ships only 400/500, so a heavier request is faux-bold
  // and smears the digits. Raising this is the regression to catch.
  expect(money[1]).toMatch(/font-weight:\s*500;/);
  // A multi-currency spend string must not wrap mid-figure.
  expect(money[1]).toMatch(/white-space:\s*nowrap;/);

  // Dates read left-aligned like text but with mono digits, so a column of them
  // lines up instead of wandering.
  expect(date[1]).toMatch(/font-family:\s*'DM Mono',\s*monospace;/);
  expect(date[1]).toMatch(/white-space:\s*nowrap;/);

  // Free text between the figures recedes and is width-capped, so one buyer
  // with nine titles cannot squeeze the spend column.
  expect(text[1]).toMatch(/color:\s*var\(--content-muted\);/);
  expect(styles).toMatch(/\.tbl td\.text-cell > span\s*\{[^}]*max-width:\s*26ch;/);
  // It wraps rather than truncating — this is a list of what someone bought.
  expect(styles).not.toMatch(/\.tbl td\.text-cell > span\s*\{[^}]*text-overflow/);
});

test('every colour the new column roles set is a theme token, not a literal', () => {
  const block = styles.match(
    /\.tbl td\.lead-cell\s*\{[\s\S]*?\.tbl td\.text-cell > span\s*\{[^}]*\}/,
  );
  expect(block).not.toBeNull();
  // A raw hex here would be right in one theme and wrong in the other.
  expect(block[0]).not.toMatch(/#[0-9a-f]{3,8}\b/i);
  expect(block[0]).not.toMatch(/\bcolor:\s*var\(--cream/);
});

test('the buyer table marks Spend as a numeric column in its header', () => {
  const head = markup.match(
    /<thead><tr><th>Name<\/th><th>Email<\/th>[\s\S]*?<th>Action<\/th><\/tr><\/thead>/,
  );
  expect(head).not.toBeNull();
  // Right-aligning the body without the header leaves the label floating over
  // the wrong edge of its own column.
  expect(head[0]).toMatch(/<th class="r">Spend<\/th>/);
  expect(head[0]).toMatch(/<th class="r">Orders<\/th>/);
  expect(head[0]).toMatch(/<th class="r">Units<\/th>/);
});

test('buyer rows use the column roles instead of inline meta styling', () => {
  const row = mainJs.match(/<td class="lead-cell">\$\{escapeHtml\(r\.name\)[\s\S]*?<\/tr>/);
  expect(row).not.toBeNull();

  expect(row[0]).toMatch(/<td class="r money-cell">\$\{_custSpendStr\(r\.spend\)/);
  expect(row[0]).toMatch(/<td class="date-cell">\$\{r\.last \? fmtD\(r\.last\)/);
  // The cap lives on an inner span: `max-width` on a `td` is unreliable under
  // auto table layout, so losing the span silently loses the cap.
  expect(row[0]).toMatch(/<td class="text-cell"><span>\$\{escapeHtml\(Array\.from\(r\.books\)/);

  // The old treatment painted money and dates as 12px muted body text, which is
  // exactly what made them unscannable.
  expect(row[0]).not.toMatch(/font-size:12px;color:var\(--text3\);">\$\{_custSpendStr/);
  expect(row[0]).not.toMatch(/font-size:12px;color:var\(--text3\);">\$\{r\.last/);
});

test('the mailing list date column gets the same figure treatment', () => {
  const row = mainJs.match(/<td class="lead-cell">\$\{escapeHtml\(s\.name\)[\s\S]*?<\/tr>/);
  expect(row).not.toBeNull();
  expect(row[0]).toMatch(/<td class="date-cell">\$\{s\.added \? fmtD\(s\.added\)/);
});

test('both customer tables pin their column labels while the page scrolls', () => {
  // Nine columns of anonymous figures are unreadable once the labels scroll
  // away, and the buyer list is as long as the shop's whole history.
  expect(markup).toMatch(/<div class="tbl-wrap sys-sticky-head"><table class="tbl">\s*<thead><tr><th>Name<\/th><th>Email<\/th><th class="r">Orders<\/th>/);
  expect(markup).toMatch(/<div class="tbl-wrap sys-sticky-head" style="margin-top:14px;"><table class="tbl">\s*<thead><tr><th>Name<\/th><th>Email<\/th><th>Added<\/th>/);
});
