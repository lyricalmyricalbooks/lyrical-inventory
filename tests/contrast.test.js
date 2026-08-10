import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  findLowContrastText, parseRootVars, parseDarkVars, paletteFor, scanThemes,
  contrastRatio, makeColorResolver, loadBaseline, partitionFindings,
  INDEX_HTML, STYLE_CSS, THEME_DARK_CSS, THEMES,
} from '../scripts/check-contrast.mjs';

const css = readFileSync(STYLE_CSS, 'utf8');
const darkCss = readFileSync(THEME_DARK_CSS, 'utf8');
const cssVars = parseRootVars(css);

describe('contrastRatio', () => {
  it('is 21:1 for pure black on pure white', () => {
    expect(contrastRatio({ r: 0, g: 0, b: 0 }, { r: 255, g: 255, b: 255 })).toBeCloseTo(21, 0);
  });

  it('is 1:1 for identical colours', () => {
    expect(contrastRatio({ r: 120, g: 80, b: 40 }, { r: 120, g: 80, b: 40 })).toBeCloseTo(1, 5);
  });
});

describe('makeColorResolver', () => {
  it('resolves var() chains, hex, rgba, and named colors from :root', () => {
    const resolve = makeColorResolver(cssVars);
    expect(resolve('var(--cream)')).toEqual({ r: 0xf7, g: 0xf2, b: 0xe9, a: 1 });
    expect(resolve('#fff')).toEqual({ r: 255, g: 255, b: 255, a: 1 });
    expect(resolve('rgba(255,255,255,.5)')).toEqual({ r: 255, g: 255, b: 255, a: 0.5 });
    expect(resolve('white')).toEqual({ r: 255, g: 255, b: 255, a: 1 });
    expect(resolve('linear-gradient(red, blue)')).toBeNull();
  });
});

describe('findLowContrastText', () => {
  it('flags light text with no dark ancestor (the original QR-panel bug)', () => {
    const html = `<body><div style="color:var(--cream);">washed out on cream body</div></body>`;
    const findings = findLowContrastText(html, cssVars);
    expect(findings).toHaveLength(1);
    expect(findings[0].textColor).toBe('var(--cream)');
  });

  it('flags low-opacity text composited against a resolved background', () => {
    // Same bug shape as PR #304's "Choose file & overwrite all" label: a
    // translucent colour that *looks* plausible but composites to a poor ratio.
    const html = `<div style="background:var(--ink2);color:rgba(255,255,255,.2);">barely there</div>`;
    expect(findLowContrastText(html, cssVars)).toHaveLength(1);
  });

  it('passes light text once a dark background ancestor is established', () => {
    const html = `
      <div style="background:var(--ink2);">
        <span style="color:var(--cream);">light on dark — fine</span>
      </div>`;
    expect(findLowContrastText(html, cssVars)).toHaveLength(0);
  });

  it('relaxes the threshold for large text', () => {
    // var(--text3) on var(--cream) is ~3.46:1 — fails normal-text AA (4.5)
    // but clears large-text AA (3.0).
    const small = `<div style="color:var(--text3);background:var(--cream);">small</div>`;
    const large = `<div style="color:var(--text3);background:var(--cream);font-size:28px;">large</div>`;
    expect(findLowContrastText(small, cssVars)).toHaveLength(1);
    expect(findLowContrastText(large, cssVars)).toHaveLength(0);
  });

  it('honors an explicit /* contrast-ok */ escape hatch', () => {
    const html = `<div style="color:var(--cream);/* contrast-ok */">reviewed exception</div>`;
    expect(findLowContrastText(html, cssVars)).toHaveLength(0);
  });

  it('does not guess at gradients — marks the subtree unknown instead of flagging', () => {
    const html = `<div style="background:linear-gradient(red,blue);color:var(--cream);">?</div>`;
    expect(findLowContrastText(html, cssVars)).toHaveLength(0);
  });

  it('does not flag a colour styling a standalone emoji icon', () => {
    const html = `<div style="color:var(--text2);background:rgba(255,255,255,.05);">📤</div>`;
    expect(findLowContrastText(html, cssVars)).toHaveLength(0);
  });

  it('still flags real text even when it shares a tag with no ASCII letters', () => {
    const html = `<div style="color:var(--cream);">123</div>`;
    expect(findLowContrastText(html, cssVars)).toHaveLength(1);
  });
});

describe('dark palette resolution', () => {
  it('overlays the dark :root onto the light one', () => {
    const darkVars = parseDarkVars(css, darkCss);
    const resolve = makeColorResolver(darkVars);
    // Re-pointed by the dark block.
    expect(resolve('var(--cream)')).toEqual({ r: 0x14, g: 0x11, b: 0x0d, a: 1 });
    // NOT re-pointed — must still resolve, inherited from the light :root.
    // If the overlay were replaced by a straight read of the dark block, these
    // would come back null and every check touching them would silently skip.
    expect(resolve('var(--on-inverse)')).toEqual({ r: 0xf7, g: 0xf2, b: 0xe9, a: 1 });
    expect(resolve('var(--on-accent)')).toEqual({ r: 255, g: 255, b: 255, a: 1 });
  });

  it('gives the two palettes genuinely different values', () => {
    expect(paletteFor('dark', css, darkCss).get('cream'))
      .not.toBe(paletteFor('light', css, darkCss).get('cream'));
  });
});

describe('contrast baseline', () => {
  const html = readFileSync(INDEX_HTML, 'utf8');
  const sweeps = scanThemes(html, css, darkCss);

  it('sweeps every shipped theme', () => {
    expect(sweeps.map(s => s.theme)).toEqual([...THEMES]);
  });

  it.each(THEMES)('keeps index.html free of NEW WCAG AA contrast failures [%s]', (theme) => {
    const { findings } = sweeps.find(s => s.theme === theme);
    const { fresh } = partitionFindings(findings, loadBaseline(undefined, theme));
    const detail = fresh
      .map(f => `index.html:${f.line} <${f.tag}> color:${f.textColor} on ${f.bgColor} = ${f.ratio}:1 (needs ${f.required}:1)`)
      .join('\n');
    expect(fresh, `New ${theme} contrast failures (not in scripts/contrast-baseline.json):\n${detail}`).toHaveLength(0);
  });

  it.each(THEMES)('accounts for every pre-existing failure via the baseline [%s]', (theme) => {
    // Guards against the baseline going stale: every currently-failing pairing
    // in index.html must have an entry in contrast-baseline.json, or be fixed.
    const { findings } = sweeps.find(s => s.theme === theme);
    const { known } = partitionFindings(findings, loadBaseline(undefined, theme));
    expect(known.length).toBe(findings.length);
  });

  // The dark sweep currently reports ZERO failures, which is the right result
  // (the dark palette was tuned against AA from the start, unlike the legacy
  // light one) but is indistinguishable from a sweep that silently resolves
  // nothing. Mutating a dark token must break it.
  it('the dark sweep actually reads the dark palette', () => {
    const broken = darkCss.replace('--text3: #9d9382;', '--text3: #2a2620;');
    expect(broken, 'anchor moved — update this mutation').not.toBe(darkCss);
    const findings = findLowContrastText(html, paletteFor('dark', css, broken));
    expect(findings.length).toBeGreaterThan(50);
  });

  it('keeps the light and dark baselines separate', () => {
    // Keys are RESOLVED colour pairs, so the two sweeps can never share one.
    // A shared key would mean a light exemption is silencing dark markup.
    const light = loadBaseline(undefined, 'light');
    const dark = loadBaseline(undefined, 'dark');
    expect([...dark].filter(k => light.has(k))).toEqual([]);
  });
});
