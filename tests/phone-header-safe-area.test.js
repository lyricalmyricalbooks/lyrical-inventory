import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from 'vitest';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const phoneCss = readFileSync(path.join(__dirname, '../src/styles/phone.css'), 'utf8');

// The phone header rule sets a flat `padding: var(--space-3) var(--space-4)`
// shorthand, which resets padding-top and would otherwise undo style.css's
// safe-area allowance — planting the header under a notch/Dynamic Island on
// a phone held upright.
test('phone app-header keeps a safe-area top padding on top of the flat shorthand', () => {
  const rule = phoneCss.match(/\.pub-shell \.app-header\s*\{([\s\S]*?)\n\s*\}/);
  expect(rule).not.toBeNull();
  expect(rule[1]).toMatch(/padding:\s*var\(--space-3\)\s*var\(--space-4\);/);
  const paddingTop = rule[1].match(/padding-top:\s*([^;]+);/);
  expect(paddingTop).not.toBeNull();
  expect(paddingTop[1]).toMatch(/env\(safe-area-inset-top\)/);
  expect(paddingTop[1]).toMatch(/var\(--space-3\)/);
  // Must come after the shorthand in source order, or the shorthand wins.
  expect(rule[1].indexOf('padding-top')).toBeGreaterThan(rule[1].indexOf('padding:'));
});
