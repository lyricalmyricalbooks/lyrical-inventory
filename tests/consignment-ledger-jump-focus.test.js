import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from 'vitest';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const styles = readFileSync(path.join(__dirname, '../src/style.css'), 'utf8');
const mainJs = readFileSync(path.join(__dirname, '../src/main.js'), 'utf8');

// The book-title and store-name jump links in the "All consignment" table
// (conAccountRowHtml() in main.js) are role="button" tabindex="0" spans, not
// real <a>/<button> elements, so a browser gives them no default focus
// outline at all. Every other interactive element in this same table
// (.con-row-progress-link, .con-group-toggle-btn) already carries a
// :focus-visible rule; these two rows in the highest-traffic ledger table
// were the visible gap in that set.
test('consignment ledger jump links define a focus-visible state', () => {
  // A dedicated `selector:focus-visible{...}` rule, not merely folded into the
  // `:hover` selector list, so it carries its own outline declarations.
  expect(styles).toContain(
    '.con-row-book-title:focus-visible{outline:var(--focus-ring-width) solid var(--focus-ring-color);outline-offset:var(--focus-ring-offset);'
  );
  expect(styles).toContain(
    '.store-jump-link:focus-visible{outline:var(--focus-ring-width) solid var(--focus-ring-color);outline-offset:var(--focus-ring-offset);'
  );

  // Hover and focus-visible share the same visited treatment, so tabbing
  // through the table reads the same as pointing at it.
  expect(styles).toContain('.con-row-book-title:hover,.con-row-book-title:focus-visible{color:var(--gold2);}');
  expect(styles).toContain('.store-jump-link:hover,.store-jump-link:focus-visible{color:var(--gold2);text-underline-offset:3px;text-decoration:underline;}');
});

test('both jump links stay keyboard-actionable role="button" spans in the ledger row markup', () => {
  expect(mainJs).toMatch(/class="con-row-book-title" role="button" tabindex="0"/);
  expect(mainJs).toMatch(/class="store-name-cell store-jump-link" role="button" tabindex="0"/);
});
