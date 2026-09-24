import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from 'vitest';

// Shippo's rate list sits beside the Canada Post list on the Shipping page and
// now shares its anatomy: a full-size Buy Label button instead of an inline-
// squeezed 10px one, the price in plain ink rather than green on every row
// (the coverage tag is what carries good/bad), and a spring lift on hover.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const styles = readFileSync(path.join(__dirname, '../src/style.css'), 'utf8');
const shipping = readFileSync(path.join(__dirname, '../src/features/shipping.js'), 'utf8');

const block = (sel) => {
  const m = styles.match(new RegExp(`(?:^|\\n)${sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\{([\\s\\S]*?)\\n\\}`));
  expect(m, sel).not.toBeNull();
  return m[1];
};

test('rate card wraps with a gap and lifts on a spring, not a linear ease', () => {
  const card = block('.rate-card');
  expect(card).toMatch(/flex-wrap:\s*wrap;/);
  expect(card).toMatch(/gap:\s*14px;/);
  expect(card).toMatch(/var\(--ease-spring\)/);
  expect(block('.rate-card:hover')).toMatch(/box-shadow:\s*var\(--elev-2\);/);
});

test('the price is plain ink with tabular figures, not green on every row', () => {
  const price = block('.rate-price');
  expect(price).toMatch(/color:\s*var\(--text\);/);
  expect(price).not.toMatch(/--green/);
  expect(price).toMatch(/tabular-nums/);
});

test('the Canada Post badge has a colour, and badges sit on the type scale', () => {
  expect(block('.rate-badge.canada-post')).toMatch(/color:\s*var\(--red\);/);
  expect(block('.rate-badge')).toMatch(/font-size:\s*var\(--text-3xs\);/);
});

test('Shippo Buy Label shares the Canada Post button and carries no inline squeeze', () => {
  expect(styles).toMatch(/\.cp-buy-btn,\s*\n\.rate-buy-btn\s*\{[^}]*min-height:\s*44px;/);
  const btn = shipping.match(/<button class="btn gold sm rate-buy-btn"[^>]*>/);
  expect(btn).not.toBeNull();
  expect(btn[0]).not.toMatch(/style=/);
  expect(shipping).not.toMatch(/class="rate-price-area" style=/);
});
