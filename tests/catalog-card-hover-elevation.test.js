import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from 'vitest';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const styles = readFileSync(path.join(__dirname, '../src/style.css'), 'utf8');

test('catalog card hover lift uses the themed elevation token, not a raw shadow', () => {
  const hoverRule = styles.match(/\.catalog-card:hover\s*\{([\s\S]*?)\n\}/);

  expect(hoverRule).not.toBeNull();
  expect(hoverRule[1]).toMatch(/box-shadow:\s*var\(--elev-hover\);/);
  expect(hoverRule[1]).not.toMatch(/box-shadow:\s*\d/);
});
