import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from 'vitest';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const darkCss = readFileSync(path.join(__dirname, '../src/styles/theme-dark.css'), 'utf8');
const styles = readFileSync(path.join(__dirname, '../src/style.css'), 'utf8');
const html = readFileSync(path.join(__dirname, '../index.html'), 'utf8');

test('night-mode paper sets its own text colour, so inherited text starts from paper ink', () => {
  // Without it, a figure with no colour of its own inherits the page's
  // near-white and lands at ~1.2:1 on paper (the write-off dialog's unit cost).
  const scope = darkCss.match(/\.theme-dark :is\(\.card, \.modal[^)]*\) \{([\s\S]*?)\n\}/);
  expect(scope, 'PAPER SCOPE rule').not.toBeNull();
  expect(scope[1]).toMatch(/\n  color: var\(--content-primary\);/);
});

test('the invoice preview toolbar is paper, not an ink strip of ink buttons', () => {
  const modal = html.slice(html.indexOf('id="m-invoice-view"'), html.indexOf('<div class="overlay"', html.indexOf('id="m-invoice-view"') + 10));
  const toolbar = modal.match(/<div class="no-print" style="([^"]*)"/);
  expect(toolbar[1]).toMatch(/background:var\(--surface-card\)/);
  expect(toolbar[1]).not.toMatch(/--ink|--on-inverse/);
  expect(modal).not.toMatch(/class="btn ink"/);
});

test('dialog accent labels use the accent TEXT grade, not its fill', () => {
  for (const sel of ['.modal-badge-pill', '.tcc-total-val']) {
    const rule = styles.match(new RegExp(sel.replace('.', '\\.') + ' \\{([\\s\\S]*?)\\n\\}'));
    expect(rule, sel).not.toBeNull();
    expect(rule[1], sel).toMatch(/color: var\(--local-accent-text, var\(--gold-text\)\)/);
  }
});

test('no markup names the non-existent --text1 token', () => {
  // An undefined custom property makes the declaration invalid, so the figure
  // silently inherits whatever colour is above it.
  expect(html).not.toMatch(/var\(--text1\)/);
});
