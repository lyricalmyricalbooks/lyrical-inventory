import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from 'vitest';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const phone = readFileSync(path.join(__dirname, '../src/styles/phone.css'), 'utf8');

test('phone Payment QR cards share one light shadow, a compact empty card and a square status tag', () => {
  expect(phone).toMatch(/#tab-qrcodes \.qr-card \{ box-shadow: var\(--elev-1\); \}/);
  expect(phone).toMatch(/#tab-qrcodes \.qr-card\.is-empty \{ padding: var\(--space-4\);/);
  expect(phone).toMatch(/#tab-qrcodes \.qr-card-status \{ border-radius: var\(--r2\);/);
});
