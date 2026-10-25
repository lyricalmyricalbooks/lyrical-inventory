import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from 'vitest';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const phone = readFileSync(path.join(__dirname, '../src/styles/phone.css'), 'utf8');

test('phone buyer card puts +List, Unsubscribe and Details on one row', () => {
  expect(phone).toMatch(/td\[data-phone-label="Action"\]\s*\{[^}]*grid-column:\s*1 !important;[^}]*grid-row:\s*3 !important;/);
  expect(phone).toMatch(/#cust-body > tr\.phone-record > td\.phone-record-lead > \.phone-record-toggle\s*\{[^}]*grid-column:\s*2 !important;[^}]*grid-row:\s*3 !important;/);
});

test('the buttons in that row can shrink so the longest label stays inside its border', () => {
  expect(phone).toMatch(/td\[data-phone-label="Action"\] \.btn\s*\{[^}]*min-width:\s*0;/);
});
