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
const html = readFileSync(path.join(__dirname, '../index.html'), 'utf8');
const mainJs = readFileSync(path.join(__dirname, '../src/main.js'), 'utf8');

test('a failed reminder chip actually gets a red treatment', () => {
  // .chip-status.red had no rule at all — the "Reminder failed" badge on the
  // Invoices list rendered with none of the emerald/amber/violet/gray family's
  // background, border or color, so a payment-chasing failure was invisible.
  const rule = styles.match(/\.chip-status\.red\s*\{([\s\S]*?)\n\}/);
  expect(rule).not.toBeNull();
  expect(rule[1]).toMatch(/color:\s*var\(--status-critical\)/);
  expect(rule[1]).toMatch(/background:\s*var\(--status-critical-bg\)/);
});

test('the dynamic-Stripe-link chip is a themed chip-status tone, not a bespoke pill', () => {
  const rule = styles.match(/\.chip-status\.gold\s*\{([\s\S]*?)\n\}/);
  expect(rule).not.toBeNull();
  expect(rule[1]).toMatch(/color:\s*var\(--gold-text\)/);
  expect(mainJs).toMatch(/chip-status gold sm" title="Dynamic Stripe Checkout/);
  // No more one-off inline-styled pill with its own radius/background/tracking.
  expect(mainJs).not.toMatch(/background:var\(--surface-inverse\);color:var\(--gold-text\);font-size:8px/);
});

test('invoice-row meta chips share one compact size instead of each picking its own font-size', () => {
  const smRule = styles.match(/\.chip-status\.sm\s*\{([\s\S]*?)\n\}/);
  expect(smRule).not.toBeNull();
  expect(smRule[1]).toMatch(/font-size:\s*var\(--text-3xs\)/);

  // The invoice-list chip builders (shared/person/promised/chased/failed) used to
  // hand-pick `style="margin-left:6px;font-size:9px;"` per chip — now they all
  // reuse the shared .sm modifier and no longer carry an inline font-size.
  const chipBuilders = mainJs.match(/const sharedChip[\s\S]*?const chaseEmail/);
  expect(chipBuilders).not.toBeNull();
  expect(chipBuilders[0]).not.toMatch(/font-size:9px/);
  expect(chipBuilders[0]).toMatch(/chip-status gray sm/);
  expect(chipBuilders[0]).toMatch(/chip-status red sm/);
});

test('the invoice number cell lays its chips out on a shared flex rhythm, not manual margins', () => {
  const rule = html.match(/\.invoice-card \.inv-c-num\{([^}]*)\}/);
  expect(rule).not.toBeNull();
  expect(rule[1]).toMatch(/display:flex/);
  expect(rule[1]).toMatch(/flex-wrap:wrap/);
  expect(rule[1]).toMatch(/gap:var\(--space-1\)/);
});
