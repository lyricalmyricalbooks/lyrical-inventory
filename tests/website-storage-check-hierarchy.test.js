import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from 'vitest';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const css = readFileSync(path.join(__dirname, '../src/styles/website-link.css'), 'utf8');

test('storage-check rows step the reason down beneath a bold book title', () => {
  const title = css.match(/\.wl-item > strong:not\(\[class\]\)\s*\{([^}]*)\}/);
  const reason = css.match(/\.wl-item > span:not\(\[class\]\)\s*\{([^}]*)\}/);
  expect(title).not.toBeNull();
  expect(reason).not.toBeNull();
  expect(title[1]).toMatch(/font-weight:\s*700/);
  expect(title[1]).toMatch(/font-size:\s*var\(--text-base\)/);
  expect(reason[1]).toMatch(/font-size:\s*var\(--text-sm\)/);
  expect(reason[1]).toMatch(/color:\s*var\(--content-secondary\)/);
});
