import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from 'vitest';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const styles = readFileSync(path.join(__dirname, '../src/style.css'), 'utf8');

test('POS book card rest state uses the themed elevation token, not a raw shadow', () => {
  const restRule = styles.match(/\.pos-card\s*\{\s*\n\s*background: var\(--surface-card[\s\S]*?\n\}/);

  expect(restRule).not.toBeNull();
  expect(restRule[0]).toMatch(/box-shadow:\s*var\(--elev-2\)/);
  expect(restRule[0]).not.toMatch(/box-shadow:\s*\d/);
});

test('POS book card hover lift uses the themed elevation token, not a raw shadow', () => {
  const hoverRule = styles.match(/\.pos-card:hover\s*\{([\s\S]*?)\n\}/);

  expect(hoverRule).not.toBeNull();
  expect(hoverRule[1]).toMatch(/box-shadow:\s*var\(--elev-hover\)/);
  expect(hoverRule[1]).not.toMatch(/box-shadow:\s*\d/);
});
