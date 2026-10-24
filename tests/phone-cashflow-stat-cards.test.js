import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from 'vitest';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const phone = readFileSync(path.join(__dirname, '../src/styles/phone.css'), 'utf8');

test('phone cash-flow headline cards sit the icon beside the figure', () => {
  const card = phone.match(/#tc-cf-stats \.cf-stat \{([^}]*)\}/);
  const top = phone.match(/#tc-cf-stats \.cf-stat-top \{([^}]*)\}/);
  const icon = phone.match(/#tc-cf-stats \.cf-ic \{([^}]*)\}/);
  expect(card).not.toBeNull();
  expect(card[1]).toMatch(/display:\s*grid;/);
  expect(card[1]).toMatch(/grid-template-columns:\s*30px\s+minmax\(0,\s*1fr\)\s+auto;/);
  expect(top[1]).toMatch(/display:\s*contents;/);
  expect(icon[1]).toMatch(/grid-row:\s*1\s*\/\s*span\s*3;/);
});

test('an odd last cash-flow figure takes the full row on a phone', () => {
  expect(phone).toMatch(/#tc-cf-kpis > :last-child:nth-child\(odd\) \{ grid-column: 1 \/ -1; \}/);
});
