// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import postcss from 'postcss';
import { makeColorResolver, contrastRatio, paletteFor } from '../scripts/check-contrast.mjs';
import { getPaperSafeText, PAPER_SURFACE } from '../src/lib/money.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');
const styleCss = read('src/style.css');
const darkCss = read('src/styles/theme-dark.css');
const mainJs = read('src/main.js');

// Night mode's "Press Proof" paints every object (card, modal, table, stat
// tile) as light paper on the black page. The objects each re-declared the
// surface/text tokens their own components read, but none re-declared the
// STATUS and ACCENT inks, which stayed the dark palette's light values: on a
// paper card every "money in" figure, overdue badge, category link and
// channel tag was pale-on-pale (the Tax Centre ledger's amounts at 1.4:1).
// Found by walking the running app screen by screen in Chromium; jsdom cannot
// resolve var(), so these pin the rules that fix it.

const PAPER_OBJECTS = ['.card', '.modal', '.tbl-wrap', '.kpi', '.metric-banner', '.stock-block', '.payment-methods-card'];

const parsed = postcss.parse(darkCss);
const rulesMatching = (test) => {
  const out = [];
  parsed.walkRules((r) => { if (test(r.selector)) out.push(r); });
  return out;
};
const decls = (rule) => {
  const map = new Map();
  rule.walkDecls((d) => map.set(d.prop, d.value));
  return map;
};

const paperScope = rulesMatching((s) => s.startsWith('.theme-dark :is(.card'))[0];
const lightRoot = (() => {
  const map = new Map();
  postcss.parse(styleCss).walkRules((r) => {
    if (r.selector === ':root' && map.size === 0) r.walkDecls((d) => map.set(d.prop, d.value));
  });
  return map;
})();

describe('the paper scope', () => {
  it('exists as one rule that covers every paper object', () => {
    expect(paperScope, 'expected a `.theme-dark :is(.card, …)` rule').toBeTruthy();
    for (const obj of PAPER_OBJECTS) expect(paperScope.selector, obj).toContain(obj);
  });

  it('marks paper as a light surface for the browser\'s own controls', () => {
    // A date field's calendar glyph, checkboxes and bare links otherwise draw
    // in their pale dark-scheme style on a light card.
    expect(decls(paperScope).get('color-scheme')).toBe('light');
  });

  it('restores the light theme\'s text-grade status and accent inks', () => {
    const d = decls(paperScope);
    for (const token of ['--gold-text', '--green', '--red', '--amber', '--blue',
      '--emerald-deep', '--rose-deep', '--orange-ink', '--violet-deep', '--slate']) {
      expect(d.get(token), token).toBeTruthy();
      expect(d.get(token).toUpperCase(), `${token} must be the LIGHT :root's own value`)
        .toBe(lightRoot.get(token).toUpperCase());
    }
  });

  it('re-declares the :root aliases, which otherwise carry the dark values in', () => {
    // --status-active: var(--amber) is resolved on :root and inherited as the
    // finished colour, so re-pointing --amber alone never reaches it.
    const d = decls(paperScope);
    for (const [alias, target] of [
      ['--status-active', 'var(--amber)'], ['--status-positive', 'var(--green)'],
      ['--status-critical', 'var(--red)'], ['--status-info', 'var(--blue)'],
      ['--status-neutral', 'var(--text3)'], ['--border-subtle', 'var(--border2)'],
      ['--content-secondary', 'var(--on-paper2)'], ['--content-muted', 'var(--on-paper3)'],
      ['--surface-page', 'var(--paper)'], ['--surface-inset', 'var(--paper2)'],
      ['--cream3', 'var(--paper3)'], ['--input-bg', 'var(--paper)'],
    ]) {
      expect(d.get(alias), alias).toBe(target);
    }
  });

  it('swaps in the paper-safe book accent, falling back to the paper --gold-text', () => {
    expect(decls(paperScope).get('--book-accent-text'))
      .toBe('var(--book-accent-text-on-paper, var(--gold-text))');
    expect(mainJs).toMatch(/setProperty\('--book-accent-text-on-paper', getPaperSafeText\(book\.accent\)\)/);
    expect(mainJs).toMatch(/removeProperty\('--book-accent-text-on-paper'\)/);
  });

  it('leaves the flare FILLS alone, so every object keeps its registration fringe', () => {
    const d = decls(paperScope);
    for (const fill of ['--gold', '--gold2', '--gold3']) expect(d.has(fill), fill).toBe(false);
  });

  it('terminates every custom property before its trailing comment', () => {
    // A missing semicolon makes the comment part of the value AND swallows the
    // next declaration — the element silently keeps the dark value.
    const body = darkCss.slice(darkCss.indexOf('.theme-dark :is(.card'));
    const block = body.slice(0, body.indexOf('\n}'));
    for (const line of block.split('\n')) {
      const decl = line.trim();
      if (!decl.startsWith('--')) continue;
      expect(decl.split('/*')[0].trimEnd(), decl).toMatch(/;$/);
    }
  });
});

