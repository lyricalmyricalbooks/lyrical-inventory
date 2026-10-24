import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from 'vitest';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const phone = readFileSync(path.join(__dirname, '../src/styles/phone.css'), 'utf8');

test('help topic buttons form an even two-column grid on a phone', () => {
  const grid = phone.match(/#tab-help \.help-topics\s*\{([^}]*)\}/);
  expect(grid).not.toBeNull();
  expect(grid[1]).toMatch(/display:\s*grid;/);
  expect(grid[1]).toMatch(/grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/);
  expect(phone).toMatch(/\.help-tool-btn:last-child:nth-child\(odd\)\s*\{\s*grid-column:\s*1\s*\/\s*-1;/);
});
