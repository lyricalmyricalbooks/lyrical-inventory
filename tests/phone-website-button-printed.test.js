import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from 'vitest';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const phone = readFileSync(path.join(__dirname, '../src/styles/phone.css'), 'utf8');

test('phone header Website button matches the book picker: offset shadow, caps, press-in', () => {
  const rest = phone.match(/\.pub-shell \.app-header \.app-switch-pill\s*\{([\s\S]*?)\n  \}/);
  const press = phone.match(/\.pub-shell \.app-header \.app-switch-pill:active\s*\{([^}]*)\}/);
  expect(rest).not.toBeNull();
  expect(press).not.toBeNull();
  expect(rest[1]).toMatch(/box-shadow:\s*3px 3px 0/);
  expect(rest[1]).toMatch(/text-transform:\s*uppercase/);
  expect(rest[1]).toMatch(/font-weight:\s*800/);
  expect(press[1]).toMatch(/translate\(3px,\s*3px\)/);
  expect(press[1]).toMatch(/box-shadow:\s*none/);
});
