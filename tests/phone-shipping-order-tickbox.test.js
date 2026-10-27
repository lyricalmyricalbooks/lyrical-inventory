import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from 'vitest';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const phone = readFileSync(path.join(__dirname, '../src/styles/phone.css'), 'utf8');
const shipping = readFileSync(path.join(__dirname, '../src/features/shipping.js'), 'utf8');

test('shipping ledger tick-boxes sit inside a 44px label on a phone', () => {
  const rule = phone.match(/#tab-shipping #ship-analysis-hub \.ship-check-hit \{([^}]*)\}/);
  expect(rule).not.toBeNull();
  expect(rule[1]).toMatch(/width: 44px; height: 44px/);
  expect(rule[1]).toMatch(/margin: -11px auto/);
});

test('both the row boxes and select-all are wrapped in the tap label', () => {
  expect(shipping).toMatch(/<label class="ship-check-hit"><input type="checkbox" class="ship-order-checkbox"/);
  expect(shipping).toMatch(/<label class="ship-check-hit"><input type="checkbox" id="selectAllShipOrders"/);
});
test('on/off switches are square inked slots with a square knob on a phone', () => {
  const track = phone.match(/:is\(\.switch \.track, \.pm-switch \.pm-track\) \{([^}]*)\}/);
  expect(track).not.toBeNull();
  expect(track[1]).toMatch(/border: var\(--stroke\) solid var\(--rule-ink\)/);
  expect(track[1]).toMatch(/border-radius: 0/);
  const knob = phone.match(/:is\(\.switch \.track, \.pm-switch \.pm-track\)::before \{([^}]*)\}/);
  expect(knob).not.toBeNull();
  expect(knob[1]).toMatch(/border-radius: 0/);
  expect(knob[1]).toMatch(/background: var\(--rule-ink\)/);
  // The dark-mode rim is a more specific rule, so only !important removes it.
  expect(knob[1]).toMatch(/box-shadow: none !important/);
});

test('the knob still travels the full slot when on, and has a focus ring', () => {
  expect(phone).toMatch(/input:checked \+ :is\(\.track, \.pm-track\)::before \{ transform: translateX\(18px\)/);
  expect(phone).toMatch(/input:focus-visible \+ :is\(\.track, \.pm-track\) \{ outline: 2px solid var\(--gold-text\)/);
});
