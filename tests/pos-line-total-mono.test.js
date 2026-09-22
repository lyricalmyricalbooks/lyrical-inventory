import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from 'vitest';

// See tests/book-strip-kpi-alignment.test.js for why __dirname is resolved
// this way rather than via `new URL(..., import.meta.url)`.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const styles = readFileSync(path.join(__dirname, '../src/style.css'), 'utf8');

test('POS cart line totals use the same mono money treatment as the checkout total', () => {
  const lineTotal = styles.match(/\.pos-line-total\s*\{([\s\S]*?)\n\}/);
  const checkoutTotal = styles.match(/\.pos-checkout-total\s*\{([\s\S]*?)\n\}/);

  expect(lineTotal).not.toBeNull();
  expect(checkoutTotal).not.toBeNull();

  // `.mono-num` on the markup only sets tabular-nums, never the typeface —
  // the money font itself has to come from the component rule, or every
  // line in the cart renders in the proportional UI face while the grand
  // total below it (which does carry this) reads in DM Mono.
  expect(lineTotal[1]).toMatch(/font-family:\s*var\(--font-mono\);/);
  expect(lineTotal[1]).toMatch(/font-feature-settings:\s*"tnum" 1, "zero" 1;/);
  expect(lineTotal[1]).toMatch(/font-variant-numeric:\s*tabular-nums;/);

  // Same declarations, not just present — the whole point is that a line
  // total and the grand total it rolls up into read as one type family.
  expect(checkoutTotal[1]).toMatch(/font-family:\s*var\(--font-mono\);/);
});
