import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

// String path, not new URL(): jsdom's URL is rejected by node:fs.
const css = readFileSync(path.join(__dirname, '../src/styles/phone.css'), 'utf8');
const block = css.slice(css.indexOf('ALL BOOKS: consignment accounts (phone)'));
const rule = (sel) => block.split('\n').filter(l => l.includes(sel)).join('\n');

describe('phone All Books consignment cards', () => {
  it('leads with the book beside its status, store under it', () => {
    expect(rule('.con-row-book-title')).toMatch(/grid-row: 1/);
    expect(rule('td[data-phone-label="Status"] {')).toMatch(/grid-column: 2 !important; grid-row: 1/);
    expect(rule('td[data-phone-label="Store"] {')).toMatch(/grid-row: 2/);
  });
  it('puts Returned and Outstanding on one row and Details last', () => {
    expect(rule('td[data-phone-label="Returned"]')).toMatch(/grid-row: 3/);
    expect(rule('td[data-phone-label="Outstanding"]')).toMatch(/grid-row: 3/);
    expect(rule('.phone-record-toggle')).toMatch(/grid-row: 4/);
  });
  it('gives the book and store links a full-size tap row', () => {
    expect(rule('.con-row-book-title')).toMatch(/min-height: var\(--target-min\)/);
    expect(rule('.store-jump-link')).toMatch(/min-height: var\(--target-min\)/);
  });
});
