import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from 'vitest';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const phone = readFileSync(path.join(__dirname, '../src/styles/phone.css'), 'utf8');

test('phone Audience actions share one full-width rail', () => {
  expect(phone).toMatch(/#tab-customers div:has\(> #cust-stripe-btn\)\s*\{[^}]*width:\s*100%;/);
  expect(phone).toMatch(/#tab-customers #cust-stripe-btn\s*\{[^}]*flex:\s*1 1 100%;/);
  expect(phone).toMatch(/#tab-customers \.cust-fold-toggle\s*\{[^}]*width:\s*100%;[^}]*min-height:\s*44px;/);
  expect(phone).toMatch(/#tab-customers \.cust-export-fold\s*\{[^}]*flex:\s*1 1 100%;/);
});
