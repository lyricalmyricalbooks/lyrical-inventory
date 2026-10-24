import { describe, it, expect } from 'vitest';
import fs from 'node:fs';

const css = fs.readFileSync('src/styles/phone.css', 'utf8');

describe('phone expense cards — receipt cell stacks so the description keeps its width', () => {
  const rule = css.match(/#exp-body > tr\.phone-record > td\[data-phone-label="Receipt"\] \{ display: flex !important;[^}]*\}/);

  it('stacks the receipt status over the + Receipt button, right-aligned', () => {
    expect(rule).not.toBeNull();
    expect(rule[0]).toContain('flex-direction: column');
    expect(rule[0]).toContain('align-items: flex-end');
  });

  it('drops the button\'s side margin that only suited the side-by-side layout', () => {
    expect(css).toMatch(/td\[data-phone-label="Receipt"\] > \.exp-add-receipt \{ margin-left: 0; \}/);
  });
});
