import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from 'vitest';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const phone = readFileSync(path.join(__dirname, '../src/styles/phone.css'), 'utf8');
const styles = readFileSync(path.join(__dirname, '../src/style.css'), 'utf8');
const html = readFileSync(path.join(__dirname, '../index.html'), 'utf8');

test('Payment QR codes title tail sits on its own line on a phone, with no stranded dash', () => {
  expect(html).toMatch(/Payment QR codes<span class="hed-tail">all books<\/span>/);
  // Desktop keeps the dash inline; the phone drops it and breaks the line.
  expect(styles).toMatch(/\.qr-page \.hed-tail::before\s*\{[^}]*content:\s*' \\2014/);
  expect(phone).toMatch(/#tab-qrcodes \.hed-tail\s*\{[^}]*display:\s*block;/);
  expect(phone).toMatch(/#tab-qrcodes \.hed-tail::before\s*\{\s*content:\s*none;/);
});
