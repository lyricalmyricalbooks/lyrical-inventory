import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const css = readFileSync('src/styles/phone.css', 'utf8');
const rule = sel => {
  const i = css.indexOf(sel + ' {');
  expect(i, sel).toBeGreaterThan(-1);
  return css.slice(i, css.indexOf('}', i));
};

describe('phone Tax Centre card heads and receipt buttons', () => {
  it('splits Camera and AI Scan into two equal full-width halves', () => {
    const grid = rule('#tab-taxcenter .tc-receipt-scan-actions');
    expect(grid).toContain('grid-template-columns: repeat(2, minmax(0, 1fr))');
    expect(rule('#tab-taxcenter .tc-receipt-scan-actions .btn')).toContain('width: 100%');
  });
  it('sets the Cash Flow Summary title in uppercase display lettering', () => {
    const t = rule('#tab-taxcenter .cf-title');
    expect(t).toContain('var(--font-display)');
    expect(t).toContain('text-transform: uppercase');
  });
  it('gives the currency tag a square corner', () => {
    expect(rule('#tab-taxcenter .cf-cad-badge')).toContain('border-radius: var(--r)');
  });
});
