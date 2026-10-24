import { describe, it, expect } from 'vitest';
import fs from 'node:fs';

const css = fs.readFileSync('src/styles/phone.css', 'utf8');
const block = css.slice(css.indexOf('Tax Centre text links held upright'));

describe('phone Tax Centre link tap targets', () => {
  it('grows the text links to a full target without changing row height', () => {
    expect(block).toMatch(/\.tc-cat-link, \.rec-charge-link\s*\{[^}]*padding-block:\s*calc\(\(var\(--target-min\) - 1lh\) \/ 2\)/);
    expect(block).toMatch(/margin-block:\s*calc\(\(var\(--target-min\) - 1lh\) \/ -2\)/);
    expect(block).toMatch(/display:\s*inline-block/);
  });
  it('gives the recurring filter tabs a full target', () => {
    expect(block).toMatch(/\.rec-filter\s*\{\s*min-height:\s*var\(--target-min\)/);
  });
});
