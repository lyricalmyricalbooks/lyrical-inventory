import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const phone = readFileSync('src/styles/phone.css', 'utf8');
const rule = (sel) => phone.match(new RegExp(sel.replace(/[.*+?^${}()|[\]\\>]/g, '\\$&') + '\\s*\\{([^}]*)\\}'))?.[1] ?? '';

describe('phone Big Cartel heading row', () => {
  it('keeps the title and the connection state on one row', () => {
    const r = rule('#tab-bigcartel > .row-between');
    expect(r).toMatch(/flex-direction:\s*row/);
    expect(r).toMatch(/flex-wrap:\s*nowrap/);
  });
  it('lets the title shrink so the state tag never pushes it off screen', () => {
    expect(rule('#tab-bigcartel > .row-between .section-hed')).toMatch(/min-width:\s*0/);
  });
  it('draws the connection state as a square outlined tag that does not shrink', () => {
    const r = rule('#tab-bigcartel .bc-connection-status');
    expect(r).toMatch(/flex:\s*none/);
    expect(r).toMatch(/border:\s*var\(--stroke-hair\)/);
    expect(r).toMatch(/border-radius:\s*var\(--r2\)/);
    expect(r).toMatch(/text-transform:\s*uppercase/);
  });
});

describe('phone cards with a left accent stripe (Big Cartel store card, Settings…)', () => {
  it('draws the stripe solid and squares the corners', () => {
    const r = rule('.tab-panel .card[style*="border-left"]');
    expect(r).toMatch(/border-radius:\s*0/);
    expect(r).toMatch(/border-left-color:\s*var\(--gold\)\s*!important/);
  });
});

describe('phone To-do count tags', () => {
  it('draws the total and each group count as square inked tags, not soft lozenges', () => {
    const r = phone.match(/#tab-todo #todo-total-chip,\s*#tab-todo \.todo-group \.sec-head-badges > \.pill\s*\{([^}]*)\}/)?.[1] ?? '';
    expect(r).toMatch(/border-radius:\s*var\(--r2\)/);
    expect(r).toMatch(/border:\s*var\(--stroke\)\s+solid\s+currentColor/);
    expect(r).toMatch(/font-variant-numeric:\s*tabular-nums/);
  });
});

describe('phone All Books / Stores status tags', () => {
  const riso = readFileSync('src/styles/phone-riso.css', 'utf8');
  const r = riso.match(/\.pub-shell \.phone-pill\s*\{([^}]*)\}/)?.[1] ?? '';
  it('draw as square inked tags with the bold outline, not soft hairline lozenges', () => {
    expect(r).toMatch(/border:\s*var\(--stroke\)\s+solid\s+currentColor/);
    expect(r).toMatch(/border-radius:\s*var\(--r2\)/);
    expect(r).not.toMatch(/--r-pill/);
  });
});

describe('phone Shipping readiness tag', () => {
  it('draws "N still needed" as a square inked caps tag, not a soft pill', () => {
    const r = phone.match(/#tab-shipping \.ship-readiness > \.pill\s*\{([^}]*)\}/)?.[1] ?? '';
    expect(r).toMatch(/border-radius:\s*var\(--r2\)/);
    expect(r).toMatch(/border:\s*var\(--stroke\)\s+solid\s+currentColor/);
    expect(r).toMatch(/text-transform:\s*uppercase/);
  });
});

describe('phone primary buttons', () => {
  it('keep the ink outline instead of taking the book colour as their border', () => {
    const riso = readFileSync('src/styles/phone-riso.css', 'utf8');
    const m = riso.match(/@media \(max-width: 768px\) \{\s*\.pub-shell \.tab-panel \.btn\.gold,\s*\.pub-shell \.tab-panel \.btn\.gold:hover\s*\{([^}]*)\}/);
    expect(m?.[1]).toMatch(/border-color:\s*var\(--rule-ink\)\s*!important/);
  });
});
