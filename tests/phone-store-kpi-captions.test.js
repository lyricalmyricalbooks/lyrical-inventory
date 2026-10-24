import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from 'vitest';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const phone = readFileSync(path.join(__dirname, '../src/styles/phone.css'), 'utf8');

test('phone store-card captions stay on one line so every figure shares a baseline', () => {
  const caption = phone.match(/#tab-consignment \.store-kpis \.sk-l\s*\{([^}]*)\}/);
  expect(caption).not.toBeNull();
  expect(caption[1]).toMatch(/white-space:\s*nowrap/);
  expect(caption[1]).toMatch(/letter-spacing:\s*var\(--tracking-caps\)/);
});
