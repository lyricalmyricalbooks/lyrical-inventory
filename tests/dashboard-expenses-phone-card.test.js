import { describe, it, expect } from 'vitest';
import fs from 'node:fs';

const css = fs.readFileSync('src/styles/phone.css', 'utf8');
const layout = fs.readFileSync('src/lib/phone-layout.js', 'utf8');

describe('Dashboard expenses-owed list on a phone', () => {
  it('is a compact two-column card with the amount on the top line', () => {
    expect(css).toMatch(/#d-exp-body > tr\.phone-record \{[^}]*grid-template-columns: minmax\(0, 1fr\) auto;/);
    expect(css).toMatch(/#d-exp-body > tr\.phone-record > td\[data-phone-label="Amount"\] \{[^}]*grid-row: 1 !important;/);
  });
  it('drops the repeated Date label so the date is one muted line', () => {
    expect(css).toMatch(/td\[data-phone-label="Date"\]::before \{ display: none; \}/);
  });
  it('lets a tap anywhere on the card open its details', () => {
    expect(layout).toMatch(/'d-exp-body': \{[^}]*card: true/);
  });
});
