import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from 'vitest';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const phone = readFileSync(path.join(__dirname, '../src/styles/phone.css'), 'utf8');

// The body of the last rule for an exact selector that sets `prop` (the one
// that wins for it; reduced-motion blocks repeat selectors for transitions).
function rule(selector, prop = '') {
  const esc = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const all = [...phone.matchAll(new RegExp(`(?:^|\\n)\\s*${esc}\\s*\\{([^}]*)\\}`, 'g'))];
  const hits = all.filter((m) => m[1].includes(prop));
  expect(hits.length, selector).toBeGreaterThan(0);
  return hits[hits.length - 1][1];
}

test('pop-up close buttons are square, inked and press into their shadow', () => {
  const close = rule('.modal .modal-close-btn', 'border-radius');
  expect(close).toMatch(/border-radius: var\(--r2\)/);
  expect(close).toMatch(/border: var\(--stroke\) solid var\(--rule-ink\)/);
  expect(close).toMatch(/box-shadow: var\(--elev-1\)/);
  expect(rule('.modal .modal-close-btn:hover')).toMatch(/transform: none/);
  expect(rule('.modal .modal-close-btn:active')).toMatch(/transform: translate\(2px, 2px\); box-shadow: none/);
});

test('pop-up sheets have a square ink grip and square corners, like the More sheet', () => {
  expect(rule('.more-sheet-grip')).toMatch(/border-radius: 0; background: var\(--rule-ink\)/);
  expect(rule('.overlay .modal:has(> .modal-title)::before')).toMatch(/border-radius: 0; background: var\(--rule-ink\)/);
  expect(rule('.overlay .modal')).toMatch(/border-radius: 0/);
});

test('record cards inside pop-ups get the same Riso card as on pages', () => {
  expect(rule(':is(.tab-panel, .modal) .phone-records tr.phone-record', 'box-shadow')).toMatch(/border: var\(--stroke\) solid var\(--border-strong\)/);
  expect(phone).not.toMatch(/^\s*\.tab-panel \.phone-record/m);
});

test('register sub-tabs ink in the current one and press in instead of shrinking', () => {
  expect(rule('#tab-pos .pos-subtab-btn.active')).toMatch(/background: var\(--surface-inverse\); color: var\(--content-on-inverse\)/);
  expect(rule('#tab-pos .pos-subtab-btn:active')).toMatch(/transform: translate\(2px, 2px\)/);
  expect(rule('#tab-pos .pos-subtab-btn:hover')).toMatch(/transform: none/);
});
