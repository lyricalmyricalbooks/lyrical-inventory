import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

// String path, not new URL(): jsdom's URL is rejected by node:fs.
const css = readFileSync(path.join(__dirname, '../src/styles/phone.css'), 'utf8');
const line = (sel) => css.split('\n').filter(l => l.includes(sel) && l.includes('{') && l.includes('border:')).join('\n');

describe('phone Book Catalog cards', () => {
  it('are inked slabs: bold outline, square corner, offset shadow', () => {
    const rule = line('#tab-sheets .catalog-card {');
    expect(rule).toMatch(/border: var\(--stroke\) solid var\(--rule-ink\)/);
    expect(rule).toMatch(/border-radius: 0/);
    expect(rule).toMatch(/box-shadow: var\(--elev-1\)/);
  });

  it('gives the Test Book Catalog sandbox tag a square inked caps look', () => {
    const rule = line('.cat-settings-head .sec-head-badges > .chip-status {');
    expect(rule).toMatch(/border-radius: var\(--r2\)/);
    expect(rule).toMatch(/border: var\(--stroke\) solid currentColor/);
    expect(rule).toMatch(/letter-spacing: var\(--tracking-caps\)/);
  });
});
