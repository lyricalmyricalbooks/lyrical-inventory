import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

// The Financials tab's expense-by-category table flagged a category with an
// unfiled receipt using an undefined --dark token for the pill's text colour.
// With no such variable in either theme, the text fell back to whatever it
// inherited — near-white in dark mode, on a light-salmon red fill, which is
// unreadable. This test pins the fix: reuse the themed .pill.red convention
// (already correct in both themes, per style.css) instead of hand-rolled
// colours.

const main = fs.readFileSync(path.join(process.cwd(), 'src/main.js'), 'utf8');
const css = fs.readFileSync(path.join(process.cwd(), 'src/style.css'), 'utf8');

describe('Financials — expense category "missing receipts" pill', () => {
  it('never references the undefined --dark token', () => {
    expect(main).not.toMatch(/--dark\b/);
  });

  it('renders the count with the shared themed red pill, not ad-hoc colours', () => {
    expect(main).toMatch(/<span class="pill red" style="margin-left:8px;">\$\{val\.missingReceipts\} missing<\/span>/);
  });

  it('the red pill it now reuses is themed in both light and dark mode', () => {
    expect(css).toContain('.pill.red{background:var(--status-critical-bg);color:var(--status-critical);}');
  });
});
