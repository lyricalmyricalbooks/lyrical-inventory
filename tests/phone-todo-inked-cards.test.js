import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';

const css = readFileSync('src/styles/phone.css', 'utf8');
const block = css.slice(css.indexOf('To-do cards held upright'));

describe('phone To-do cards', () => {
  it('are inked slabs with the offset shadow', () => {
    expect(block).toMatch(/\.todo-row \{[^}]*border: var\(--stroke\) solid var\(--rule-ink\)/);
    expect(block).toMatch(/\.todo-row \{[^}]*var\(--elev-1\)/);
  });
  it('carry the tone stripe inside the outline, not as a left border', () => {
    expect(block).toMatch(/\.todo-row\.tone-red \{[^}]*inset 4px 0 0 var\(--status-critical\)/);
    expect(block).toMatch(/\.todo-row\.tone-amber \{[^}]*inset 4px 0 0 var\(--status-active\)/);
  });
  it('leave a step between cards so shadows do not touch', () => {
    expect(block).toMatch(/\.todo-list \{ gap: var\(--space-3\)/);
  });
});
