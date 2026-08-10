import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  findLowContrastText, parseRootVars, parseDarkVars, paletteFor, scanThemes,
  contrastRatio, makeColorResolver, loadBaseline, partitionFindings,
  extractTemplateLiterals, blankInterpolations, htmlFragments,
  scanJsSources, jsRenderSources,
  findFaintTierMisuse, findThemeBlindTextColours, DOCUMENT_BUILDERS,
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

describe('extractTemplateLiterals', () => {
  it('pulls a simple literal', () => {
    expect(extractTemplateLiterals('const a = `<div>hi</div>`;').map(l => l.text))
      .toEqual(['`<div>hi</div>`']);
  });

  // The reason this is hand-rolled rather than a regex: a regex stopping at the
  // first backtick truncates the outer literal mid-tag and invents markup.
  it('keeps a nested literal inside an interpolation with its outer literal', () => {
    const js = 'x = `<ul>${xs.map(x => `<li>${x}</li>`).join("")}</ul>`;';
    const [outer] = extractTemplateLiterals(js);
    expect(outer.text.startsWith('`<ul>')).toBe(true);
    expect(outer.text.endsWith('</ul>`')).toBe(true);
  });

  it('ignores backticks inside strings and comments', () => {
    expect(extractTemplateLiterals('const s = "a ` b"; // ` trailing')).toEqual([]);
    expect(extractTemplateLiterals('/* ` */ const s = 1;')).toEqual([]);
  });

  it('reports each literal\'s offset so line numbers can be recovered', () => {
    const js = 'a;\nb;\nconst t = `<p>x</p>`;';
    expect(js.slice(0, extractTemplateLiterals(js)[0].index).split('\n').length).toBe(3);
  });
});

describe('blankInterpolations', () => {
  it('blanks ${…} but preserves length and newlines so lines stay exact', () => {
    const src = '`a${ x\ny }b`';
    const out = blankInterpolations(src);
    expect(out).toBe('`a    \n   b`');
    expect(out).toHaveLength(src.length);
    expect(out.split('\n')).toHaveLength(src.split('\n').length);
  });

  it('handles nested braces inside an interpolation', () => {
    expect(blankInterpolations('${ {a:1} }x').trim()).toBe('x');
  });

  // Blanking is the honest move: the value is unknowable statically, and an
  // unresolvable colour is already treated as "unknown" and skipped.
  it('turns an interpolated colour into something unresolvable', () => {
    const frag = blankInterpolations('<div style="color:${c};background:#fff">t</div>');
    expect(findLowContrastText(frag, cssVars, { rootBg: null, rootText: null })).toEqual([]);
  });
});

describe('htmlFragments', () => {
  it('keeps HTML-ish literals and drops the rest', () => {
    const js = 'const a = `just text`; const b = `<div style="color:red">x</div>`;';
    expect(htmlFragments(js).map(f => f.fragment)).toEqual(['`<div style="color:red">x</div>`']);
  });
});

describe('scanJsSources', () => {
  const scan = (source) => scanJsSources([{ file: 'f.js', source }], cssVars);

  it('flags a self-contained bad pairing inside one fragment', () => {
    expect(scan('x = `<div style="background:var(--cream);color:var(--cream)">t</div>`;'))
      .toHaveLength(1);
  });

  // The design decision this pins down. A fragment's real parent lives
  // elsewhere — a POS row is injected into a card, a menu item into an ink
  // panel — so assuming the page background would flag every light-on-dark
  // label in the app. Unknown root means "only judge what the fragment itself
  // establishes".
  it('does NOT guess at a background the fragment never sets', () => {
    expect(scan('x = `<div style="color:var(--on-inverse)">on some dark panel</div>`;'))
      .toEqual([]);
  });

  it('inherits a background set higher up in the SAME fragment', () => {
    expect(scan('x = `<div style="background:var(--surface-card)"><span style="color:var(--cream)">t</span></div>`;'))
      .toHaveLength(1);
  });

  it('reports the line in the original file, not in the fragment', () => {
    // Anchors to where the TAG opens (line 4), not where the style attribute
    // continues onto line 5 — matches how the index.html sweep reports.
    const js = '\n\n\nx = `<div\n  style="background:var(--cream);color:var(--cream)">t</div>`;';
    expect(scan(js)[0].line).toBe(4);
  });

  it('covers main.js and every feature module', () => {
    const files = jsRenderSources().map(s => s.file);
    expect(files).toContain('src/main.js');
    expect(files.filter(f => f.startsWith('src/features/')).length).toBeGreaterThan(2);
  });
});

// ---------------------------------------------------------------------------
// The faint tier (--text4) measures 1.92:1 on the page — below every WCAG
// threshold, including the 3:1 floor for non-text. It cannot hold anything a
// publisher has to read; it exists for em-dashes and chevrons.
// ---------------------------------------------------------------------------

