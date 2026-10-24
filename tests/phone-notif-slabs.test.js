import { describe, it, expect } from 'vitest';
import fs from 'node:fs';

const css = fs.readFileSync('src/styles/phone.css', 'utf8');
const block = css.slice(css.indexOf('Notifications (All Books and the bell panel)'));

describe('phone notifications are inked slabs', () => {
  it('uses the ink outline and offset shadow, not a hairline', () => {
    expect(block).toMatch(/\.notif-item\s*\{[^}]*border:\s*var\(--stroke\) solid var\(--rule-ink\)/);
    expect(block).toMatch(/\.notif-item\s*\{[^}]*box-shadow:\s*var\(--elev-1\)/);
  });
  it('keeps a tone stripe for every tone', () => {
    for (const t of ['red', 'amber', 'blue']) {
      expect(block).toMatch(new RegExp(`tone-${t}\\s*\\{[^}]*inset 4px 0 0`));
    }
  });
  it('makes the action link bold-underlined', () => {
    expect(block).toMatch(/\.notif-action\s*\{[^}]*text-decoration:\s*underline/);
  });
});
