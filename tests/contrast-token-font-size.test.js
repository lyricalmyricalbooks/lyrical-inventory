import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from 'vitest';
import { resolveFontSize, isLargeText } from '../scripts/check-contrast.mjs';

// Resolved via __dirname rather than `new URL(..., import.meta.url)` — jsdom's
// global URL is not a node file URL and node:fs rejects it. Matches the rest
// of tests/.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const systemCss = readFileSync(path.join(__dirname, '../src/styles/system.css'), 'utf8');

// A size written as a token is still a size. The contrast sweep grants WCAG's
// 3:1 large-text threshold by reading font-size off the markup, and it used to
// match only a literal `NNpx`. So moving `font-size:22px` onto
// `font-size:var(--text-xl)` — a change that alters nothing on screen — pushed
// that text to the stricter 4.5:1 threshold and reported it as a new failure.
// Two real headline figures in the inventory valuation dialog hit exactly that.

test('a size written as a token resolves to the same number as the literal', () => {
  expect(resolveFontSize('22px')).toBe(22);
  expect(resolveFontSize('var(--text-xl)')).toBe(22);
  expect(resolveFontSize('var( --text-xl )')).toBe(22);
});

test('an unknown size stays unresolved rather than being guessed', () => {
  // Failing open would be worse than the original bug: unknown must keep
  // demanding the strict ratio, never be waved through as "probably large".
  expect(resolveFontSize('var(--not-a-real-token)')).toBeNull();
  expect(resolveFontSize('1.2rem')).toBeNull();
  expect(resolveFontSize(null)).toBeNull();
  expect(isLargeText('font-size:var(--not-a-real-token);font-weight:700')).toBe(false);
  expect(isLargeText('font-weight:700')).toBe(false);
});

test('the large-text threshold treats token and literal identically', () => {
  const literal = 'font-size:22px;font-weight:700';
  const token = 'font-size:var(--text-xl);font-weight:700';
  expect(isLargeText(token)).toBe(isLargeText(literal));
  expect(isLargeText(token)).toBe(true);

  // Below the bar it must still be false — the resolution step must not have
  // quietly promoted everything to large.
  expect(isLargeText('font-size:var(--text-sm);font-weight:700')).toBe(false);
  expect(isLargeText('font-size:var(--text-lg)')).toBe(false); // 18px, not bold
});

test('the scale comes from system.css, so it cannot drift from the app', () => {
  // A copy hardcoded in the script would go stale the first time the scale is
  // re-tuned, and the staleness would surface as phantom contrast failures on
  // markup nobody had touched.
  const declared = [...systemCss.matchAll(/(--text-[a-z0-9]+)\s*:\s*([\d.]+)px/gi)];
  expect(declared.length).toBeGreaterThanOrEqual(9);
  for (const [, name, px] of declared) {
    expect(resolveFontSize(`var(${name})`), name).toBe(parseFloat(px));
  }
});
