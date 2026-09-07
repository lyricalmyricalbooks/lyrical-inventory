import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from 'vitest';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const styles = readFileSync(path.join(__dirname, '../src/style.css'), 'utf8');
const html = readFileSync(path.join(__dirname, '../index.html'), 'utf8');

test('Sheets Connection card carries the same gold accent as its Settings siblings', () => {
  const rule = styles.match(/\.sheets-setup\{([\s\S]*?)\}/);
  expect(rule).not.toBeNull();
  expect(rule[1]).toMatch(/border-left:\s*3px solid var\(--gold-line\);/);
});

test('Sheets Connection heading uses the shared .sec-head component, not a hand-rolled Playfair label', () => {
  const card = html.match(/<div class="sheets-setup" id="sheets-setup-card">([\s\S]*?)<!-- Connection Inputs/);
  expect(card).not.toBeNull();
  const head = card[1];

  expect(head).toMatch(/class="sec-head cat-settings-head"/);
  expect(head).toMatch(/class="sec-kicker"/);
  expect(head).toMatch(/class="section-hed sec-head-title"/);
  expect(head).toMatch(/class="section-subcopy"/);
  expect(head).toContain('Connect Google Sheets');

  // The old hand-rolled inline heading must be gone — it's what made this card
  // read as unfinished next to the Book Catalog / Profit Tiers sub-tabs.
  expect(head).not.toMatch(/font-family:'Playfair Display',serif;font-size:18px/);
});
