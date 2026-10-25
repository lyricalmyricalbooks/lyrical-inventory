import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from 'vitest';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const phone = readFileSync(path.join(__dirname, '../src/styles/phone.css'), 'utf8');

test('phone bottom-bar icons share one fixed-height box so labels line up', () => {
  const rule = phone.match(/\.pub-shell \.mnav-ic\s*\{([^}]*)\}/);
  expect(rule).not.toBeNull();
  expect(rule[1]).toMatch(/height:\s*var\(--text-xl\)/);
  expect(rule[1]).toMatch(/place-items:\s*center/);
});
