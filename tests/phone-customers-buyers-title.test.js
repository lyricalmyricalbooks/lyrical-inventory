import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from 'vitest';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const phone = readFileSync(path.join(__dirname, '../src/styles/phone.css'), 'utf8');
const html = readFileSync(path.join(__dirname, '../index.html'), 'utf8');

test('phone Customers "All Discovered Buyers" heading is set in display capitals', () => {
  expect(html).toMatch(/class="cust-buyers-title"[^>]*>All Discovered Buyers/);
  expect(phone).toMatch(/#tab-customers \.cust-buyers-title \{[^}]*font-family: var\(--font-display\)[^}]*text-transform: uppercase/);
});
