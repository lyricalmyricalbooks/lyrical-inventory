import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  THEME_STORAGE_KEY, THEME_PREFERENCES, THEME_COLORS, THEME_LABELS,
  normalizeThemePreference, readThemePreference, writeThemePreference,
  resolveTheme, systemPrefersDark, applyThemeToDocument, nextThemePreference,
} from '../src/lib/theme.js';
import { parseRootVars, makeColorResolver, contrastRatio } from '../scripts/check-contrast.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const styleCss = readFileSync(join(root, 'src/style.css'), 'utf8');
const systemCss = readFileSync(join(root, 'src/styles/system.css'), 'utf8');
const darkCss = readFileSync(join(root, 'src/styles/theme-dark.css'), 'utf8');
const indexHtml = readFileSync(join(root, 'index.html'), 'utf8');
const mainJs = readFileSync(join(root, 'src/main.js'), 'utf8');

// ---------------------------------------------------------------------------
// Preference plumbing
// ---------------------------------------------------------------------------

/** Minimal Storage stand-in; `fail` makes every call throw the way Safari
 *  private mode and a blocked-cookies profile do. */
function fakeStorage({ fail = false, seed = {} } = {}) {
  const map = new Map(Object.entries(seed));
  return {
    getItem(k) { if (fail) throw new Error('denied'); return map.has(k) ? map.get(k) : null; },
    setItem(k, v) { if (fail) throw new Error('denied'); map.set(k, String(v)); },
    _map: map,
  };
}

describe('normalizeThemePreference', () => {
  it('accepts the three real preferences', () => {
    for (const p of THEME_PREFERENCES) expect(normalizeThemePreference(p)).toBe(p);
  });

  it('falls back to system for anything else', () => {
    for (const bad of [null, undefined, '', 'DARK', 'sepia', 0, {}]) {
      expect(normalizeThemePreference(bad)).toBe('system');
    }
  });
});

describe('readThemePreference / writeThemePreference', () => {
  it('round-trips a stored preference', () => {
    const s = fakeStorage();
    expect(writeThemePreference('dark', s)).toBe(true);
    expect(s._map.get(THEME_STORAGE_KEY)).toBe('dark');
    expect(readThemePreference(s)).toBe('dark');
  });

  it('persists an explicit "system" choice rather than deleting the key', () => {
    const s = fakeStorage({ seed: { [THEME_STORAGE_KEY]: 'dark' } });
    writeThemePreference('system', s);
    expect(s._map.get(THEME_STORAGE_KEY)).toBe('system');
  });

  it('sanitises junk already in storage', () => {
    expect(readThemePreference(fakeStorage({ seed: { [THEME_STORAGE_KEY]: 'neon' } }))).toBe('system');
  });

  // Appearance is never worth breaking boot over — both paths swallow.
  it('survives storage that throws', () => {
    expect(readThemePreference(fakeStorage({ fail: true }))).toBe('system');
    expect(writeThemePreference('dark', fakeStorage({ fail: true }))).toBe(false);
    expect(readThemePreference(undefined && null)).toBe('system');
  });
});

describe('resolveTheme', () => {
  it('follows the OS only for "system"', () => {
    expect(resolveTheme('system', true)).toBe('dark');
    expect(resolveTheme('system', false)).toBe('light');
  });

  it('lets an explicit choice override the OS in BOTH directions', () => {
    // The light case is the one that regresses silently: a publisher who wants
    // the light UI under bright book-fair lights must keep it on a dark phone.
    expect(resolveTheme('light', true)).toBe('light');
    expect(resolveTheme('dark', false)).toBe('dark');
  });
});

describe('nextThemePreference', () => {
  it('cycles system -> light -> dark -> system', () => {
    expect(nextThemePreference('system')).toBe('light');
    expect(nextThemePreference('light')).toBe('dark');
    expect(nextThemePreference('dark')).toBe('system');
  });
});

