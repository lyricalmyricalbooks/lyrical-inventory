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

  it('uses OKLCH perceptual colors for amber mandate border and emerald validation', () => {
    expect(styleCss).toMatch(/\.us-zonos-duty-card\s*\{[^}]*border:\s*1px solid oklch\(0\.78 0\.18 75/);
    expect(styleCss).toMatch(/oklch\(0\.72 0\.19 155/);
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
