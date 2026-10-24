import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from 'vitest';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const phone = readFileSync(path.join(__dirname, '../src/styles/phone.css'), 'utf8');

test('on a phone the payment QR card title leads in display lettering', () => {
  const rule = phone.match(/#tab-qrcodes \.qr-card-title\s*\{([^}]*)\}/);
  expect(rule, 'phone .qr-card-title rule').not.toBeNull();
  expect(rule[1]).toMatch(/font-family:\s*var\(--font-display\)/);
  expect(rule[1]).toMatch(/font-size:\s*var\(--text-lg\)/);
  expect(rule[1]).toMatch(/text-transform:\s*uppercase/);
});
