import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from 'vitest';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const phone = readFileSync(path.join(__dirname, '../src/styles/phone.css'), 'utf8');
const main = readFileSync(path.join(__dirname, '../src/main.js'), 'utf8');

test('to-do group heads keep the count beside the label on a phone', () => {
  const rule = phone.match(/\.tab-panel \.sec-head\.is-inline\s*\{([^}]*)\}/);
  expect(rule).not.toBeNull();
  expect(rule[1]).toMatch(/flex-direction:\s*row;/);
  expect(rule[1]).toMatch(/align-items:\s*center;/);
  expect(phone).toMatch(/\.sec-head\.is-inline \.sec-kicker\s*\{\s*margin-bottom:\s*0;/);
  expect(main).toMatch(/class="sec-head is-muted is-inline"/);
});
