import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from 'vitest';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const phone = readFileSync(path.join(__dirname, '../src/styles/phone.css'), 'utf8');

test('phone All tools sheet lays its tiles out two to a row, with labels free to wrap', () => {
  expect(phone).toMatch(/\.more-sheet-body \.pub-nav \{ grid-template-columns: repeat\(2, minmax\(0, 1fr\)\); \}/);
  expect(phone).not.toMatch(/\.more-sheet-body \.pub-nav \{ grid-template-columns: minmax\(0, 1fr\); \}/);
  expect(phone).toMatch(/\.more-sheet-body \.snav-label \{[^}]*min-width: 0;[^}]*overflow-wrap: break-word;/);
});
