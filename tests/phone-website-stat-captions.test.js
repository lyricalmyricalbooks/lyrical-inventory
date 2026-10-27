import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from 'vitest';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const phone = readFileSync(path.join(__dirname, '../src/styles/phone.css'), 'utf8');

test('phone website fact captions reserve two lines with tighter tracking', () => {
  const rule = phone.match(/#tab-website \.wl-fact dt\s*\{([^}]*)\}/);
  expect(rule).not.toBeNull();
  expect(rule[1]).toMatch(/min-height:\s*2lh/);
  expect(rule[1]).toMatch(/letter-spacing:\s*\.06em/);
});

test('phone website status tags are square outlined tags at a readable size', () => {
  const rule = phone.match(/#tab-website \.wl-chip\s*\{([^}]*)\}/)?.[1] ?? '';
  expect(rule).toMatch(/border:\s*var\(--stroke-hair\) solid currentColor/);
  expect(rule).toMatch(/border-radius:\s*var\(--r2\)/);
  expect(rule).not.toMatch(/r-pill/);
  expect(rule).toMatch(/font-size:\s*var\(--text-xs\)/);
});

test('phone Website notes put their opening status tag on its own line with a gap', () => {
  const rule = phone.match(/#tab-website \.wl-note > \.wl-chip:first-child\s*\{([^}]*)\}/);
  expect(rule).not.toBeNull();
  expect(rule[1]).toMatch(/display:\s*flex;/);
  expect(rule[1]).toMatch(/width:\s*fit-content;/);
  expect(rule[1]).toMatch(/margin-bottom:\s*var\(--space-2\);/);
});
