import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from 'vitest';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const styles = readFileSync(path.join(__dirname, '../src/style.css'), 'utf8');
const mainJs = readFileSync(path.join(__dirname, '../src/main.js'), 'utf8');

test('attached-receipt chip uses a themed surface, not a fixed white overlay', () => {
  const chip = styles.match(/\.exp-receipt-chip\s*\{([\s\S]*?)\}/);
  expect(chip).not.toBeNull();
  expect(chip[1]).toMatch(/background:\s*var\(--surface-inset\)/);
  expect(chip[1]).toMatch(/border:\s*1px solid var\(--border-default\)/);
});

test('the receipt row template renders the themed chip class, not inline white-overlay styles', () => {
  const fn = mainJs.match(/function renderEditExpenseReceipts\(\)\s*\{([\s\S]*?)\n\}/);
  expect(fn).not.toBeNull();
  expect(fn[1]).toMatch(/class="exp-receipt-chip"/);
  // The bug this guards: rgba(255,255,255,...) assumes a dark parent surface and
  // is nearly invisible against the app's light-mode cream modal background.
  expect(fn[1]).not.toMatch(/rgba\(255,\s*255,\s*255,/);
});
