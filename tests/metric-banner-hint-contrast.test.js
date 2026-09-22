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

test('metric banner hint text uses a readable muted token, not a near-invisible raw alpha', () => {
  const rule = styles.match(/\.metric-banner-hint\s*\{([\s\S]*?)\}/);

  expect(rule).not.toBeNull();
  // --text3, not --on-inverse-3: the banner went from a permanently --ink block
  // to Riso paper, so the readable muted tier is the one tuned for a light
  // surface. What this test protects is unchanged — the hint must be a named
  // muted token, never a raw white alpha, which is what made it near-invisible.
  expect(rule[1]).toMatch(/color:\s*var\(--text3\)/);
  expect(rule[1]).not.toMatch(/rgba\(255,\s*255,\s*255,\s*\.?2\)/);
});
