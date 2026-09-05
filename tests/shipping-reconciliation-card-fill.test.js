import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from 'vitest';

// .shipping-reconciliation used to fill with rgba(255,255,255,.04) — a wash
// so faint over its --surface-sunken parent that in light mode it read as no
// card at all, just a border with empty space inside. It only looked like a
// real panel in dark mode, where the same rule happened to get overridden to
// --surface-card by a .theme-dark rule. This pins the base rule using
// --surface-card directly, so the panel is a real card in both themes and no
// theme-specific override is needed at all.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const styles = readFileSync(path.join(__dirname, '../src/style.css'), 'utf8');
const darkStyles = readFileSync(path.join(__dirname, '../src/styles/theme-dark.css'), 'utf8');

test('the shipping reconciliation panel fills with a real card surface, not a translucent wash', () => {
  const rule = styles.match(/\.shipping-reconciliation\{([^}]*)\}/);
  expect(rule).not.toBeNull();
  expect(rule[1]).toMatch(/background:var\(--surface-card\)/);
  expect(rule[1]).not.toMatch(/rgba\(255,\s*255,\s*255/);
});

test('no longer needs a dark-mode override for its own background', () => {
  expect(darkStyles).not.toMatch(/\.theme-dark\s+\.shipping-reconciliation\s*\{[^}]*background/);
});
