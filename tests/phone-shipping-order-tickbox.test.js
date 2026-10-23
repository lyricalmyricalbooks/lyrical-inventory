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
