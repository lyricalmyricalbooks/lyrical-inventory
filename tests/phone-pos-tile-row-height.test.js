import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from 'vitest';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const phone = readFileSync(path.join(__dirname, '../src/styles/phone.css'), 'utf8');

test('phone register tiles stretch to the row so both share one bottom edge', () => {
  const add = phone.match(/\.fm-tile-add\s*\{([\s\S]*?)\n\s*\}/);
  expect(add).not.toBeNull();
  expect(add[1]).toMatch(/height:\s*100%;/);
  expect(phone).toMatch(/\.fm-tile-price\s*\{\s*margin-top:\s*auto;/);
});
