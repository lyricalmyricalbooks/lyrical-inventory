import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const css = readFileSync('src/styles/phone.css', 'utf8');

describe('phone Payments need-card fields', () => {
  it('bottom-aligns paired fields so wrapped labels do not stagger the inputs', () => {
    const rule = css.match(/#tab-reconcile \.recon-fields \{[^}]*\}/)?.[0] ?? '';
    expect(rule).toMatch(/grid-template-columns:\s*repeat\(2,/);
    expect(rule).toMatch(/align-items:\s*end/);
  });
});
