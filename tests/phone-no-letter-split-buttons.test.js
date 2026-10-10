import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from 'vitest';

// On a phone the consignment store card spelt its buttons down the screen
// ("SE/ND/BO/OK/S"). Two rules combined to do it:
//   1. overflow-wrap:anywhere on page content and buttons, which lets a
//      label's minimum width shrink to one letter, and
//   2. button rows set to flex:1 (a zero starting width), which never makes
//      the row wrap, so every button gets squeezed onto one line.
// These guard both halves of that, everywhere they appeared.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const read = (p) => readFileSync(path.join(__dirname, '..', p), 'utf8');
const sheets = {
  'src/style.css': read('src/style.css'),
  'src/styles/phone.css': read('src/styles/phone.css'),
  'src/styles/receipt-finder.css': read('src/styles/receipt-finder.css'),
};

test('page content and buttons never let a word split between letters', () => {
  expect(sheets['src/style.css']).toMatch(/\.pub-shell \.tab-panel\{min-width:0;overflow-wrap:break-word;\}/);
  expect(sheets['src/styles/phone.css']).toMatch(/\.tab-panel \.btn \{ white-space: normal; overflow-wrap: break-word;/);
  for (const [file, css] of Object.entries(sheets)) {
    expect(css, file).not.toMatch(/\.tab-panel\s*\{[^}]*overflow-wrap:\s*anywhere/);
    expect(css, file).not.toMatch(/\.btn\s*\{[^}]*overflow-wrap:\s*anywhere/);
  }
});

test('wrapping button rows start from the label width, not zero', () => {
  const rows = [
    ['src/style.css', '.store-actions .btn'],
    ['src/style.css', '.catalog-actions .btn'],
    ['src/style.css', '.modal-footer .btn'],
    ['src/style.css', '.web-orders-actions .btn'],
    ['src/style.css', '.order-actions .btn'],
    ['src/style.css', '.fk-list-actions .btn'],
    ['src/style.css', '.postage-match-actions .btn'],
    ['src/style.css', '.bc-gap-actions .btn'],
    ['src/styles/phone.css', '#tab-website .order-actions > .btn'],
    ['src/styles/receipt-finder.css', '.finder-actionbar .btn'],
  ];
  for (const [file, sel] of rows) {
    const esc = sel.replace(/[.*+?^${}()|[\]\\>#]/g, '\\$&');
    const rule = sheets[file].match(new RegExp(`(?:^|[\\s}])${esc}\\s*\\{([^}]*)\\}`, 'g')) || [];
    expect(rule.length, `${sel} in ${file}`).toBeGreaterThan(0);
    for (const r of rule) expect(r, `${sel} in ${file}`).not.toMatch(/flex:\s*1\s*;/);
  }
});

test('the book editor steps and stock hand-off toggle fit a phone screen', () => {
  const phone = sheets['src/styles/phone.css'];
  expect(phone).toMatch(/\.book-modal-stepper \{ grid-template-columns: repeat\(3, minmax\(0, 1fr\)\); \}/);
  expect(phone).toMatch(/\.st-dir-toggle \{ flex-direction: column; \}/);
});
