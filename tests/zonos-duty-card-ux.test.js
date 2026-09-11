import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const styleCss = readFileSync(path.join(__dirname, '../src/style.css'), 'utf8');
const indexHtml = readFileSync(path.join(__dirname, '../index.html'), 'utf8');

describe('US Zonos Duty Prepayment Card UX/UI Compliance', () => {
  it('declares Container Queries on .us-zonos-duty-card', () => {
    expect(styleCss).toMatch(/\.us-zonos-duty-card\s*\{[^}]*container-type:\s*inline-size;/);
    expect(styleCss).toMatch(/\.us-zonos-duty-card\s*\{[^}]*container-name:\s*us-zonos;/);
    expect(styleCss).toMatch(/@container\s+us-zonos\s*\(\s*max-width:\s*480px\s*\)/);
  });

  it('enforces Fitts Law touch targets (>= 44px) on all interactive elements', () => {
    expect(styleCss).toMatch(/\.us-zonos-input\s*\{[^}]*min-height:\s*var\(--target-min\);/);
    expect(styleCss).toMatch(/\.us-zonos-paste-btn\s*\{[^}]*min-height:\s*var\(--target-min\);/);
    expect(styleCss).toMatch(/\.us-zonos-action-btn\s*\{[^}]*min-height:\s*var\(--target-min\);/);
  });

  // Was pinned to literal oklch() colours for the mandate border and the
  // "valid" states. Those never adjusted for dark mode — a fixed oklch() value
  // renders identically in both themes, unlike the app's --gold*/--status-*
  // tokens, which theme-dark.css re-points. `.zonos-duty-card` right above this
  // one already used `--gold-line`/`--gold` for the identical amber-border
  // role; this card now matches it instead of carrying its own untethered
  // copy of the colour. See .agents/UX_PATTERNS.md §8 — oklch() is deliberately
  // not adopted piecemeal in this codebase.
  it('uses the themed gold/status tokens for the mandate border and validation states, not literal oklch()', () => {
    const block = styleCss.slice(styleCss.indexOf('.us-zonos-duty-card {'), styleCss.indexOf('@container us-zonos'));
    expect(block).not.toMatch(/oklch\(/);

    expect(styleCss).toMatch(/\.us-zonos-duty-card\s*\{[^}]*border:\s*1px solid var\(--gold-line\);/);
    expect(styleCss).toMatch(/\.us-zonos-duty-card:hover\s*\{[^}]*border-color:\s*var\(--gold\);/);
    expect(styleCss).toMatch(/\.us-zonos-input:focus\s*\{[^}]*box-shadow:\s*var\(--focus-ring-halo\);/);
    expect(styleCss).toMatch(/\.us-zonos-hint\.is-valid\s*\{[^}]*color:\s*var\(--status-positive\);/);
    expect(styleCss).toMatch(/\.us-zonos-char-counter\.is-valid\s*\{[^}]*color:\s*var\(--status-positive\);[^}]*background:\s*var\(--status-positive-bg\);/);
  });

  it('formats character count and code inputs with DM Mono tabular figures', () => {
    expect(styleCss).toMatch(/\.us-zonos-input\s*\{[^}]*font-family:\s*'DM Mono',\s*monospace;/);
    expect(styleCss).toMatch(/\.us-zonos-char-counter\s*\{[^}]*font-feature-settings:\s*"tnum" 1,\s*"zero" 1;/);
  });

  it('provides spring physics and honours reduced motion preference', () => {
    expect(styleCss).toMatch(/transition:[^;]*var\(--ease-spring\)/);
    expect(styleCss).toMatch(/@media\s*\(\s*prefers-reduced-motion:\s*reduce\s*\)\s*\{[\s\S]*?\.us-zonos-duty-card/);
  });

  it('index.html contains all required elements, ARIA labels, and action hooks', () => {
    expect(indexHtml).toContain('id="us-zonos-duty-card"');
    expect(indexHtml).toContain('class="us-zonos-duty-card"');
    expect(indexHtml).toContain('id="sp-zonos-declaration-id"');
    expect(indexHtml).toContain('id="us-zonos-char-counter"');
    expect(indexHtml).toContain('id="sp-open-zonos-prepay-btn"');
    // The auto-generate button and its result hint are deliberately gone: a
    // Declaration ID is bought in the Prepay app and pasted in by hand, so
    // nothing in the app offers to conjure one.
    expect(indexHtml).not.toContain('sp-auto-gen-zonos-btn');
    expect(indexHtml).not.toContain('zonos-auto-result-hint');
  });
});
