import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative } from 'node:path';
import postcss from 'postcss';
import { paletteFor, parseRootVars, makeColorResolver, contrastRatio } from '../scripts/check-contrast.mjs';

// Night mode is all dark surfaces with light text (theme-dark.css). A button
// is a dark raised control whose label inherits the light --text. The failure
// this guards against is a component that also carries `btn` and paints its
// own background with a rule more specific than `.theme-dark .btn`: if that
// background comes out LIGHT (a white fill, an un-themed literal), the light
// label lands pale-on-pale. The old light-tile dark mode hit the mirror image
// of this three times (the book picker cards at 1.07:1, outline and Open Call
// buttons at ~2.3:1).
//
// This sweep finds that shape statically: every class list in the app's
// markup that includes `btn`, every rule whose classes fit one of them, that
// out-specifies the dark `.btn` rule and sets a background — resolved in the
// dark palette and measured against the text it will actually carry.

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');
const styleCss = read('src/style.css');
const darkCss = read('src/styles/theme-dark.css');
const BASE_SHEETS = ['src/styles/system.css', 'src/style.css', 'src/styles/phone.css'];
const AA = 4.5;

// `.theme-dark .btn` — the rule every class-painted button has to beat.
const DARK_BTN_SPECIFICITY = 20;

const walk = (dir) => readdirSync(dir).flatMap((f) => {
  const p = join(dir, f);
  return statSync(p).isDirectory() ? walk(p) : [p];
});

/** The class list of every element in the markup that carries `btn`. */
function buttonClassLists(files) {
  const out = [];
  for (const file of files) {
    for (const m of readFileSync(file, 'utf8').matchAll(/class(?:Name)?\s*=\s*(["'`])([^"'`\n]*)\1|["'`]([^"'`\n]*\bbtn\b[^"'`\n]*)["'`]/g)) {
      const tokens = (m[2] ?? m[3]).split(/\s+/).filter((t) => /^[a-z][\w-]*$/i.test(t));
      if (tokens.includes('btn')) out.push(new Set(tokens));
    }
  }
  return out;
}

function specificity(selector) {
  const s = selector.replace(/:(?:not|is|has)\(([^)]*)\)/g, ' $1');
  const ids = (s.match(/#[\w-]+/g) || []).length;
  const classes = (s.match(/\.[\w-]+|\[[^\]]+\]|:(?!:)[\w-]+/g) || []).length;
  const types = (s.match(/(?:^|[\s>+~])[a-z][\w-]*/gi) || []).length;
  return ids * 100 + classes * 10 + types;
}

const lastCompound = (sel) => sel.trim().split(/[\s>+~]+/).pop();

function declsOf(rule) {
  const d = {};
  rule.walkDecls((decl) => {
    if (decl.prop === 'background' || decl.prop === 'background-color') d.bg = { value: decl.value, important: decl.important };
    if (decl.prop === 'color') d.color = decl.value;
  });
  return d;
}

/** The dark palette, with system.css's semantic layer underneath it. */
function darkButtonPalette() {
  // The semantic layer (--surface-raised, --content-primary, …) lives in
  // system.css's :root and aliases the palette, so it sits underneath.
  const vars = new Map([...parseRootVars(read('src/styles/system.css')), ...paletteFor('dark', styleCss, darkCss)]);
  return vars;
}

/** Rules keyed by selector, for looking up a same-selector colour or a dark override. */
function indexRules(css) {
  const map = new Map();
  postcss.parse(css).walkRules((r) => {
    if (r.parent?.type === 'atrule' && /print/.test(r.parent.params)) return;
    for (const sel of r.selectors) map.set(sel.trim(), { ...(map.get(sel.trim()) || {}), ...declsOf(r) });
  });
  return map;
}

function findDarkButtonClashes(classLists) {
  const vars = darkButtonPalette();
  const resolve = makeColorResolver(vars);
  const ink = resolve('var(--text)');
  const page = resolve('var(--cream)');
  const darkRules = indexRules(darkCss);
  const findings = [];

  for (const sheet of BASE_SHEETS) {
    const baseRules = indexRules(read(sheet));
    postcss.parse(read(sheet)).walkRules((rule) => {
      if (rule.parent?.type === 'atrule' && /print/.test(rule.parent.params)) return;
      const own = declsOf(rule);
      if (!own.bg) return;
      for (const raw of rule.selectors) {
        const sel = raw.trim();
        if (sel.includes('::')) continue;
        const last = lastCompound(sel);
        const classes = [...last.matchAll(/\.([\w-]+)/g)].map((m) => m[1]);
        // Only a rule whose classes all sit together on one real `btn` element
        // (and that names something beyond `btn` itself) can hit this.
        if (!classes.some((c) => c !== 'btn')) continue;
        if (!classLists.some((list) => classes.every((c) => list.has(c)))) continue;
        if (specificity(sel) <= DARK_BTN_SPECIFICITY && !own.bg.important) continue;

        // A `.theme-dark <same selector>` rule is the sanctioned fix — use it.
        const override = darkRules.get(`.theme-dark ${sel}`);
        const bgValue = (override?.bg?.value ?? own.bg.value).replace(/!important/, '').trim();
        const bg = resolve(bgValue);
        if (!bg) continue; // gradient / url / unknown: can't judge, don't guess
        const a = bg.a ?? 1;
        const surface = a >= 1 ? bg : {
          r: bg.r * a + page.r * (1 - a), g: bg.g * a + page.g * (1 - a), b: bg.b * a + page.b * (1 - a),
        };
        // Text colour, most specific first: a dark override of this state or
        // its resting selector, then the rule itself, then the resting rule.
        const resting = sel.replace(/:(?:hover|focus|focus-visible|active)$/, '');
        const colorValue = override?.color ?? darkRules.get(`.theme-dark ${resting}`)?.color
          ?? own.color ?? baseRules.get(resting)?.color;
        const fg = colorValue ? resolve(colorValue) : ink;
        if (!fg) continue;
        const ratio = contrastRatio(fg, surface);
        if (ratio < AA) {
          findings.push(`${relative(root, join(root, sheet))}:${rule.source.start.line} ${sel} — ${ratio.toFixed(2)}:1 in night mode`);
        }
      }
    });
  }
  return findings;
}

const markupFiles = [join(root, 'index.html'), ...walk(join(root, 'src')).filter((f) => f.endsWith('.js'))];

describe('night-mode buttons that paint their own background', () => {
  it('every button-classed component keeps readable text in night mode', () => {
    expect(findDarkButtonClashes(buttonClassLists(markupFiles))).toEqual([]);
  });

  it('night mode never hands buttons (or anything) a dark ink set', () => {
    // The retired light-tile design re-declared --text/--content-* to dark
    // ink inside every button and card; that is what made a class-painted
    // dark surface go dark-on-dark. No rule in the dark theme may do it again.
    const offenders = [];
    postcss.parse(darkCss).walkRules((r) => {
      r.walkDecls((d) => {
        if (/^--(?:text\d?|content-(?:primary|secondary|muted|faint))$/.test(d.prop) && !/^:root/.test(r.selector)) {
          offenders.push(`${r.selector} { ${d.prop} }`);
        }
      });
    });
    expect(offenders).toEqual([]);
  });

  it('the book picker cards are not buttons-by-class', () => {
    expect(read('src/main.js')).not.toMatch(/['"`]btn book-choice-card/);
  });
});
