import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from 'vitest';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const phone = readFileSync(path.join(__dirname, '../src/styles/phone.css'), 'utf8');

test('banner hint line reads left-aligned on a phone for every banner, not just the artist one', () => {
  const rule = phone.match(/#d-expenses-sect\s+\.metric-banner-hint\s*\{([^}]*)\}/);
  expect(rule).not.toBeNull();
  expect(rule[1]).toMatch(/text-align:\s*left;/);
  expect(phone).toMatch(/#artist-reimburse-banner\s+\.metric-banner-hint\s*\{\s*text-align:\s*left;/);
});
