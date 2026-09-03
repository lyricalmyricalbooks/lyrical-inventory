import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from 'vitest';

// See book-strip-kpi-alignment.test.js: jsdom's URL is not accepted by node:fs.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const styles = readFileSync(path.join(__dirname, '../src/style.css'), 'utf8');

test('book overview cards use each book accent as a subtle surface tint', () => {
  expect(styles).toMatch(
    /\.book-strip\s*\{[^}]*background:\s*color-mix\(in srgb, var\(--accent-color\) 7%, var\(--surface-raised\)\);/s,
  );
});
