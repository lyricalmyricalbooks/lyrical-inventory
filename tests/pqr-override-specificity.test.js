import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from 'vitest';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const styles = readFileSync(path.join(__dirname, '../src/style.css'), 'utf8');

test('payment QR override fields keep their tabular mono treatment over .form-group', () => {
  // `.form-group input,.form-group select,.form-group textarea` (a class plus a type
  // selector) is more specific than the bare `.pqr-select,.pqr-input` class selector,
  // so it silently wins the cascade and reverts the money fields to plain Syne on a
  // generic form background. A selector scoped under `.pqr-override-card` (two
  // classes) is what actually outranks it.
  const override = styles.match(/\.pqr-override-card \.pqr-select,\s*\n\.pqr-override-card \.pqr-input \{([\s\S]*?)\n\}/);

  expect(override).not.toBeNull();
  expect(override[1]).toMatch(/font-family:\s*'DM Mono',\s*monospace;/);
  expect(override[1]).toMatch(/font-variant-numeric:\s*tabular-nums;/);
  expect(override[1]).toMatch(/background:\s*var\(--surface-raised\);/);

  const formGroupRule = styles.match(/\.form-group input,\.form-group select,\.form-group textarea\{([\s\S]*?)\}/);
  expect(formGroupRule).not.toBeNull();
  // Sanity check the premise still holds: the generic rule really does set a
  // conflicting proportional font, so the override above is doing real work.
  expect(formGroupRule[1]).toMatch(/font-family:'Syne',sans-serif;/);
});
