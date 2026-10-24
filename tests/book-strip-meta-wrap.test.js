import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from 'vitest';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const styles = readFileSync(path.join(__dirname, '../src/style.css'), 'utf8');
const main = readFileSync(path.join(__dirname, '../src/main.js'), 'utf8');

test('book card facts wrap on space, never leaving a stranded "·" at the start of a line', () => {
  const rule = styles.match(/\.book-strip-meta\s*\{([\s\S]*?)\n\}/);
  expect(rule).not.toBeNull();
  expect(rule[1]).toMatch(/flex-wrap:\s*wrap;/);
  expect(rule[1]).toMatch(/gap:\s*2px\s+var\(--space-4\);/);
  const strip = main.slice(main.indexOf('class="book-strip-meta"'), main.indexOf('class="book-progress-wrapper"'));
  expect(strip).not.toContain('&nbsp;·&nbsp;');
});
