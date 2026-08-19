import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  makeColorResolver, contrastRatio, paletteFor, THEMES,
} from '../scripts/check-contrast.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const styleCss = readFileSync(join(root, 'src/style.css'), 'utf8');
const darkCss = readFileSync(join(root, 'src/styles/theme-dark.css'), 'utf8');

/**
 * The tab bar is the app's primary navigation and it renders on every screen,
 * so its labels are the most-read text in the product. They live in
 * src/style.css rather than an inline style, which is exactly why the
 * index.html contrast sweep never saw them: the resting colour sat at
 * rgba(255,255,255,.28) — 2.6:1 against --ink2 — for as long as the bar has
 * existed. These tests pin the fix so it cannot silently regress.
 */

/**
 * Declarations of the first rule whose selector is exactly `selector`.
 * Anchored on a line/brace boundary so `.tab-bar` can't match the tail of
 * `.tab-bar > .kpi-cluster`, and brace-terminated so `.tab-btn` can't match
 * `.tab-btn:hover`.
 */
function ruleBlock(css, selector) {
  const esc = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const m = css.match(new RegExp(`(?:^|[}\\n])[ \\t]*${esc}[ \\t]*\\{([^}]*)\\}`, 'm'));
  return m ? m[1] : null;
}

/** Value of `prop` inside a declaration block, or null. */
function decl(block, prop) {
  if (!block) return null;
  const m = block.match(new RegExp(`(?:^|;)\\s*${prop}\\s*:\\s*([^;]+)`, 'i'));
  return m ? m[1].trim() : null;
}

// The desktop rule — the mobile bottom-nav override lives inside a media block
// further down the file and inherits its colour from here.
const tabBtn = ruleBlock(styleCss, '.tab-btn');
const tabBar = ruleBlock(styleCss, '.tab-bar');
const tabUpdated = ruleBlock(styleCss, '.tab-updated');

describe('tab bar — rule shape', () => {
  it('finds the desktop .tab-btn and .tab-bar rules', () => {
    expect(tabBtn).toBeTruthy();
    expect(tabBar).toBeTruthy();
    expect(tabUpdated).toBeTruthy();
  });

  it('colours the labels from the --on-inverse tier, not a raw white alpha', () => {
    // --cream would invert out from under the bar when the theme flips; a raw
    // rgba(255,255,255,…) is what measured 2.6:1 in the first place.
    expect(decl(tabBtn, 'color')).toBe('var(--on-inverse-2)');
    expect(decl(tabBtn, 'color')).not.toMatch(/rgba?\(/);
    expect(decl(tabUpdated, 'color')).toBe('var(--on-inverse-3)');
  });

  it('gives every tab a 44px target', () => {
    expect(decl(tabBtn, 'min-height')).toBe('44px');
    // A flex item that may shrink clips its own nowrap label instead of
    // letting the bar scroll.
    expect(decl(tabBtn, 'flex-shrink')).toBe('0');
  });

  it('keeps the focus ring inside the horizontal scroller', () => {
    const focus = ruleBlock(styleCss, '.tab-btn:focus-visible');
    expect(focus).toBeTruthy();
    expect(decl(focus, 'outline')).toMatch(/solid/);
    // A positive offset is clipped on the first and last tab by overflow-x.
    expect(parseFloat(decl(focus, 'outline-offset'))).toBeLessThan(0);
  });

  it('eases motion with a token curve and honours reduced motion', () => {
    expect(decl(tabBtn, 'transition')).toMatch(/var\(--ease-/);
    expect(decl(tabBtn, 'transition')).not.toMatch(/\blinear\b/);
    const reduced = styleCss.match(
      /@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{[^}]*\.tab-btn[^}]*\}/,
    );
    expect(reduced, '.tab-btn hover/active transform must opt out of motion').toBeTruthy();
  });

  it('still marks the active tab with the gold underline', () => {
    const active = ruleBlock(styleCss, '.tab-btn.active');
    expect(decl(active, 'border-bottom-color')).toBe('var(--gold2)');
    expect(decl(active, 'color')).toBe('var(--gold3)');
  });

  it('keeps the mobile bottom nav at a full 44px target too', () => {
    const mobile = styleCss.match(
      /@media\s*\(max-width:\s*768px\)[\s\S]*?\.tab-btn\s*\{([\s\S]*?)\}/,
    );
    expect(mobile).toBeTruthy();
    expect(parseFloat(decl(mobile[1], 'min-height'))).toBeGreaterThanOrEqual(44);
  });
});

describe.each(THEMES)('tab bar — measured label contrast [%s]', (theme) => {
  const vars = paletteFor(theme, styleCss, darkCss);
  const resolve = makeColorResolver(vars);
  const rgb = (token) => {
    const c = resolve(token);
    return { r: c.r, g: c.g, b: c.b };
  };
  /** Composites a translucent ink over the bar, as the browser will. */
  const over = (fg, surface) => {
    const f = resolve(fg); const b = rgb(surface);
    const a = f.a ?? 1;
    return { r: f.r * a + b.r * (1 - a), g: f.g * a + b.g * (1 - a), b: f.b * a + b.b * (1 - a) };
  };

  // --ink2 is the bar's background in both themes (theme-dark.css re-points it
  // to a darker value, so this is not the same colour twice).
  const BAR = 'var(--ink2)';

  it('clears AAA (7:1) for a resting tab label', () => {
    expect(contrastRatio(over(decl(tabBtn, 'color'), BAR), rgb(BAR)))
      .toBeGreaterThanOrEqual(7);
  });

  it('clears AAA for the active tab label', () => {
    expect(contrastRatio(rgb('var(--gold3)'), rgb(BAR))).toBeGreaterThanOrEqual(7);
  });

  it('clears AA (4.5:1) for the "last updated" stamp in the bar', () => {
    expect(contrastRatio(over(decl(tabUpdated, 'color'), BAR), rgb(BAR)))
      .toBeGreaterThanOrEqual(4.5);
  });

  it('clears AA for the author byline in the bar', () => {
    expect(contrastRatio(rgb('var(--gold2)'), rgb(BAR))).toBeGreaterThanOrEqual(4.5);
  });

  it('keeps the resting label a step below the active one', () => {
    // Readable is not the same as flat: the selected screen must still be the
    // brightest thing in the bar.
    const resting = contrastRatio(over(decl(tabBtn, 'color'), BAR), rgb(BAR));
    const active = contrastRatio(rgb('var(--gold3)'), rgb(BAR));
    expect(active).toBeGreaterThan(resting);
  });
});
