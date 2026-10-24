import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from 'vitest';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const phone = readFileSync(path.join(__dirname, '../src/styles/phone.css'), 'utf8');

test('phone Order History header stretches so Import reaches the card edge', () => {
  expect(phone).toMatch(/#tab-history > \.row-between \{ align-items: stretch;/);
  expect(phone).toMatch(/#tab-history > \.row-between > div \{ width: 100%; \}/);
  expect(phone).toMatch(/#tab-history #import-btn \{ width: 100%;/);
  expect(phone).toMatch(/#tab-history > \.row-between \.save-indicator:not\(\.show\) \{ display: none; \}/);
});
