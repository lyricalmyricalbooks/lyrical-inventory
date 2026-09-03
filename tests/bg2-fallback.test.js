import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from 'vitest';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const styles = readFileSync(path.join(__dirname, '../src/style.css'), 'utf8');
const html = readFileSync(path.join(__dirname, '../index.html'), 'utf8');

// --bg2 is only ever defined inside theme-dark.css (see the "Tokens that only
// ever existed as var(--x, #fallback) fallbacks" comment there) — style.css's
// :root never declares it. A bare `var(--bg2)` is therefore guaranteed-invalid
// in light mode, the app's default theme: the whole `background` declaration
// drops out and the element paints fully transparent. Six call sites in
// style.css and two inline styles in index.html were written without the
// fallback every other --bg2 usage in the codebase already carries, leaving
// the Big Cartel product cards, the Big Cartel plan badge, the "Link to
// Shippo" modal's search field/sticky header/row hover, the Web Analytics
// timeframe pill, and the shipping-address preview card invisible in light
// mode. This test pins the fallback so a future edit can't drop it again.

test('every --bg2 reference in style.css carries a fallback', () => {
  const bareRefs = styles.match(/var\(--bg2\)/g) || [];
  expect(bareRefs).toEqual([]);
});

test('every --bg2 reference in index.html carries a fallback', () => {
  const bareRefs = html.match(/var\(--bg2\)/g) || [];
  expect(bareRefs).toEqual([]);
});

test('the previously-broken call sites now fall back to the themed --cream2 surface', () => {
  expect(styles).toMatch(/\.bc-card\s*\{\s*background:\s*var\(--bg2,\s*var\(--cream2\)\);/);
  expect(styles).toMatch(/\.plan-badge\.individual, \.plan-badge\.standard, \.plan-badge\.free \{\s*background:\s*linear-gradient\(135deg,\s*var\(--bg2,\s*var\(--cream2\)\),\s*var\(--border\)\);/);
  expect(styles).toMatch(/\.shippo-link-row:hover \{ background: color-mix\(in srgb, var\(--bg2, var\(--cream2\)\) 60%, transparent\); \}/);
  expect(styles).toMatch(/\.manual-link-table th \{[\s\S]*?background:\s*var\(--bg2,\s*var\(--cream2\)\);/);

  const timeframeTag = html.match(/<span[^>]*id="webanalytics-timeframe-tag"[^>]*>/);
  expect(timeframeTag, 'webanalytics-timeframe-tag span not found').not.toBeNull();
  expect(timeframeTag[0]).toMatch(/background:\s*var\(--bg2,\s*var\(--cream2\)\)/);
});
