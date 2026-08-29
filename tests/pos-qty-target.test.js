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

test('POS quantity stepper buttons meet the 44px touch target and have a full state set', () => {
  // The base rule is the multi-line block (a mobile breakpoint further up the
  // file also sets `.pos-qty-btn{...}` on one line with no interior newline,
  // which a lazy `[\s\S]*?\n\}` would otherwise skate straight past).
  const btn = styles.match(/\.pos-qty-btn \{\n([\s\S]*?)\n\}/);
  const active = styles.match(/\.pos-qty-btn:active \{\n([\s\S]*?)\n\}/);
  const focusVisible = styles.match(/\.pos-qty-btn:focus-visible \{\n([\s\S]*?)\n\}/);

  expect(btn).not.toBeNull();
  expect(btn[1]).toMatch(/width:\s*var\(--target-min\)/);
  expect(btn[1]).toMatch(/height:\s*var\(--target-min\)/);

  expect(active).not.toBeNull();
  expect(focusVisible).not.toBeNull();
  expect(focusVisible[1]).toMatch(/outline:/);
});
