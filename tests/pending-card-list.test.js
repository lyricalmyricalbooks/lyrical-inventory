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
const mainJs = readFileSync(path.join(__dirname, '../src/main.js'), 'utf8');

test('pending transfer/expense cards use the shared inset accent bar, not a border-left', () => {
  const card = styles.match(/\.pending-card\s*\{([\s\S]*?)\n\}/);

  expect(card).not.toBeNull();
  expect(card[1]).toMatch(/box-shadow:\s*var\(--elev-1\),\s*inset 3px 0 0 var\(--status-active\);/);
  expect(card[1]).not.toMatch(/border-left/);
});

test('the two dashboard "awaiting" lists space cards with a gap, not margin-bottom', () => {
  const listRule = styles.match(/#artist-transfers-list,\s*\n#d-pending-expenses-list\s*\{([\s\S]*?)\}/);

  expect(listRule).not.toBeNull();
  expect(listRule[1]).toMatch(/display:\s*flex;flex-direction:\s*column;gap:\s*var\(--space-2\);/);
  expect(mainJs).not.toMatch(/margin-bottom:10px;box-shadow:var\(--shadow\)/);
});

test('renderArtistTransfers and renderPendingExpenses render the shared .pending-card class', () => {
  expect(mainJs).toMatch(/class="pending-card\$\{t\.status === 'pending' \? ' is-pending' : ''\}"/);
  expect(mainJs).toMatch(/class="pending-card">/);
  expect(mainJs).toMatch(/class="pile-chip">\$\{escapeHtml\(e\.cat\)\}/);
});