describe('systemPrefersDark', () => {
  it('reads matchMedia when present', () => {
    expect(systemPrefersDark({ matchMedia: () => ({ matches: true }) })).toBe(true);
    expect(systemPrefersDark({ matchMedia: () => ({ matches: false }) })).toBe(false);
  });

  it('returns false rather than throwing when matchMedia is missing or broken', () => {
    expect(systemPrefersDark({})).toBe(false);
    expect(systemPrefersDark({ matchMedia() { throw new Error('nope'); } })).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Application to the document
// ---------------------------------------------------------------------------

describe('applyThemeToDocument', () => {
  beforeEach(() => {
    document.documentElement.removeAttribute('data-theme');
    document.documentElement.className = '';
    document.documentElement.style.removeProperty('background-color');
    document.head.innerHTML = '<meta name="theme-color" content="#0e0c0a">';
  });

  const meta = () => document.querySelector('meta[name="theme-color"]').getAttribute('content');

  it('pins an explicit preference with data-theme', () => {
    expect(applyThemeToDocument('dark', { prefersDark: false })).toBe('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(document.documentElement.classList.contains('theme-dark')).toBe(true);
  });

  // Setting data-theme="light" for 'system' would silently stop the app from
  // ever following the OS again — the media query is scoped to :not([data-theme="light"]).
  it('REMOVES data-theme for "system" so the media query governs', () => {
    applyThemeToDocument('dark', { prefersDark: false });
    applyThemeToDocument('system', { prefersDark: false });
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false);
    expect(document.documentElement.classList.contains('theme-light')).toBe(true);
  });

  it('mirrors the RESOLVED theme onto the class, not the preference', () => {
    applyThemeToDocument('system', { prefersDark: true });
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false);
    expect(document.documentElement.classList.contains('theme-dark')).toBe(true);
  });

  it('keeps <meta name="theme-color"> in step with the resolved theme', () => {
    applyThemeToDocument('dark', { prefersDark: false });
    expect(meta()).toBe(THEME_COLORS.dark);
    applyThemeToDocument('light', { prefersDark: true });
    expect(meta()).toBe(THEME_COLORS.light);
  });

  // The pre-paint bootstrap paints <html> inline to kill the launch flash.
  // Left behind, that inline value pins the page dark through a later switch.
  it('clears the bootstrap\'s inline background so a switch to light takes', () => {
    document.documentElement.style.backgroundColor = '#14110d';
    applyThemeToDocument('light', { prefersDark: true });
    expect(document.documentElement.style.backgroundColor).toBe('');
  });
});

// ---------------------------------------------------------------------------
// The pre-paint bootstrap duplicates this logic by necessity (an ES module
// import is deferred and would paint first). These guard the duplication.
// ---------------------------------------------------------------------------

describe('index.html theme bootstrap', () => {
  const boot = indexHtml.slice(
    indexHtml.indexOf('<!-- THEME BOOTSTRAP'),
    indexHtml.indexOf('</script>', indexHtml.indexOf('<!-- THEME BOOTSTRAP')),
  );

  it('exists and runs before the module bundle', () => {
    expect(boot).toBeTruthy();
    expect(indexHtml.indexOf('<!-- THEME BOOTSTRAP'))
      .toBeLessThan(indexHtml.indexOf('<script type="module" src="/src/main.js">'));
  });

  it('reads the same storage key the module writes', () => {
    expect(boot).toContain(THEME_STORAGE_KEY);
  });

  it('uses the same dark theme-color as THEME_COLORS', () => {
    expect(boot).toContain(THEME_COLORS.dark);
  });

  it('paints the dark page colour the stylesheet will settle on', () => {
    const darkPage = darkCss.match(/:root\[data-theme="dark"\][\s\S]*?--cream:\s*(#[0-9a-f]{6})/i)[1];
    expect(boot).toContain(darkPage);
  });

  it('removes data-theme for "system" exactly like applyThemeToDocument', () => {
    expect(boot).toContain("removeAttribute('data-theme')");
  });
});

// ---------------------------------------------------------------------------
// The invariant that makes the whole theme work
// ---------------------------------------------------------------------------

describe('--cream is never used as a text colour', () => {
  // --cream is a SURFACE and the dark theme flips it. `color:var(--cream)`
  // reads fine today and becomes dark-on-dark the moment the theme switches;
  // --on-inverse / --on-accent are the tokens for text on a dark surface.
  const OFFENDER = /(?<!-)color\s*:\s*var\(\s*--cream\d?\s*\)/g;

  /** The rule is stated verbatim in several comments; strip those so the guard
   *  reads declarations only and the documentation doesn't fail its own test. */
  const stripComments = (src) => src
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/^\s*\/\/.*$/gm, ' ');

  it.each([
    ['src/style.css', styleCss],
    ['src/styles/system.css', systemCss],
    ['index.html', indexHtml],
    ['src/main.js', mainJs],
  ])('%s uses --on-inverse instead', (_name, source) => {
    expect(stripComments(source).match(OFFENDER) ?? []).toEqual([]);
  });

  it('defines --on-inverse and --on-accent as theme-stable', () => {
    expect(styleCss).toMatch(/--on-inverse:\s*#f7f2e9/);
    expect(styleCss).toMatch(/--on-accent:\s*#fff/);
    // Theme-stable means the dark block must NOT redefine them.
    expect(darkCss).not.toMatch(/--on-inverse\s*:/);
    expect(darkCss).not.toMatch(/--on-accent\s*:/);
  });

  // --on-accent and --on-status look interchangeable and are not. A fill that
  // is the same colour in both themes (the red alert band, the violet update
  // badge) keeps a white label; a STATUS fill inverts, so its label must too.
  it('flips --on-status to --ink for dark, unlike --on-accent', () => {
    expect(styleCss).toMatch(/--on-status:\s*#fff/);
    expect(darkVarsRaw.get('on-status')).toBe('var(--ink)');
  });

  it('labels every solid status fill with --on-status, never --on-accent', () => {
    // A `background:var(--green|--red|--amber)` block carrying --on-accent
    // would render white-on-pastel in dark mode at roughly 1.9:1.
    const blocks = styleCss.match(/\{[^{}]*background:\s*var\(--(green|red|amber|blue)\)[^{}]*\}/g) ?? [];
    for (const block of blocks) {
      expect(block, `status fill must use --on-status:\n${block}`).not.toContain('var(--on-accent)');
    }
  });

  it('points --content-on-inverse at --on-inverse, not --cream', () => {
    expect(systemCss).toMatch(/--content-on-inverse:\s*var\(--on-inverse\)/);
  });
});

// ---------------------------------------------------------------------------
// Palette completeness + measured contrast
// ---------------------------------------------------------------------------

/** Pulls a `selector { … }` block's custom properties out of a stylesheet. */
function parseBlockVars(css, startMarker) {
  const from = css.indexOf(startMarker);
  if (from === -1) return new Map();
  const open = css.indexOf('{', from);
  const close = css.indexOf('\n  }', open) === -1 ? css.indexOf('\n}', open) : css.indexOf('\n  }', open);
  const body = css.slice(open + 1, close);
  const vars = new Map();
  for (const decl of body.split(';')) {
    const m = decl.match(/--([\w-]+)\s*:\s*([^;]+)/s);
    if (m) vars.set(m[1].trim(), m[2].trim());
  }
  return vars;
}

const lightVars = parseRootVars(styleCss);
const darkVars = parseBlockVars(darkCss, ':root[data-theme="dark"]');
/** Same map, before var() chains are followed — for asserting on the raw value. */
const darkVarsRaw = darkVars;
const osVars = parseBlockVars(darkCss, ':root:not([data-theme="light"])');

describe('dark palette', () => {
  it('re-points every colour primitive the light theme defines', () => {
    // Anything colour-ish in :root that is NOT deliberately theme-stable has to
    // have a dark counterpart, or that component ships half-themed.
    const STABLE = new Set([
      'on-inverse', 'on-inverse-2', 'on-inverse-3', 'on-accent',
      'book-accent', 'book-accent-bg', 'book-accent-light',
      'book-accent-text', 'book-accent-contrast',
      'select-arrow-gold', 'shadow', 'shadow2',
    ]);
    const missing = [];
    for (const [name, value] of lightVars) {
      if (STABLE.has(name)) continue;
      if (!/^(#|rgba?\(|url\()/i.test(value)) continue; // not a colour/asset literal
      if (!darkVars.has(name)) missing.push(name);
    }
    expect(missing, `dark theme is missing: ${missing.join(', ')}`).toEqual([]);
  });

  it('keeps the explicit-dark and follow-the-OS blocks identical', () => {
    // Two blocks exist because CSS cannot OR an attribute selector with a media
    // query. They must not drift, or "Auto" and "Dark" render differently.
    expect([...osVars.keys()].sort()).toEqual([...darkVars.keys()].sort());
    for (const [name, value] of darkVars) expect(osVars.get(name), name).toBe(value);
  });

  it('declares color-scheme so native controls and scrollbars follow', () => {
    expect(darkCss).toMatch(/:root\[data-theme="dark"\][\s\S]{0,200}color-scheme:\s*dark/);
  });

  it('does not pin light with data-theme="light" in the media query', () => {
    expect(darkCss).toContain(':root:not([data-theme="light"])');
  });
});

describe('dark palette contrast (WCAG AA)', () => {
  const resolve = makeColorResolver(darkVars);
  const rgb = (token) => {
    const c = resolve(token);
    return { r: c.r, g: c.g, b: c.b };
  };
  /** Composites a translucent tint over a surface, as the browser will. */
  const over = (tint, surface) => {
    const f = resolve(tint); const b = rgb(surface);
    const a = f.a ?? 1;
    return { r: f.r * a + b.r * (1 - a), g: f.g * a + b.g * (1 - a), b: f.b * a + b.b * (1 - a) };
  };

  const PAGE = 'var(--cream)';
  const CARD = 'var(--surface-card)';
  const INK = 'var(--ink)';

  // text-on-surface pairings that carry real information.
  it.each([
    ['--text on page', 'var(--text)', rgb(PAGE)],
    ['--text on card', 'var(--text)', rgb(CARD)],
    ['--text2 on page', 'var(--text2)', rgb(PAGE)],
    ['--text2 on card', 'var(--text2)', rgb(CARD)],
    ['--text3 on page', 'var(--text3)', rgb(PAGE)],
    ['--text3 on inset', 'var(--text3)', rgb('var(--cream3)')],
    ['--gold on page', 'var(--gold)', rgb(PAGE)],
    ['--gold3 on ink', 'var(--gold3)', rgb(INK)],
    ['--on-inverse on ink', '#f7f2e9', rgb(INK)],
    ['--green on --green-bg', 'var(--green)', over('var(--green-bg)', CARD)],
    ['--red on --red-bg', 'var(--red)', over('var(--red-bg)', CARD)],
    ['--amber on --amber-bg', 'var(--amber)', over('var(--amber-bg)', CARD)],
    ['--blue on --blue-bg', 'var(--blue)', over('var(--blue-bg)', CARD)],
    ['--gold-text on --gold-bg', 'var(--gold-text)', over('var(--gold-bg)', CARD)],
    ['--emerald on page', 'var(--emerald)', rgb(PAGE)],
    ['--rose on page', 'var(--rose)', rgb(PAGE)],
    ['--violet-deep on page', 'var(--violet-deep)', rgb(PAGE)],
    ['--orange-deep on page', 'var(--orange-deep)', rgb(PAGE)],
    ['--slate on page', 'var(--slate)', rgb(PAGE)],
  ])('%s clears 4.5:1', (_label, fg, bg) => {
    expect(contrastRatio(rgb(fg), bg)).toBeGreaterThanOrEqual(4.5);
  });

  it('keeps the header chrome distinguishable from the page behind it', () => {
    // --ink is the header/toast surface. In dark mode both are dark, so if the
    // two collapse to the same value the app loses its structure entirely.
    expect(resolve('var(--ink)')).not.toEqual(resolve('var(--cream)'));
    expect(contrastRatio(rgb('var(--ink)'), rgb(PAGE))).toBeGreaterThan(1.05);
  });

  it('steps each surface above the one below it', () => {
    const lum = (t) => {
      const { r, g, b } = rgb(t);
      const ch = (c) => { const v = c / 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
      return 0.2126 * ch(r) + 0.7152 * ch(g) + 0.0722 * ch(b);
    };
    expect(lum('var(--ink)')).toBeLessThan(lum('var(--cream)'));
    expect(lum('var(--cream)')).toBeLessThan(lum('var(--cream2)'));
    expect(lum('var(--cream2)')).toBeLessThan(lum('var(--cream3)'));
    expect(lum('var(--cream3)')).toBeLessThan(lum('var(--cream4)'));
  });
});

// ---------------------------------------------------------------------------
// The control itself
// ---------------------------------------------------------------------------

describe('appearance control', () => {
  it('is rendered in both account menus', () => {
    // The publisher shell hides the header account menu, so a single copy
    // would leave shell users with no way to reach the setting.
    expect(indexHtml.match(/data-theme-seg/g) ?? []).toHaveLength(2);
    expect(indexHtml).toContain('id="theme-sub-header"');
    expect(indexHtml).toContain('id="theme-sub-side"');
  });

  it('is announced as a radiogroup', () => {
    expect(indexHtml).toMatch(/role="radiogroup"[^>]*aria-label="Appearance"|aria-label="Appearance"[^>]*role="radiogroup"/);
  });

  it('exposes its handlers to the inline onclick layer', () => {
    expect(mainJs).toMatch(/setThemePreference,\s*cycleThemePreference/);
  });

  it('labels every preference', () => {
    for (const p of THEME_PREFERENCES) expect(THEME_LABELS[p]).toBeTruthy();
  });

  it('gives each segment a full touch target (AGENTS.md §3)', () => {
    const rule = styleCss.match(/\.theme-seg-opt\{[^}]*\}/)[0];
    expect(rule).toContain('min-height:var(--target-min)');
    expect(rule).toContain('min-width:44px');
  });
});