describe('the restored inks read on every paper step', () => {
  const darkVars = paletteFor('dark', styleCss, darkCss);
  const resolve = makeColorResolver(darkVars);
  const rgb = (v) => { const c = resolve(v); return { r: c.r, g: c.g, b: c.b }; };
  const d = decls(paperScope);
  const ink = (token) => {
    let v = d.get(token);
    // one level of indirection inside the scope (e.g. --orange-deep → --orange-ink)
    const ref = v.match(/^var\((--[\w-]+)\)$/);
    if (ref && d.has(ref[1])) v = d.get(ref[1]);
    return rgb(v);
  };

  it.each(['--gold-text', '--green', '--red', '--amber', '--blue', '--emerald-deep',
    '--rose-deep', '--orange-deep', '--orange-ink', '--violet-deep', '--slate'])(
    '%s clears 4.5:1 on --paper and --paper2', (token) => {
      for (const surface of ['var(--paper)', 'var(--paper2)']) {
        expect(contrastRatio(ink(token), rgb(surface)), surface).toBeGreaterThanOrEqual(4.5);
      }
    },
  );
});

describe('solid pills and the danger button keep their bright fills inside paper', () => {
  // Inside paper, --green/--red/--amber/--blue become dark text-grade inks. A
  // sticker that filled with them would put ink text on dark green.
  const pageLevel = rulesMatching((s) => s === '.theme-dark')
    .map(decls).find((m) => m.has('--sticker-green'));

  it('captures the sticker fills at the page, before any paper scope', () => {
    expect(pageLevel, 'expected --sticker-* on `.theme-dark`').toBeTruthy();
    for (const tone of ['green', 'amber', 'red', 'blue']) {
      expect(pageLevel.get(`--sticker-${tone}`)).toBe(`var(--${tone})`);
    }
  });

  it.each(['green', 'amber', 'red', 'blue'])('.pill.%s fills with its sticker token', (tone) => {
    const rule = rulesMatching((s) => s === `.theme-dark .pill.${tone}`)[0];
    expect(decls(rule).get('background')).toBe(`var(--sticker-${tone})`);
  });

  it('.btn.danger-btn fills with the sticker red, hover included', () => {
    expect(decls(rulesMatching((s) => s === '.theme-dark .btn.danger-btn')[0]).get('background'))
      .toBe('var(--sticker-red)');
    expect(decls(rulesMatching((s) => s === '.theme-dark .btn.danger-btn:hover')[0]).get('background'))
      .toBe('var(--sticker-red-hover)');
  });
});

describe('paper-faced buttons', () => {
  it('re-ink only buttons without an inline background', () => {
    // A transparent button over a dark order card keeps the page's light inks;
    // re-inking it too would put ink text on charcoal.
    const rule = rulesMatching((s) => s === '.theme-dark .btn:not([style*="background"])')[0];
    expect(rule, 'expected the paper-face button rule').toBeTruthy();
    expect(decls(rule).get('--text3')).toBe('var(--on-paper3)');
    expect(decls(rule).has('--focus-ring-color'), 'a button ring is drawn on the black page').toBe(false);
  });
});

