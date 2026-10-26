import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const css = readFileSync(path.join(__dirname, '../src/styles/phone.css'), 'utf8');
const rule = sel => {
  const i = css.indexOf(sel);
  expect(i, sel).toBeGreaterThan(-1);
  return css.slice(i, css.indexOf('}', i));
};

describe('phone buyer cards (Customers)', () => {
  it('puts the spend beside the name instead of under a label', () => {
    const r = rule('#cust-body > tr.phone-record > td[data-phone-label="Spend"]');
    expect(r).toMatch(/grid-column:\s*2/);
    expect(r).toMatch(/grid-row:\s*1/);
    expect(r).toMatch(/tabular-nums/);
  });
  it('gives the email link a full-size tap row', () => {
    expect(rule('#cust-body > tr.phone-record > td[data-phone-label="Email"] > a')).toMatch(/min-height:\s*var\(--target-min\)/);
  });
  it('drops the stacked field labels on the card', () => {
    expect(rule('#cust-body > tr.phone-record > td::before')).toMatch(/display:\s*none/);
  });

  it('never makes an action button narrower than its own label', () => {
    const row = rule('#cust-body > tr.phone-record > td[data-phone-label="Action"] > div');
    expect(row).toMatch(/grid-auto-columns:\s*minmax\(max-content,\s*1fr\)/);
    expect(row).not.toMatch(/repeat\(auto-fit/);
  });
});
