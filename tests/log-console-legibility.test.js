import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from 'vitest';

// Resolved via __dirname rather than `new URL(..., import.meta.url)`: under the
// jsdom test environment the global URL is jsdom's, and node:fs / fileURLToPath
// reject a foreign URL object with "must be of scheme file".
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const styles = readFileSync(path.join(__dirname, '../src/style.css'), 'utf8');
const mainJs = readFileSync(path.join(__dirname, '../src/main.js'), 'utf8');

const decl = (selector) => {
  const re = new RegExp(`\\n${selector.replace(/[.\\]/g, '\\$&')}\\s*\\{([^}]*)\\}`);
  const m = styles.match(re);
  expect(m, `missing rule for ${selector}`).not.toBeNull();
  return m[1];
};

// The console is a permanently dark well in BOTH themes (--ink goes deeper in
// theme-dark.css rather than flipping), and in light mode --text is byte-
// identical to --ink. So a log line that falls back to inherited --text is
// invisible against its own background. These two assertions are what stop a
// message kind losing its colour again.
test('every log console message kind carries an ink-readable colour', () => {
  expect(decl('.log-console')).toMatch(/color:\s*var\(--on-inverse-2\)/);
  expect(decl('.log-line')).toMatch(/color:\s*var\(--on-inverse-2\)/);
  expect(decl('.log-line.ok')).toMatch(/color:\s*var\(--emerald-soft\)/);
  expect(decl('.log-line.warn')).toMatch(/color:\s*var\(--orange\)/);
  // 'err' is passed by addLog callers and had no rule at all before this.
  expect(decl('.log-line.err')).toMatch(/color:\s*var\(--rose-soft\)/);
});

test('no log colour is taken from a surface token that flips out from under it', () => {
  for (const sel of ['.log-console', '.log-line', '.log-line.ok', '.log-line.warn', '.log-line.err', '.log-time']) {
    expect(decl(sel)).not.toMatch(/color:\s*var\(--(cream|text)[\d)]/);
  }
});

// The timestamp gutter is what gives a column of messages one shared left edge.
// Dropping the fixed inline size lets each message start wherever its own clock
// string happened to end.
test('the timestamp recedes into a fixed gutter so messages share a left edge', () => {
  const time = decl('.log-time');
  expect(time).toMatch(/display:\s*inline-block/);
  expect(time).toMatch(/min-width:\s*14ch/);
  expect(time).toMatch(/color:\s*var\(--on-inverse-3\)/);
  expect(time).toMatch(/font-variant-numeric:\s*tabular-nums/);
});

test('addLog emits the timestamp as its own element, still as text', () => {
  const fn = mainJs.match(/export function addLog\(lid, msg, type = ''\) \{([\s\S]*?)\n\}/);
  expect(fn).not.toBeNull();
  expect(fn[1]).toMatch(/className = 'log-time'/);
  expect(fn[1]).toMatch(/createTextNode\(msg\)/);
  // Never innerHTML — a scan failure message can carry arbitrary text.
  expect(fn[1]).not.toMatch(/innerHTML/);
});
