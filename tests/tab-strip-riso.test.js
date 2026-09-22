import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from 'vitest';

// Resolved via __dirname rather than `new URL(..., import.meta.url)` — jsdom's
// global URL is not a node file URL and node:fs rejects it. Matches the rest
// of tests/.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const styles = readFileSync(path.join(__dirname, '../src/style.css'), 'utf8');

const rule = (selector) => {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const m = styles.match(new RegExp(`\\n${escaped}\\s*\\{([\\s\\S]*?)\\n\\}`));
  expect(m, `expected a rule for ${selector}`).not.toBeNull();
  return m[1];
};

// --gold is the FILL: it paints a button, a bar, a border. --gold-text is the
// ink grade meant to be read. On the page they are 3.74:1 and 5.99:1, so the
// fill is below the 4.5:1 floor and the ink is comfortably over it.
//
// The Big Cartel sub-tab shipped with its selected label on the fill, and the
// contrast sweep never noticed because it had no idea that class existed. The
// checker knows both tab classes now; these tests pin the rules themselves, so
// a future edit cannot quietly swap the ink back for the fill.

test('a selected tab label uses the ink grade, never the fill', () => {
  for (const sel of ['.bc-sub-tab.active', '.modal-tab-btn.active', '.settings-sub-tab.active']) {
    const decl = rule(sel);
    // Anchored on the property: an unanchored /color:/ also matches
    // `border-bottom-color:`, which is the one place the fill IS correct.
    expect(decl, `${sel} reads on the page`).toMatch(/(?:^|[;{\s])color:\s*var\(--gold-text\)/);
    expect(decl, `${sel} must not use the fill as text`).not.toMatch(/(?:^|[;{\s])color:\s*var\(--gold\)\s*;/);
  }
});

test('the underline bar keeps the fill, which is what a fill is for', () => {
  // The distinction is the point: the same token is right as a bar and wrong
  // as text. A test that banned --gold outright would teach the wrong lesson.
  expect(rule('.bc-sub-tab.active')).toMatch(/border-bottom-color:\s*var\(--gold\)/);
  expect(rule('.modal-tab-btn.active')).toMatch(/border-bottom-color:\s*var\(--gold\)/);
});

test('tab strips inside dialogs carry the ink stroke, not a hairline', () => {
  // Dialogs are bold chrome under this design.
  expect(rule('.modal-tabs.segmented-control')).toMatch(/border:var\(--stroke\) solid var\(--rule-ink\)/);
  expect(rule('.book-modal-stepper')).toMatch(/border:var\(--stroke\) solid var\(--rule-ink\)/);
  // Squared, like everything else — the segmented control was the last pill
  // in a dialog's chrome, and the stepper's number badge the last circle.
  expect(rule('.modal-tabs.segmented-control')).toMatch(/border-radius:var\(--r2\)/);
  expect(rule('.book-modal-stepper .tab-step-num')).toMatch(/border-radius: var\(--r\);/);
});

test('tab transitions name their properties instead of animating all', () => {
  // `all` animates every animatable property, layout ones included, and a
  // literal curve does not collapse under prefers-reduced-motion.
  for (const sel of ['.modal-tab-btn', '.bc-sub-tab']) {
    const decl = rule(sel);
    expect(decl, `${sel} should not transition all`).not.toMatch(/transition:\s*all/);
    expect(decl, `${sel} uses motion tokens`).toMatch(/var\(--dur-fast\) var\(--ease-standard\)/);
  }
});
