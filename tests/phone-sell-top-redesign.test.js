import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from 'vitest';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const phone = readFileSync(path.join(__dirname, '../src/styles/phone.css'), 'utf8');
const html = readFileSync(path.join(__dirname, '../index.html'), 'utf8');

// The Fair Mode phase 2 block (upload status, today's total) runs from its
// comment to the Register currency switch; the Sell rules under test sit inside it.
const phoneBlock = phone.slice(phone.indexOf('Fair Mode, phase 2'), phone.indexOf('/* Register currency switch'));

test('the heading keeps its title and the Record another sale link on one line', () => {
  expect(html).toMatch(/<div class="phone-sell-head"><div><div class="phone-eyebrow">At the counter<\/div><h1>Sell<\/h1><\/div><button type="button" class="btn" onclick="switchTab\('manual'\)">Record another sale ↗<\/button><\/div>/);
  expect(phone).toMatch(/#tab-pos \.phone-sell-head \.phone-eyebrow \{ display: none; \}/);
  expect(phone).toMatch(/#tab-pos \.phone-sell-head \.btn \{ flex: none; min-height: 44px;/);
});

test('the fair-kit toggle shows a short phone label and keeps the full name for screen readers', () => {
  expect(html).toMatch(/<span class="pos-subtab-full">Fair Print Kit &amp; Stall Prep<\/span><span class="pos-subtab-short" aria-hidden="true">Fair kit<\/span>/);
  expect(phone).toMatch(/\.pos-subtab-short \{ display: none; \}/);
  expect(phone).toMatch(/#tab-pos \.pos-subtab-short \{ display: inline; \}/);
  // Hidden with clip, not display:none, so assistive tech still reads the full label.
  expect(phone).toMatch(/#tab-pos \.pos-subtab-full \{[^}]*clip: rect\(0 0 0 0\)/);
  expect(phone).not.toMatch(/#tab-pos \.pos-subtab-full \{[^}]*display: none/);
});

test('the fair name and currency share one row, and upload status and today share another', () => {
  expect(html).toMatch(/<div class="fm-row fm-row-fair">[\s\S]*?id="fm-fair-btn"[\s\S]*?class="fm-ccy"/);
  expect(html).toMatch(/<div class="fm-row fm-row-status">\s*<span class="fm-sync" id="fm-sync"[\s\S]*?id="fm-today-btn"/);
  expect(phoneBlock).toMatch(/\.fm-row \{ display: flex; align-items: center;/);
  expect(phoneBlock).toMatch(/\.fm-row-fair > \.fm-fair-btn \{ flex: 1 1 auto; min-width: 0; \}/);
  expect(phoneBlock).toMatch(/\.fm-row-status > \.fm-today-btn \{ flex: 1 1 auto; min-width: 0; \}/);
});

test('upload status is a square ink slab, not a rounded pill, on the Sell screen', () => {
  expect(phone).toMatch(/#tab-pos \.fm-sync \{\s*min-height: 44px; border-radius: var\(--r2\); border: var\(--stroke\) solid var\(--rule-ink\);/);
  expect(phone).toMatch(/#tab-pos \.fm-sync\[data-tone="offline"\] \{ border-color: var\(--gold-text\)/);
  expect(phone).toMatch(/#tab-pos \.fm-sync\[data-tone="failed"\] \{ border-color: var\(--red\)/);
});

test('book tiles drop the 128px floor to the 88px tap-area minimum', () => {
  expect(phone).toMatch(/\.fm-tile-add \{\s*display: flex;[^}]*min-height: 88px; padding: var\(--space-3\);/);
  expect(phone).not.toMatch(/min-height: 128px/);
});

test('the in-cart tile keeps room for its minus button', () => {
  expect(phone).toMatch(/\.fm-tile\.is-in-cart \.fm-tile-add \{ padding-bottom: calc\(48px \+ var\(--space-2\) \* 2\); \}/);
});

