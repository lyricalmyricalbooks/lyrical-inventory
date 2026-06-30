import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  findLowContrastText, parseRootVars, contrastRatio, makeColorResolver,
  loadBaseline, partitionFindings, INDEX_HTML, STYLE_CSS,
} from '../scripts/check-contrast.mjs';

const css = readFileSync(STYLE_CSS, 'utf8');
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

describe('contrast baseline', () => {
  const html = readFileSync(INDEX_HTML, 'utf8');
  const allFindings = findLowContrastText(html, cssVars);
  const baseline = loadBaseline();
  const { fresh, known } = partitionFindings(allFindings, baseline);

  it('keeps index.html free of NEW WCAG AA contrast failures', () => {
    const detail = fresh
      .map(f => `index.html:${f.line} <${f.tag}> color:${f.textColor} on ${f.bgColor} = ${f.ratio}:1 (needs ${f.required}:1)`)
      .join('\n');
    expect(fresh, `New contrast failures (not in scripts/contrast-baseline.json):\n${detail}`).toHaveLength(0);
  });

  it('accounts for every pre-existing failure via the baseline (none silently swallowed)', () => {
    // Guards against the baseline going stale: every currently-failing pairing
    // in index.html must have an entry in contrast-baseline.json, or be fixed.
    expect(known.length).toBe(allFindings.length);
  });
});
