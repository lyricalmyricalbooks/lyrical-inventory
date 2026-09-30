import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from 'vitest';

// The review inbox was built before it got a Riso pass: lozenge filters, a hairline
// detail pane and a plain bold title. These pin the house treatment so a later edit
// to the inbox doesn't quietly slide it back.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const inbox = readFileSync(path.join(__dirname, '../src/styles/review-inbox.css'), 'utf8');
const dark = readFileSync(path.join(__dirname, '../src/styles/theme-dark.css'), 'utf8');

const block = (css, selector) => {
  const esc = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const m = css.match(new RegExp(`(?:^|\\n)${esc}\\s*\\{([^}]*)\\}`));
  expect(m, `${selector} rule`).not.toBeNull();
  return m[1];
};

test('filters are squared Riso tabs with an ink outline, not lozenges', () => {
  const rule = block(inbox, '.ri-filter');
  expect(rule).toMatch(/border-radius:\s*var\(--r2\)/);
  expect(rule).toMatch(/border:\s*var\(--stroke\) solid var\(--border-strong\)/);
  expect(rule).toMatch(/text-transform:\s*uppercase/);
  expect(rule).not.toMatch(/999px/);
});

test('the active filter is inked in, with text meant for a dark fill', () => {
  const rule = block(inbox, '.ri-filter.is-active');
  expect(rule).toMatch(/background:\s*var\(--surface-inverse\)/);
  expect(rule).toMatch(/color:\s*var\(--content-on-inverse\)/);
});

test('night mode gives the filters their own quiet treatment', () => {
  expect(block(dark, '.theme-dark .ri-filter')).toMatch(/box-shadow:\s*none/);
  expect(block(dark, '.theme-dark .ri-filter.is-active')).toMatch(/background:\s*var\(--cream4\)/);
});

test('the detail pane is a card and its title leads in the display face', () => {
  const pane = block(inbox, '.ri-detail');
  expect(pane).toMatch(/border:\s*var\(--stroke\) solid var\(--border-strong\)/);
  expect(pane).toMatch(/box-shadow:\s*var\(--elev-2\)/);
  const title = block(inbox, '.ri-detail-head h3');
  expect(title).toMatch(/font-family:\s*var\(--font-display\)/);
  expect(title).toMatch(/text-transform:\s*uppercase/);
});

test('status chips use the pill token, not a raw radius', () => {
  expect(inbox).not.toMatch(/999px/);
  expect(block(inbox, '.ri-chip')).toMatch(/border-radius:\s*var\(--r-pill\)/);
});
