import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from 'vitest';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const phone = readFileSync(path.join(__dirname, '../src/styles/phone.css'), 'utf8');

test('Add Sale phone options are ink-outlined with the offset shadow', () => {
  expect(phone).toMatch(/:is\(\.phone-mode-opt, \.phone-seg-opt\) \{\s*border: var\(--stroke\) solid var\(--rule-ink\)/);
  expect(phone).toMatch(/box-shadow: var\(--elev-1\)/);
});

test('they press into the shadow when tapped', () => {
  expect(phone).toMatch(/:is\(\.phone-mode-opt, \.phone-seg-opt\):active \{ transform: translate\(2px, 2px\); box-shadow: none/);
});

test('the Sale / Gift switch drops its grey well', () => {
  expect(phone).toMatch(/#tab-manual \.phone-mode-seg \{[^}]*background: transparent/);
});

test('phone form fields carry the same 2px ink outline as cards and buttons', () => {
  const styles = readFileSync(path.join(__dirname, '../src/style.css'), 'utf8');
  const rule = styles.match(/\n  \.form-group input, \.form-group select, \.form-group textarea\{border-width:var\(--stroke\);border-color:var\(--border-strong\);\}/);
  expect(rule).not.toBeNull();
  expect(styles.indexOf(rule[0])).toBeGreaterThan(styles.indexOf('@media (max-width: 768px){'));
});

test('phone Shipping key box and destination picker take the ink outline too', () => {
  const styles = readFileSync(path.join(__dirname, '../src/style.css'), 'utf8');
  expect(styles).toMatch(/\.ship-key-setup input\{border:var\(--stroke\) solid var\(--border-strong\) !important;\}/);
  expect(styles).toMatch(/\.ship-key-setup input:focus\{border-color:var\(--gold\) !important;\}/);
  expect(styles).toMatch(/\.custom-dest-wrapper \.custom-dest-trigger\{border-width:var\(--stroke\);\}/);
  expect(styles).toMatch(/\.custom-dest-trigger:not\(:hover\):not\(:focus\):not\(\.active\)\{border-color:var\(--border-strong\);\}/);
});

test('phone tick-boxes are square with the 2px ink outline, ink-filled when on', () => {
  const dark = readFileSync(path.join(__dirname, '../src/styles/theme-dark.css'), 'utf8');
  const base = phone.slice(phone.indexOf('label > input[type=checkbox]:not('));
  expect(base).toMatch(/appearance: none/);
  expect(base).toMatch(/border: var\(--stroke\) solid var\(--rule-ink\); border-radius: 0/);
  expect(base).toContain('.tc-toggle-wrap');
  expect(phone).toMatch(/:checked \{ background: var\(--surface-inverse\)/);
  expect(dark).toMatch(/\.theme-dark label > input\[type=checkbox\]:checked \{ background: var\(--cream4\)/);
});

test('upright phone: Book Catalog Remove button gets a solid red outline, not a faint hairline', () => {
  const rule = phone.match(/\.catalog-card \.catalog-actions \.btn\.danger-btn\s*\{([^}]*)\}/);
  expect(rule).not.toBeNull();
  expect(rule[1]).toMatch(/border-color:\s*var\(--status-critical\)/);
  expect(rule[1]).toMatch(/color:\s*var\(--status-critical\)/);
});
