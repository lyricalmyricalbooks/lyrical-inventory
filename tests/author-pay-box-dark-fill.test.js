import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from 'vitest';

// The author's Riso pay box and thank-you slip fill with --cream ("newsprint")
// in light mode. In dark mode --cream is the page colour itself, so without an
// override both rendered with no fill. These pins keep the dark-mode lift.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const styles = readFileSync(path.join(__dirname, '../src/style.css'), 'utf8');
const dark = readFileSync(path.join(__dirname, '../src/styles/theme-dark.css'), 'utf8');
const darkPalette = dark.match(/:root\[data-theme="dark"\]\s*\{([\s\S]*?)\n\}/)[1];
const hexOf = (token) => darkPalette.match(new RegExp(`--${token}:\\s*(#[0-9A-Fa-f]{6})`))[1].toLowerCase();

test('light mode still prints the pay box and thank-you slip on newsprint', () => {
  expect(styles).toMatch(/\.metric-banner\.apb-riso\s*\{\s*background:\s*var\(--cream\);/);
  expect(styles).toMatch(/\.thanks-riso\s*\{[^}]*background:\s*var\(--cream\);/);
});

test('dark mode lifts the pay box and thank-you slip to a card', () => {
  const rule = dark.match(/\.theme-dark \.metric-banner\.apb-riso,\s*\.theme-dark \.thanks-riso\s*\{([^}]*)\}/);
  expect(rule).not.toBeNull();
  expect(rule[1]).toMatch(/background:\s*var\(--surface-card\);/);
});

test('dark mode sale tickets rise one step above the pay box, pending ones stay open', () => {
  const rule = dark.match(/\.theme-dark \.metric-banner-items \.apb-row:not\(\.is-pending\)\s*\{([^}]*)\}/);
  expect(rule).not.toBeNull();
  expect(rule[1]).toMatch(/background:\s*var\(--cream3\);/);
});

test('the dark fills are actually distinct from the page and from each other', () => {
  const page = hexOf('cream');
  const box = hexOf('surface-card');
  const ticket = hexOf('cream3');
  expect(new Set([page, box, ticket]).size).toBe(3);
});