describe('.tbl-wrap is paper, not a window onto the black page', () => {
  it('paints its own background', () => {
    // A <tfoot> row and a row faded with opacity show whatever is behind the
    // wrap: black at night, which put the Tax Centre's category totals
    // ink-on-black and turned reimbursed expense rows muddy grey.
    expect(decls(rulesMatching((s) => s === '.theme-dark .tbl-wrap')[0]).get('background'))
      .toBe('var(--paper)');
  });
});

describe('Open Call cards are paper', () => {
  it('its !important card washes are paper, not a dark wash under ink text', () => {
    for (const sel of ['.theme-dark .oc-contributor-card', '.theme-dark .oc-empty-state']) {
      expect(decls(rulesMatching((s) => s === sel)[0]).get('background'), sel).toMatch(/var\(--paper\)/);
    }
  });
});

describe('getPaperSafeText', () => {
  const lum = (hex) => {
    const c = hex.replace('#', '');
    const ch = (i) => {
      const v = parseInt(c.substring(i, i + 2), 16) / 255;
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    };
    return 0.2126 * ch(0) + 0.7152 * ch(2) + 0.0722 * ch(4);
  };
  const ratio = (a, b) => { const x = lum(a); const y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };

  it('measures against the darkest paper step', () => {
    const paper3 = darkCss.match(/--paper3:\s*(#[0-9A-Fa-f]{6})/)[1];
    expect(PAPER_SURFACE.toUpperCase()).toBe(paper3.toUpperCase());
  });

  // The shipped cover accents, plus a pale yellow and a mid blue — the kind
  // the light-theme helper passes straight through.
  it.each(['#c8913a', '#3a7cc8', '#7a5c3a', '#2a7a5c', '#8a3a7a', '#FFD84D', '#6366f1', '#0ea5e9'])(
    '%s clears 4.5:1 on paper', (accent) => {
      const text = getPaperSafeText(accent);
      expect(text).toMatch(/^#[0-9a-f]{6}$/i);
      expect(ratio(text, PAPER_SURFACE)).toBeGreaterThanOrEqual(4.5);
    },
  );

  it('keeps a cover that already reads, so the colour survives when it can', () => {
    expect(getPaperSafeText('#8a3a7a')).toBe('#8a3a7a');
  });

  it('falls back to the ink for anything that is not #rrggbb', () => {
    for (const bad of [undefined, null, '', 'red', 'rgba(1,2,3,.1)', '#abc']) {
      expect(getPaperSafeText(bad)).toBe('var(--ink)');
    }
  });
});

describe('every tab panel lives inside the app column', () => {
  // A modal footer lost its opening tag in a merge. Its two closing tags then
  // ended #pw-app early, so Tax Centre, POS, Shipping, Settings, Big Cartel,
  // Web Analytics and Backups sat outside the column that reserves room for
  // the sidebar — and slid underneath it, clipping their headings.
  it('no .tab-panel escapes #pw-app', () => {
    const doc = new DOMParser().parseFromString(read('index.html'), 'text/html');
    const escaped = [...doc.querySelectorAll('.tab-panel')].filter((p) => !p.closest('#pw-app')).map((p) => p.id);
    expect(escaped).toEqual([]);
  });
});

describe('no font the Riso repaint dropped is still asked for', () => {
  // Playfair Display, Syne and Cormorant Garamond are no longer loaded, so a
  // rule naming them falls back to the browser's Times/Georgia serif — which is
  // how three Open Call headings and two empty-state titles rendered.
  const files = ['src/style.css', 'src/styles/system.css', 'src/styles/theme-dark.css',
    'src/features/opencall.js', 'src/features/shipping.js'];
  it.each(files)('%s', (file) => {
    const code = read(file).replace(/\/\*[\s\S]*?\*\//g, '');
    expect(code).not.toMatch(/font-family\s*:[^;"`]*(Playfair|Syne|Cormorant)/i);
  });
});
