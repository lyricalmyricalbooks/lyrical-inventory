import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const css = readFileSync('src/styles/phone.css', 'utf8');
const rule = (sel) => {
  const i = css.lastIndexOf(sel + ' {');
  return css.slice(i, css.indexOf('}', i));
};

describe('phone website order cards', () => {
  it('are inked slips with the offset shadow and a kept status stripe', () => {
    const r = rule('#tab-website .order-card');
    expect(r).toContain('var(--stroke) solid var(--border-strong)');
    expect(r).toContain('border-left-width: 4px');
    expect(r).toContain('box-shadow: var(--elev-1)');
  });
  it('press in on tap and do not lift on hover', () => {
    expect(css).toContain('#tab-website .order-card:active { transform: translate(2px, 2px); box-shadow: none; }');
    expect(css).toContain('#tab-website .order-card:hover { transform: none;');
  });
});
