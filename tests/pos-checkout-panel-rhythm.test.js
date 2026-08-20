import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from 'vitest';

// Resolved via __dirname rather than `new URL(..., import.meta.url)`: under the
// jsdom test environment the global URL is jsdom's, and node:fs / fileURLToPath
// reject a foreign URL object with "must be of scheme file". Matches how the
// rest of tests/ does it.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const styles = readFileSync(path.join(__dirname, '../src/style.css'), 'utf8');
const html = readFileSync(path.join(__dirname, '../index.html'), 'utf8');

/** Last rule block for a selector — the panel is declared twice by design. */
function lastBlock(selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const matches = [...styles.matchAll(new RegExp(`(?:^|\\n)${escaped}\\s*\\{([\\s\\S]*?)\\n\\}`, 'g'))];
  expect(matches.length, `no rule found for ${selector}`).toBeGreaterThan(0);
  return matches[matches.length - 1][1];
}

test('checkout panel spaces its stages further apart than the rows inside one', () => {
  // The whole point of the change: between-group space must exceed
  // within-group space, or the four stages of a sale don't read as stages.
  expect(lastBlock('.pos-cart-panel')).toMatch(/gap:\s*var\(--space-5\);/);
  const stage = lastBlock('.pos-checkout-stage');
  expect(stage).toMatch(/flex-direction:\s*column;/);
  expect(stage).toMatch(/gap:\s*var\(--space-2\);/);
  // Guards the mixed-currency total against stretching the sticky column.
  expect(stage).toMatch(/min-width:\s*0;/);
});

test('the sale total is a tabular mono figure, not proportional heading type', () => {
  const total = lastBlock('.pos-checkout-total');
  expect(total).toMatch(/font-family:\s*'DM Mono',\s*monospace;/);
  expect(total).toMatch(/font-variant-numeric:\s*tabular-nums;/);
  expect(total).toMatch(/font-feature-settings:\s*"tnum"\s*1,\s*"zero"\s*1;/);
  // Leads the panel on size, and wraps instead of overflowing when FX rates
  // are missing and it prints two currencies.
  expect(total).toMatch(/font-size:\s*var\(--text-3xl\);/);
  expect(total).toMatch(/overflow-wrap:\s*anywhere;/);
  // Green is the settled/paid role in this app; a pending cart total taking it
  // put a third accent colour on a panel that already has gold and the
  // live-rates line.
  expect(total).toMatch(/color:\s*var\(--content-primary\);/);
  expect(total).not.toMatch(/var\(--green\)/);
});

test('the section heading outranks the field labels it sits above', () => {
  expect(lastBlock('.pos-checkout-eyebrow')).toMatch(/font-size:\s*var\(--text-xs\);/);
  expect(lastBlock('.pos-checkout-label')).toMatch(/font-size:\s*var\(--text-3xs\);/);
});

test('both summary plates share one treatment', () => {
  const plate = lastBlock('.pos-checkout-plate');
  expect(plate).toMatch(/border-radius:\s*var\(--r2\);/);
  expect(plate).toMatch(/background:\s*var\(--surface-sunken\);/);
  expect(plate).toMatch(/padding:\s*var\(--space-2\)\s+var\(--space-3\);/);
  // Both the currency row and the itemised subtotal must actually wear it.
  expect(html).toMatch(/class="pos-checkout-plate pos-checkout-ccy"/);
  expect(html).toMatch(/id="pos-subtotal-lines" class="pos-checkout-plate pos-checkout-subtotal"/);
});

test('the checkout column carries no inline styling of its own', () => {
  const panel = html.match(/<div class="card pos-cart-panel"[\s\S]*?\n {6}<\/div>/);
  expect(panel).not.toBeNull();
  const body = panel[0];
  // The one exception is the sticky offset on the panel element itself.
  const inlineStyles = [...body.matchAll(/style="([^"]*)"/g)].map((m) => m[1]);
  expect(inlineStyles).toEqual(['position:sticky;top:88px;']);
  // Complete Sale reuses the house 44px hero CTA rather than a bespoke size.
  expect(body).toMatch(/class="btn gold lg pos-checkout-cta" id="pos-checkout-btn"/);
  // Four stages: rates, total, lines, pay.
  expect(body.match(/class="pos-checkout-stage"/g)).toHaveLength(4);
});

test('every element the POS renderer writes into survived the restyle', () => {
  for (const id of [
    'pos-fx-status', 'pos-currency', 'pos-total', 'pos-total-note',
    'pos-cart-items', 'pos-subtotal-lines', 'pos-payment-method',
    'pos-oversell-note', 'pos-checkout-btn', 'pos-sale-qr-btn',
  ]) {
    expect(html, `#${id} is written by renderPOS() and must stay in the markup`)
      .toMatch(new RegExp(`id="${id}"`));
  }
});
