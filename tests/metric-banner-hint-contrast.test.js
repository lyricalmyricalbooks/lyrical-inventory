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

test('metric banner hint text uses a readable on-inverse token, not a near-invisible raw alpha', () => {
  const rule = styles.match(/\.metric-banner-hint\s*\{([\s\S]*?)\}/);

  expect(rule).not.toBeNull();
  expect(rule[1]).toMatch(/color:\s*var\(--on-inverse-3\)/);
  // rgba(255,255,255,.2) on the --ink surface composited under ~2.3:1 contrast,
  // worse than the 2.6:1 the tab bar was fixed away from (style.css "TABS" comment).
  expect(rule[1]).not.toMatch(/rgba\(255,\s*255,\s*255,\s*\.?2\)/);
});
