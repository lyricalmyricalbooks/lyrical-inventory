import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from 'vitest';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const phone = readFileSync(path.join(__dirname, '../src/styles/phone.css'), 'utf8');

test('phone Book Catalog cards are snug, lead with the title and split the buttons evenly', () => {
  expect(phone).toMatch(/#tab-sheets \.catalog-card \{ padding: var\(--space-3\) var\(--space-4\);/);
  expect(phone).toMatch(/#tab-sheets \.catalog-info h4 \{[^}]*font-family: var\(--font-display\);[^}]*text-transform: uppercase/);
  expect(phone).toMatch(/#tab-sheets \.catalog-actions \{ display: grid; grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
});
