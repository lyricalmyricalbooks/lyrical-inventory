import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  paletteFor, makeColorResolver, STYLE_CSS, THEME_DARK_CSS,
} from '../scripts/check-contrast.mjs';

// WCAG's contrast-ratio formula is the wrong tool here: its log compression
// makes it nearly blind among very-dark swatches — even the app's own
// --ink-vs---cream pairing (unambiguously separated to the eye, and the
// header background that proves it works) only clears ~1.06 on that scale.
// A plain weighted-luminance ratio tracks what the eye actually sees at this
// end of the range far better.
const luminance = (c) => c.r * 0.2126 + c.g * 0.7152 + c.b * 0.0722;

/**
 * --ink2 is the flat fill behind the tab bar, the sync bar, the book-switcher
 * dropdown, the header overflow menu, and the publisher sidebar menu (all via
 * the --surface-inverse-raised alias). In dark mode it used to resolve to
 * #14110e — one RGB unit off --cream's #14110d, the page colour every one of
 * those panels floats over — so they all rendered with no visible fill at
 * all, just a shadow and a near-invisible hairline. This pins the fix: --ink2
 * has to read as a distinct surface from --cream in dark mode, not just in
 * light mode where the gap was never in doubt.
 */

const styleCss = readFileSync(STYLE_CSS, 'utf8');
const darkCss = readFileSync(THEME_DARK_CSS, 'utf8');

describe('dark-mode ink chrome stays separated from the page', () => {
  const vars = paletteFor('dark', styleCss, darkCss);
  const resolve = makeColorResolver(vars);
  const rgb = (token) => resolve(`var(${token})`);

  it('keeps --ink2 visually distinct from --cream', () => {
    // The pre-fix pairing measured a 1.003 luminance ratio — indistinguishable.
    // --ink itself (the header background, unambiguously legible as its own
    // surface) sits at ~0.48 of --cream's luminance, so requiring --ink2 stay
    // under 0.85 leaves comfortable room below the bug while not demanding
    // --ink2 be as deep as --ink.
    const ratio = luminance(rgb('--ink2')) / luminance(rgb('--cream'));
    expect(ratio).toBeLessThan(0.85);
  });

  it('keeps the inverse-surface scale ascending: ink < ink2 < ink3 < ink4', () => {
    const order = ['--ink', '--ink2', '--ink3', '--ink4'].map((t) => luminance(rgb(t)));
    for (let i = 1; i < order.length; i++) {
      expect(order[i]).toBeGreaterThan(order[i - 1]);
    }
  });

  it('keeps --ink2 darker than --cream, not just different', () => {
    // Distinct-but-lighter would still read as "the chrome dissolved into a
    // slightly different puddle" rather than the documented "deeper than the
    // page" well. --ink3/--ink4 are allowed to cross above --cream (they're
    // hover/active accents, not a flat base fill) — --ink2 is not.
    expect(luminance(rgb('--ink2'))).toBeLessThan(luminance(rgb('--cream')));
  });
});
