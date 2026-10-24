import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from 'vitest';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const phone = readFileSync(path.join(__dirname, '../src/styles/phone.css'), 'utf8');

test('the phone Save to Preset button spans the dropdown above it and is a full fingertip tall', () => {
  const row = phone.match(/#tab-shipping \.ship-preset-save-row\s*\{([^}]*)\}/);
  expect(row).not.toBeNull();
  expect(row[1]).not.toMatch(/flex-start/);
  const btn = phone.match(/#tab-shipping #ship-save-preset-quick-btn\s*\{([^}]*)\}/);
  expect(btn).not.toBeNull();
  expect(btn[1]).toMatch(/flex:\s*1/);
  expect(btn[1]).toMatch(/min-height:\s*44px/);
});
