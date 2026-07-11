import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';

const styles = readFileSync(new URL('../src/style.css', import.meta.url), 'utf8');

test('book overview cards use each book accent as a subtle surface tint', () => {
  expect(styles).toMatch(
    /\.book-strip\s*\{[^}]*background:\s*color-mix\(in srgb, var\(--accent-color\) 7%, var\(--surface-card\)\);/s,
  );
});
