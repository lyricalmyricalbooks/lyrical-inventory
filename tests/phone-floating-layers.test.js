import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from 'vitest';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const phone = readFileSync(path.join(__dirname, '../src/styles/phone.css'), 'utf8');
const html = readFileSync(path.join(__dirname, '../index.html'), 'utf8');

test('the toast and the update banner are siblings after the app, so ~ selectors reach them', () => {
  const app = html.indexOf('<div id="pw-app"');
  const appEnd = html.indexOf('<div id="pwa-update-prompt"');
  expect(app).toBeGreaterThan(-1);
  expect(appEnd).toBeGreaterThan(app);
  expect(html.indexOf('<div class="toast" id="toast">')).toBeGreaterThan(appEnd);
});

// After a register sale the Undo bar and the "Sale complete" message appear
// together; the message used to cover Undo.
test('messages rise above the register Charge / Undo bar while it is showing', () => {
  const m = phone.match(/#pw-app:has\(#tab-pos\.active :is\(([^)]*\)[^)]*\)[^)]*)\)\) ~ \.toast \{\s*bottom: ([^;]+);/);
  expect(m).not.toBeNull();
  expect(m[1]).toContain('.fm-bar:not([hidden])');
  expect(m[1]).toContain('.fm-undo:not([hidden])');
  expect(m[2]).toBe('calc(84px + 76px + var(--space-2) + env(safe-area-inset-bottom))');
});

test('the update banner sits above the bottom bar on a phone, inked and square', () => {
  expect(phone).toMatch(/#pw-app\.pub-shell ~ \.pwa-prompt \{ bottom: calc\(72px \+ var\(--space-3\) \+ env\(safe-area-inset-bottom\)\); \}/);
  expect(phone).toMatch(/\.pwa-prompt \{ border: var\(--stroke\) solid var\(--rule-ink\); border-radius: var\(--r2\); box-shadow: var\(--elev-3\); \}/);
  expect(phone).toMatch(/\.pwa-prompt:is\(:hover, :focus-visible\) \{ transform: none; \}/);
});

test('Add sale outlines the payment tap buttons in red when the answer is missing', () => {
  expect(phone).toMatch(/\.form-group\.invalid \.phone-seg-opt \{ border: var\(--stroke\) solid var\(--red\); \}/);
  // Order # and Qty sit side by side again: the phone layer no longer flattens them.
  expect(phone).not.toMatch(/#tab-manual \.order-grid/);
});