describe('faint tier is reviewed, not sprayed', () => {
  const sources = () => [
    { file: 'src/style.css', source: css },
    { file: 'src/styles/theme-dark.css', source: darkCss },
    ...jsRenderSources(),
  ];

  it('has no unreviewed --text4 text anywhere', () => {
    const found = findFaintTierMisuse(sources());
    const detail = found.map(f => `  ${f.file}:${f.line} ${f.snippet}`).join('\n');
    expect(found, `Unreviewed faint-tier text:\n${detail}`).toEqual([]);
  });

  it('catches an unmarked use', () => {
    // Guards the guard — zero above must mean reviewed, not unseen.
    expect(findFaintTierMisuse([{ file: 'x.css', source: '.a{color:var(--text4);}' }])).toHaveLength(1);
  });

  it('accepts a marked one, on the line or in the comment above', () => {
    expect(findFaintTierMisuse([{ file: 'x.css', source: '.a{color:var(--text4); /* faint-ok */}' }])).toEqual([]);
    expect(findFaintTierMisuse([{ file: 'x.css', source: '/* faint-ok: a chevron */\n.a{\ncolor:var(--text4);}' }])).toEqual([]);
  });

  it('does not confuse --text4 with the tiers that may hold content', () => {
    expect(findFaintTierMisuse([{ file: 'x.css', source: '.a{color:var(--text3);}' }])).toEqual([]);
    expect(findFaintTierMisuse([{ file: 'x.css', source: '.a{border-color:var(--text4);}' }])).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// A hardcoded dark colour cannot follow the theme. Unlike a token there is no
// cascade to save it, so on a flipping surface it simply vanishes.
// ---------------------------------------------------------------------------

describe('rendered HTML carries no theme-blind dark text', () => {
  const darkVars = paletteFor('dark', css, darkCss);

  it('is clean outside the document builders', () => {
    const found = findThemeBlindTextColours(jsRenderSources(), darkVars);
    const detail = found.map(f => `  ${f.file}:${f.line} color:${f.colour} in ${f.owner}`).join('\n');
    expect(found, `Theme-blind dark text in app UI:\n${detail}`).toEqual([]);
  });

  it('catches a dark literal in an unlisted function', () => {
    const src = 'function renderThing() {\n  return `<div style="color:#111">x</div>`;\n}';
    expect(findThemeBlindTextColours([{ file: 'f.js', source: src }], darkVars)).toHaveLength(1);
  });

  it('allows one inside a named document builder', () => {
    // An invoice a store receives is ink on white whatever the operator's
    // screen is set to, and var() does not survive a mail client at all.
    const src = 'function buildInvoiceEmailHTML() {\n  return `<div style="color:#111">x</div>`;\n}';
    expect(findThemeBlindTextColours([{ file: 'f.js', source: src }], darkVars)).toEqual([]);
  });

  it('ignores a LIGHT literal, which reads on the dark surface', () => {
    const src = 'function renderThing() {\n  return `<div style="color:#f0c060">x</div>`;\n}';
    expect(findThemeBlindTextColours([{ file: 'f.js', source: src }], darkVars)).toEqual([]);
  });

  it('keeps the allowlist to real document and console builders', () => {
    // If this grows, something is being excused rather than fixed.
    expect(DOCUMENT_BUILDERS.size).toBeLessThanOrEqual(14);
    expect(DOCUMENT_BUILDERS.has('buildInvoiceEmailHTML')).toBe(true);
  });
});

describe('contrast baseline', () => {
  const html = readFileSync(INDEX_HTML, 'utf8');
  const sweeps = scanThemes(html, css, darkCss);

  it('sweeps every shipped theme', () => {
    expect(sweeps.map(s => s.theme)).toEqual([...THEMES]);
  });

  it('covers the rendered HTML, not just index.html', () => {
    // index.html is the skeleton; the POS cart, order history and expense
    // ledger are template literals that never appear in it.
    const files = new Set(sweeps.flatMap(s => s.findings).map(f => f.file));
    expect([...files].some(f => f && f.startsWith('src/'))).toBe(true);
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

  it('only shares a baseline key where the markup is theme-independent', () => {
    // Keys are RESOLVED colour pairs. Token-driven markup therefore resolves
    // differently per theme and can never share a key — a shared key would mean
    // a light exemption silencing dark markup.
    //
    // The exception, and the reason this isn't simply "disjoint": the rendered
    // sweep also covers markup that is deliberately theme-independent — the
    // invoice and email templates (printed/emailed documents) and the
    // mock-spreadsheet skeuomorph. Those are literal-on-literal, identical in
    // both themes, and legitimately resolve to the same pair twice.
    const light = loadBaseline(undefined, 'light');
    const dark = loadBaseline(undefined, 'dark');
    const shared = [...dark].filter(k => light.has(k));

    const byKey = new Map();
    for (const { findings } of sweeps) for (const f of findings) byKey.set(f.key, f);
    for (const key of shared) {
      const f = byKey.get(key);
      expect(
        `${f.textColor} on ${f.bgColor}`,
        `shared key ${key} uses a token, so it should differ per theme`,
      ).not.toContain('var(--');
    }
  });
});
