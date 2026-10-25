import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from 'vitest';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const phone = readFileSync(path.join(__dirname, '../src/styles/phone.css'), 'utf8');

test('a pending-expense button that wraps to two lines keeps breathing room and balanced lines', () => {
  const rule = phone.match(/#d-pending-expenses-list \.pending-card-actions \.btn\s*\{([^}]*)\}/);
  expect(rule).not.toBeNull();
  expect(rule[1]).toMatch(/white-space:\s*normal;/);
  expect(rule[1]).toMatch(/line-height:\s*var\(--leading-snug\);/);
  expect(rule[1]).toMatch(/padding-block:\s*var\(--space-2\);/);
  expect(rule[1]).toMatch(/text-wrap:\s*balance;/);
});
