import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from 'vitest';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const phone = readFileSync(path.join(__dirname, '../src/styles/phone.css'), 'utf8');

test('phone consignment summary: outstanding stock leads, the other two share a row', () => {
  const block = phone.match(/@media \(max-width: 768px\) \{\s*\.consignment-stat-grid([\s\S]*?)\n\}/);
  expect(block).not.toBeNull();
  expect(block[0]).toMatch(/\.consignment-stat-grid\s*\{[^}]*repeat\(2,\s*minmax\(0,\s*1fr\)\)/);
  expect(block[0]).toMatch(/\.consignment-stat-card\.focus\s*\{\s*grid-column:\s*1\s*\/\s*-1/);
  expect(block[0]).toMatch(/:not\(\.focus\)\s*\.consignment-stat-icon-wrap\s*\{\s*display:\s*none/);
});
