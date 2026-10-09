import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const css = readFileSync('src/styles/phone.css', 'utf8');
const tail = css.slice(css.lastIndexOf('Register take-back controls'));

describe('phone register − buttons and count badge (Riso Press)', () => {
  it('squares the count badge', () => {
    expect(tail).toMatch(/\.fm-tile-qty\s*\{\s*border-radius:\s*var\(--r2\)/);
  });
  it('gives both − buttons an ink outline, square corners and offset shadow', () => {
    const rule = tail.match(/:is\(\.fm-tile-minus, \.fm-line-minus\)\s*\{[^}]*\}/)[0];
    expect(rule).toMatch(/border:\s*var\(--stroke\) solid var\(--rule-ink\)/);
    expect(rule).toMatch(/border-radius:\s*var\(--r2\)/);
    expect(rule).toMatch(/box-shadow:\s*var\(--elev-1\)/);
  });
  it('presses in on tap and respects reduced motion', () => {
    expect(tail).toMatch(/:active\s*\{\s*transform:\s*translate\(2px, 2px\);\s*box-shadow:\s*none/);
    expect(tail).toMatch(/prefers-reduced-motion: reduce/);
  });
});
