import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from 'vitest';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const phone = readFileSync(path.join(__dirname, '../src/styles/phone.css'), 'utf8');

test('phone Help audience switch splits the full row into two equal halves', () => {
  const rail = phone.match(/#tab-help \.help-aud\s*\{([^}]*)\}/);
  const btn = phone.match(/#tab-help \.help-aud-btn\s*\{([^}]*)\}/);
  expect(rail).not.toBeNull();
  expect(btn).not.toBeNull();
  expect(rail[1]).toMatch(/display:\s*grid;/);
  expect(rail[1]).toMatch(/grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/);
  expect(btn[1]).toMatch(/min-width:\s*0;/);
});
