import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';

const phone = readFileSync('src/styles/phone.css', 'utf8');
const main = readFileSync('src/main.js', 'utf8');

test('phone pending reimbursement: description leads on its own line, no typed dots', () => {
  expect(phone).toMatch(/#d-pending-expenses-list \.pending-card-desc\s*\{[^}]*order:\s*-1;[^}]*flex:\s*1 0 100%/);
  expect(phone).toMatch(/#d-pending-expenses-list \.pending-card-sep\s*\{[^}]*display:\s*none/);
  expect(phone).toMatch(/#d-pending-expenses-list \.pending-card-meta\s*\{[^}]*flex-wrap:\s*wrap/);
});

test('the meta line marks its separators so the phone can drop them', () => {
  expect(main).toMatch(/class="pending-card-sep" aria-hidden="true"/);
});
