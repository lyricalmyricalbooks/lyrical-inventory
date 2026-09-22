import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

// This file began as a fix for the Financials tab, whose expense-by-category
// table flagged an unfiled receipt using an undefined --dark token for the
// pill's text colour: with no such variable in either theme, the text fell
// back to whatever it inherited — near-white on a light-salmon fill, which is
// unreadable.
//
// The Financials tab has since been removed. It was unreachable and would have
// thrown on arrival: nothing rendered its markup, so its very first line read
// .value off an element that does not exist. The assertion that pinned its
// markup has gone with it, because its subject no longer exists — there is
// nothing left to retarget it at.
//
// The other two guards are kept, because what they protect is still live and
// used across the app: the ban on the undefined token, and the themed red pill
// the fix reached for, which appears on order rows, store balances, receipts
// and shipping.

const main = fs.readFileSync(path.join(process.cwd(), 'src/main.js'), 'utf8');
const css = fs.readFileSync(path.join(process.cwd(), 'src/style.css'), 'utf8');

describe('themed red pill and the undefined --dark token', () => {
  it('never references the undefined --dark token', () => {
    // An undefined custom property makes the whole declaration invalid, so the
    // rule silently does not apply. See tests/no-undefined-tokens.test.js for
    // the general version of this guard across the stylesheets.
    expect(main).not.toMatch(/--dark\b/);
  });

  it('the shared red pill is themed in both light and dark mode', () => {
    expect(css).toContain('.pill.red{background:var(--status-critical-bg);color:var(--status-critical);}');
  });

  it('that pill is still used, so the rule above is not guarding dead code', () => {
    // Without this, the assertion above could keep passing long after the last
    // caller disappeared — which is exactly how this file ended up half
    // obsolete in the first place.
    expect(main).toMatch(/class="pill red/);
  });
});
