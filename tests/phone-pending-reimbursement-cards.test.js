import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from 'vitest';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const phone = readFileSync(path.join(__dirname, '../src/styles/phone.css'), 'utf8');

test('phone pending reimbursement cards lead with the amount and share one button width', () => {
  expect(phone).toMatch(/#d-pending-expenses-list \.pending-card-num\s*\{[^}]*font-size:\s*var\(--text-lg\)/);
  expect(phone).toMatch(/#d-pending-expenses-list \.pending-card-actions\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)/);
  expect(phone).toMatch(/#d-pending-expenses-list \.pending-card-actions \.btn\s*\{[^}]*width:\s*100%/);
  expect(phone).toMatch(/#d-pending-expenses-list \.pending-card\s*\{[^}]*var\(--rule-ink\)/);
});
