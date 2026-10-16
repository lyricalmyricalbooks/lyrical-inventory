import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from 'vitest';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const phone = readFileSync(path.join(__dirname, '../src/styles/phone.css'), 'utf8');

test('Order History pencil is a full-size tap target on a phone', () => {
  const rule = phone.match(/#tab-history #hist-body \.edit-btn\s*\{([^}]*)\}/);
  expect(rule).not.toBeNull();
  expect(rule[1]).toMatch(/width:\s*28px/);
  expect(phone).toMatch(/#tab-history #hist-body \.edit-btn::after\s*\{[^}]*min-width:\s*var\(--target-min\)/);
  expect(rule[1]).toMatch(/opacity:\s*1/);
  expect(phone).toMatch(/#tab-history #import-btn\s*\{[^}]*width:\s*100%/);
});
