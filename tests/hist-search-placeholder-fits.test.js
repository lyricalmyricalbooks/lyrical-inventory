import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from 'vitest';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const styles = readFileSync(path.join(__dirname, '../src/style.css'), 'utf8');
const html = readFileSync(path.join(__dirname, '../index.html'), 'utf8');

test('Order History search hint is short enough for a phone and ellipsises if not', () => {
  const input = html.match(/<input[^>]*id="hist-search"[^>]*>/)[0];
  const hint = input.match(/placeholder="([^"]*)"/)[1];
  // ~25 mono characters fit a 375px-wide field; the full field list sits in the line beneath.
  expect(hint.length).toBeLessThanOrEqual(26);
  const rule = styles.match(/\.ledger-filter-input\s*\{([\s\S]*?)\n\}/)[1];
  expect(rule).toMatch(/text-overflow:\s*ellipsis;/);
});
