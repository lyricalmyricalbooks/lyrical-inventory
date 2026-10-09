import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const read = (rel) => readFileSync(path.join(root, rel), 'utf8');
const jsFiles = (dir) => readdirSync(path.join(root, dir), { recursive: true })
  .filter((f) => String(f).endsWith('.js')).map((f) => path.join(dir, String(f)));
const files = ['index.html', ...jsFiles('src')];

// Email receipt drafts take a refund as a negative amount, and the phone's
// decimal pad has no minus key, so that one box keeps the default keyboard.
const ALLOWED_WITHOUT_KEYPAD = [/data-erd-field="amount"/];

function numberInputs() {
  const found = [];
  for (const file of files) {
    const src = read(file);
    for (const m of src.matchAll(/<input\b[^>]*>/gs)) {
      if (!/type=(\\?["'])number\1/.test(m[0])) continue;
      found.push({ where: `${file}:${src.slice(0, m.index).split('\n').length}`, tag: m[0] });
    }
  }
  return found;
}

describe('number boxes bring up the right phone keypad', () => {
  test('every number box says which keypad it needs', () => {
    const missing = numberInputs()
      .filter(({ tag }) => !/inputmode=/i.test(tag) && !ALLOWED_WITHOUT_KEYPAD.some((re) => re.test(tag)))
      .map(({ where }) => where);
    expect(missing).toEqual([]);
  });

  test('a whole-number keypad is only used where whole numbers are expected', () => {
    // An iPhone's numeric pad has no decimal point, so a box that takes 37.5
    // or 2.25 must ask for the decimal pad instead.
    const wrong = numberInputs()
      .filter(({ tag }) => /inputmode=(\\?["'])numeric\1/.test(tag))
      .filter(({ tag }) => { const step = tag.match(/step=\\?["']([^"'\\]+)/)?.[1]; return step && step !== '1'; })
      .map(({ where }) => where);
    expect(wrong).toEqual([]);
  });

  test('number boxes built in code set their keypad too', () => {
    for (const file of files.filter((f) => f.endsWith('.js'))) {
      const lines = read(file).split('\n');
      lines.forEach((line, i) => {
        if (!/\.type\s*=\s*'number'/.test(line)) return;
        const near = lines.slice(i, i + 5).join('\n');
        expect(near, `${file}:${i + 1}`).toMatch(/\.inputMode\s*=/);
      });
    }
  });

  test('commission rates accept a decimal such as 37.5%', () => {
    const html = read('index.html');
    for (const id of ['ns-rate', 'es-rate', 'send-rate', 'bulk-rate']) {
      const tag = html.match(new RegExp(`<input id="${id}"[^>]*>`))?.[0];
      expect(tag, id).toMatch(/inputmode="decimal"/);
      expect(tag, id).toMatch(/step="any"/);
    }
  });

  test('copy counts keep the whole-number keypad (no start-up script turns it into a decimal pad)', () => {
    expect(read('src/main.js')).not.toMatch(/numericIds/);
    const html = read('index.html');
    for (const id of ['m-qty', 'sale-qty', 'nb-max', 'nb-thresh', 'wo-qty', 'sp-qty']) {
      expect(html.match(new RegExp(`<input[^>]*id="${id}"[^>]*>`))?.[0], id).toMatch(/inputmode="numeric"/);
    }
  });
});
