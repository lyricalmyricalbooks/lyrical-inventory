import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const css = readFileSync(resolve(process.cwd(), 'src/styles/phone.css'), 'utf8');

describe('phone expense card receipt cell', () => {
  it('drops the redundant "Receipt" caps label above the tag and button', () => {
    expect(css).toMatch(/#exp-body > tr\.phone-record > td\[data-phone-label="Receipt"\]::before \{ display: none; \}/);
  });
  it('gives the no-receipt tag the square corner of other phone tags', () => {
    expect(css).toMatch(/td\[data-phone-label="Receipt"\] > \.pill \{ border-radius: var\(--r2\);/);
  });
});
