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

// The channel badge on every Order History row (.ch-pos/.ch-store) fills and
// borders itself with a color-mix() of the same token its label uses, so the fill
// repaints with the theme. A frozen rgba() here left dark-mode labels on a
// near-black tint they could not be read against.
//
// Colour rule for channel tags: red and amber are reserved for problems, so Store
// is an info tag (blue, --status-info) and Website / Direct keep the neutral base
// tag with no hue of their own.
const modifiers = [
  { selector: '.ch-badge.ch-pos', token: 'green' },
  { selector: '.ch-badge.ch-store', token: 'status-info' },
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

test('Website and Direct channel tags are neutral, not violet or slate', () => {
  expect(styles).not.toMatch(/\.ch-badge\.ch-(bc|direct)\s*\{/);
  const store = styles.match(/\.ch-badge\.ch-store\s*\{([\s\S]*?)\n\}/);
  expect(store[1]).not.toMatch(/--gold|--violet|--slate/);
});
