import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from 'vitest';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const styles = readFileSync(path.join(__dirname, '../src/style.css'), 'utf8');

test('phone book strips put the cover beside the title in a two-column grid', () => {
  const at = styles.indexOf('.book-strip-info { display: contents; }');
  expect(at).toBeGreaterThan(0);
  const block = styles.slice(at - 700, at + 900);
  expect(block).toMatch(/display:\s*grid;/);
  expect(block).toMatch(/grid-template-columns:\s*3\.5rem\s+minmax\(0,\s*1fr\)/);
  expect(block).toMatch(/\.book-cover-3d\s*\{[^}]*grid-row:\s*1\s*\/\s*span\s*2/);
  expect(block).toMatch(/\.book-progress-wrapper\s*\{[^}]*grid-column:\s*1\s*\/\s*-1/);
});
