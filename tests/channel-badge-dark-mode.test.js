import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from 'vitest';

// Resolved via __dirname rather than `new URL(..., import.meta.url)`: under the
// jsdom test environment the global URL is jsdom's, and node:fs / fileURLToPath
// reject a foreign URL object with "must be of scheme file". Passing a string
// keeps node's own parser in play, and matches how the rest of tests/ does it.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const styles = readFileSync(path.join(__dirname, '../src/style.css'), 'utf8');

// The channel badge on every Order History row (.ch-bc/.ch-pos/.ch-store/.ch-direct)
// used to fill and border itself with a literal rgba() copied from the LIGHT theme's
// hex for that colour. `color` used the themed token and repainted correctly in dark
// mode, but the frozen rgba() fill/border did not, so a bright dark-mode label ended
// up on an almost-invisible near-black tint. Pinning color-mix() against the same
// token the label text uses keeps both in step across themes.
const modifiers = [
  { selector: '.ch-badge.ch-bc', token: 'violet' },
  { selector: '.ch-badge.ch-pos', token: 'green' },
  { selector: '.ch-badge.ch-store', token: 'gold' },
  { selector: '.ch-badge.ch-direct', token: 'slate' },
];

for (const { selector, token } of modifiers) {
  test(`${selector} derives its fill and border from --${token} instead of a frozen rgba()`, () => {
    const escaped = selector.replace(/\./g, '\\.');
    const rule = styles.match(new RegExp(`${escaped}\\s*\\{([\\s\\S]*?)\\n\\}`));
    expect(rule).not.toBeNull();
    expect(rule[1]).toMatch(new RegExp(`background:\\s*color-mix\\(in srgb,\\s*var\\(--${token}\\)\\s*8%,\\s*transparent\\);`));
    expect(rule[1]).toMatch(new RegExp(`border-color:\\s*color-mix\\(in srgb,\\s*var\\(--${token}\\)\\s*20%,\\s*transparent\\);`));
    expect(rule[1]).not.toMatch(/rgba\(/);
  });
}
