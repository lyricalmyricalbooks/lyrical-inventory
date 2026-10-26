import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const css = readFileSync(path.join(__dirname, '../src/styles/phone.css'), 'utf8');

describe('phone Order History — pencil rests in the card corner', () => {
  it('anchors the pencil to the bottom-right of a relatively-positioned card', () => {
    expect(css).toMatch(/#tab-history \.tbl tr\.hist-row \{ position: relative; \}/);
    expect(css).toMatch(/#tab-history #hist-body tr\.hist-row \.edit-btn \{ position: absolute; right: var\(--space-4\); bottom: var\(--space-3\); \}/);
  });

  it('no longer trails the order number with a left margin', () => {
    expect(css).toMatch(/#tab-history #hist-body \.edit-btn \{ width: 28px; height: 28px; margin: 0; opacity: 1; \}/);
  });

  it('grows the date row only when a Ship button sits above the pencil', () => {
    expect(css).toMatch(/tr\.hist-row:has\(\.btn-hist-action\) > td:nth-child\(9\) \{[^}]*min-height: 28px/);
  });

  it('inks the pencil like the buttons around it instead of a faint beige square', () => {
    expect(css).toMatch(/#tab-history #hist-body \.edit-btn \{ background: var\(--surface-card\); border: var\(--stroke\) solid var\(--rule-ink\);/);
  });
});
