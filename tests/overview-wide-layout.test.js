import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const css = readFileSync(join(root, 'src/style.css'), 'utf8');

/** The rule block for one selector, so assertions can't match a neighbour's. */
function block(selector) {
  const at = css.indexOf(selector);
  expect(at, `${selector} should exist in style.css`).toBeGreaterThan(-1);
  return css.slice(at, css.indexOf('}', at) + 1);
}

describe('the landing screen fills the window', () => {
  it('is not capped at the shared 1200px column', () => {
    // .tab-panel centres every other screen at 1200px. On a 2560px monitor that
    // left ~1150px of dead margin and pinned every book strip to 790px.
    expect(block('#tab-all-overview {')).toMatch(/max-width:\s*none/);
  });

  it('scales its side padding with the viewport rather than a fixed inset', () => {
    expect(block('#tab-all-overview {')).toMatch(/padding-inline:\s*clamp\(/);
  });

  it('keeps .tab-panel itself capped, so no other screen is affected', () => {
    expect(css).toMatch(/\.tab-panel\{[^}]*max-width:1200px/);
  });
});

describe('the catalogue flows into as many columns as fit', () => {
  const list = block('#all-books-list {');

  it('uses auto-fit so the count adapts continuously, not at one breakpoint', () => {
    expect(list).toMatch(/grid-template-columns:\s*repeat\(auto-fit,\s*minmax\(/);
  });

  it('guards the track with min(100%, …) so a phone cannot overflow sideways', () => {
    // Without this the minimum track stays wider than a 390px screen and the
    // whole page scrolls horizontally.
    expect(list).toMatch(/minmax\(min\(100%,/);
  });

  it('lets the grid gap own the spacing instead of the strips own margins', () => {
    expect(block('#all-books-list > .book-strip {')).toMatch(/margin-bottom:\s*0/);
  });

  it('spans an empty catalogue across the whole grid', () => {
    expect(block('#all-books-list > .empty-state {')).toMatch(/grid-column:\s*1\s*\/\s*-1/);
  });

  it('lets a strip in a column shrink its figure rail instead of pinning it open', () => {
    const kpis = block('#all-books-list .book-strip-kpis {');
    expect(kpis).toMatch(/flex:\s*1 1/);
    expect(kpis).toMatch(/max-width:\s*var\(--book-kpi-rail-width\)/);
  });
});

describe('widening the page does not stretch what should stay readable', () => {
  it('caps the channel bar track so its figures stay beside their channel', () => {
    // Left as a plain 1fr the bar ran to ~1300px once the page uncapped.
    const row = block('.ch-row{');
    expect(row).toMatch(/grid-template-columns:168px minmax\(0,46rem\)/);
    expect(row).not.toMatch(/minmax\(0,1fr\)/);
  });

  it('grows the rail with the window but keeps it a readable column', () => {
    expect(block('.overview-shell {')).toMatch(/clamp\(300px,\s*20vw,\s*380px\)/);
  });
});
