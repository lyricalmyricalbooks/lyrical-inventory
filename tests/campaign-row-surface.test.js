import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from 'vitest';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const styles = readFileSync(path.join(__dirname, '../src/style.css'), 'utf8');

test('a campaign row reads as its own tile instead of vanishing into the card behind it', () => {
  const row = styles.match(/\.campaign-row\s*\{([\s\S]*?)\n\}/);
  const hover = styles.match(/\.campaign-row:hover\s*\{([\s\S]*?)\n\}/);

  expect(row).not.toBeNull();
  expect(hover).not.toBeNull();

  // `--card-bg` resolves to the exact same value as the `.card` it sits inside
  // in both themes, so the row needs a genuinely different surface token —
  // never the raw `--card-bg`/`#fff` fallback that made it invisible.
  expect(row[1]).toMatch(/background:\s*var\(--surface-inset\)/);
  expect(row[1]).not.toMatch(/--card-bg/);

  // Raw low-alpha rgba shadows read as nothing at all once the page itself
  // goes near-black — the themed elevation tokens stay visible in both modes.
  expect(row[1]).toMatch(/box-shadow:\s*var\(--elev-1\)/);
  expect(hover[1]).toMatch(/box-shadow:\s*var\(--elev-2\)/);
  expect(row[1]).not.toMatch(/rgba\(0,\s*0,\s*0/);
  expect(hover[1]).not.toMatch(/rgba\(0,\s*0,\s*0/);
});
