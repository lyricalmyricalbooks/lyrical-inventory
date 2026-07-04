/**
 * check-contrast.mjs — static guard against low-contrast text in index.html.
 *
 * Computes real WCAG 2.1 contrast ratios (not a light/dark guess): it walks
 * the markup tracking the *resolved* effective background and text colour
 * at each tag (inheriting through ancestors, compositing alpha, resolving
 * CSS custom properties from src/style.css's `:root` block), and flags any
 * point where the ratio drops below the WCAG AA threshold (4.5:1 normal
 * text, 3:1 large text — see isLargeText below).
 *
 * This catches the bug class found in PR #303/#304 generally, not just the
 * exact light-on-cream shape: any tag that explicitly sets its own `color`
 * is checked against its real resolved background (inherited through
 * ancestors, with alpha-translucent layers composited in) — so it equally
 * catches a low-opacity rgba() caption that looks fine in isolation but
 * composites to a poor ratio against the card behind it, or a mid-tone
 * custom-property pairing that merely "looks dark enough" but fails AA.
 *
 * It only checks tags with an explicit inline (or class-driven, see
 * CLASS_PAIRS/CLASS_TEXT_TOKENS below) `color`, not every tag that merely
 * inherits text colour — verifying *inherited* text would also require
 * modeling every CSS-class-driven colour in style.css (.kpi-label,
 * .header-wordmark, .section-hed, …), which this script intentionally
 * doesn't attempt. It is a tokenizer over inline styles plus a small
 * explicit table of this app's component classes (.app-header, .card,
 * .modal, .pill.*, .btn.*, .kpi-value.*, …) — not a full CSS cascade engine.
 * Backgrounds it cannot resolve (gradients, url(), currentColor, unknown
 * vars) mark that subtree "unknown" and are silently skipped rather than
 * guessed at, so the script trades a little blindness for no false alarms
 * on decorative gradients.
 *
 * Pre-existing colour pairings that fail strict AA but are this app's
 * established secondary/meta-text design language (e.g. var(--text3) muted
 * labels, used 80+ times) are recorded in scripts/contrast-baseline.json so
 * the checker gates on new regressions rather than failing on every
 * already-shipped screen — see loadBaseline()/partitionFindings() below.
 *
 * Run standalone (`node scripts/check-contrast.mjs`) or via the Vitest
 * suite (test/contrast.test.js).
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
export const INDEX_HTML = join(__dirname, '..', 'index.html');
export const STYLE_CSS = join(__dirname, '..', 'src', 'style.css');
export const BASELINE_JSON = join(__dirname, 'contrast-baseline.json');

const WCAG_AA_NORMAL = 4.5;
const WCAG_AA_LARGE = 3.0;

// ---------------------------------------------------------------------------
// :root custom-property resolution
// ---------------------------------------------------------------------------

export function parseRootVars(css) {
  const rootMatch = css.match(/:root\s*\{([^}]*)\}/);
  const vars = new Map();
  if (!rootMatch) return vars;
  const decls = rootMatch[1].split(';');
  for (const decl of decls) {
    const m = decl.match(/--([\w-]+)\s*:\s*(.+)/s);
    if (m) vars.set(m[1].trim(), m[2].trim());
  }
  return vars;
}

function resolveVarChain(name, vars, seen = new Set()) {
  if (seen.has(name)) return null;
  seen.add(name);
  const val = vars.get(name);
  if (val === undefined) return null;
  const m = val.match(/^var\(\s*--([\w-]+)\s*\)$/i);
  return m ? resolveVarChain(m[1], vars, seen) : val;
}

// ---------------------------------------------------------------------------
// Colour parsing: var()/hex/rgb(a)/named -> {r,g,b,a}
// ---------------------------------------------------------------------------

const NAMED_COLORS = {
  white: { r: 255, g: 255, b: 255, a: 1 },
  black: { r: 0, g: 0, b: 0, a: 1 },
  transparent: { r: 0, g: 0, b: 0, a: 0 },
};

function hexToRgba(hex) {
  let h = hex;
  if (h.length === 3 || h.length === 4) {
    h = [...h].map(c => c + c).join('');
  }
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  const a = h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1;
  return { r, g, b, a };
}

export function makeColorResolver(vars) {
  function resolve(raw, seen = new Set()) {
    if (!raw) return null;
    const v = raw.trim();
    if (seen.has(v)) return null;
    seen.add(v);

    let m = v.match(/^var\(\s*--([\w-]+)\s*\)$/i);
    if (m) {
      const inner = resolveVarChain(m[1], vars);
      return inner ? resolve(inner, seen) : null;
    }

    m = v.match(/^#([0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i);
    if (m) return hexToRgba(m[1].toLowerCase());

    m = v.match(/^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+))?\)$/i);
    if (m) {
      return {
        r: parseFloat(m[1]), g: parseFloat(m[2]), b: parseFloat(m[3]),
        a: m[4] !== undefined ? parseFloat(m[4]) : 1,
      };
    }

    const lower = v.toLowerCase();
    if (lower === 'inherit' || lower === 'initial' || lower === 'unset' || lower === 'none') return null;
    if (NAMED_COLORS[lower]) return NAMED_COLORS[lower];

    return null; // gradient, currentColor, unrecognised var, etc.
  }
  return resolve;
}

function compositeOver(fg, bg) {
  const a = fg.a ?? 1;
  if (a >= 1) return { r: fg.r, g: fg.g, b: fg.b };
  if (a <= 0) return { r: bg.r, g: bg.g, b: bg.b };
  return {
    r: fg.r * a + bg.r * (1 - a),
    g: fg.g * a + bg.g * (1 - a),
    b: fg.b * a + bg.b * (1 - a),
  };
}

// ---------------------------------------------------------------------------
// WCAG relative luminance / contrast ratio
// ---------------------------------------------------------------------------

function srgbChannelToLinear(c) {
  const v = c / 255;
  return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
}

function relativeLuminance({ r, g, b }) {
  return 0.2126 * srgbChannelToLinear(r) + 0.7152 * srgbChannelToLinear(g) + 0.0722 * srgbChannelToLinear(b);
}

function rgbHex({ r, g, b }) {
  const ch = v => Math.round(v).toString(16).padStart(2, '0');
  return `#${ch(r)}${ch(g)}${ch(b)}`;
}

export function contrastRatio(c1, c2) {
  const L1 = relativeLuminance(c1);
  const L2 = relativeLuminance(c2);
  const lighter = Math.max(L1, L2);
  const darker = Math.min(L1, L2);
  return (lighter + 0.05) / (darker + 0.05);
}

// ---------------------------------------------------------------------------
// Known component classes that set background/color independent of inline
// style — a deliberately small, explicit table (not a CSS cascade engine).
// Keep in sync with src/style.css if these selectors change.
// ---------------------------------------------------------------------------

const DARK_BG_CLASSES = new Set(['app-header', 'kpi', 'gas-code-container', 'metric-banner']);
const CLASS_BG = { 'gas-code-header': 'var(--ink2)', card: 'white', 'sheets-setup': 'white', modal: 'var(--cream)' };

// className -> { color, modifiers: { modifierClass -> color } }
const CLASS_TEXT_TOKENS = {
  'kpi-value': { base: 'var(--cream)', modifiers: { gold: 'var(--gold3)', warn: '#fb923c', danger: '#f87171' } },
  'metric-banner-value': { base: 'var(--cream)', modifiers: { gold: 'var(--gold3)', green: '#6ee7a8', danger: '#f87171' } },
};

// className -> { modifierClass -> {background, color} }, for self-contained
// badge-style components that pair a background and a text colour together.
const CLASS_PAIRS = {
  pill: {
    gold: { background: 'var(--gold-bg)', color: 'var(--gold)' },
    green: { background: 'var(--green-bg)', color: 'var(--green)' },
    amber: { background: 'var(--amber-bg)', color: 'var(--amber)' },
    red: { background: 'var(--red-bg)', color: 'var(--red)' },
    gray: { background: 'var(--cream3)', color: 'var(--text3)' },
    blue: { background: 'var(--blue-bg)', color: 'var(--blue)' },
  },
  btn: {
    gold: { background: 'var(--gold)', color: 'var(--ink)' },
    ink: { background: 'var(--ink)', color: 'var(--cream)' },
    __default: { background: 'var(--cream2)', color: 'var(--text)' },
  },
};

function classStyle(classes) {
  const set = new Set(classes);
  let background;
  let color;

  if ([...set].some(c => DARK_BG_CLASSES.has(c))) background = 'var(--ink)';
  for (const [cls, bg] of Object.entries(CLASS_BG)) if (set.has(cls)) background = bg;

  for (const [base, spec] of Object.entries(CLASS_TEXT_TOKENS)) {
    if (!set.has(base)) continue;
    color = spec.base;
    for (const [mod, modColor] of Object.entries(spec.modifiers)) if (set.has(mod)) color = modColor;
  }

  for (const [base, spec] of Object.entries(CLASS_PAIRS)) {
    if (!set.has(base)) continue;
    let pair = spec.__default;
    for (const [mod, modPair] of Object.entries(spec)) {
      if (mod !== '__default' && set.has(mod)) pair = modPair;
    }
    if (pair) { background = pair.background; color = pair.color; }
  }

  return { background, color };
}

// ---------------------------------------------------------------------------
// Inline style parsing
// ---------------------------------------------------------------------------

function extractProp(style, prop) {
  const re = new RegExp(`(?:^|;)\\s*${prop}\\s*:\\s*([^;]+)`, 'i');
  const m = style.match(re);
  return m ? m[1].trim() : null;
}

function isLargeText(style) {
  const fsMatch = style.match(/(?:^|;)\s*font-size\s*:\s*([\d.]+)px/i);
  if (!fsMatch) return false; // unknown size -> assume normal (stricter threshold)
  const fontSize = parseFloat(fsMatch[1]);
  const fwMatch = style.match(/(?:^|;)\s*font-weight\s*:\s*(\d+|bold|bolder)/i);
  const weight = fwMatch ? fwMatch[1].toLowerCase() : null;
  const isBold = weight === 'bold' || weight === 'bolder' || (weight && parseInt(weight, 10) >= 700);
  if (fontSize >= 24) return true;
  if (fontSize >= 18.5 && isBold) return true;
  return false;
}

const VOID_TAGS = new Set([
  'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
  'link', 'meta', 'param', 'source', 'track', 'wbr',
]);

const TAG_RE = /<\/?([a-zA-Z][\w-]*)((?:[^>"']|"[^"]*"|'[^']*')*?)(\/?)>/g;

function getAttr(attrs, name) {
  const m = attrs.match(new RegExp(`${name}\\s*=\\s*("([^"]*)"|'([^']*)')`, 'i'));
  return m ? (m[2] ?? m[3] ?? '') : '';
}

function getClasses(attrs) {
  return getAttr(attrs, 'class').split(/\s+/).filter(Boolean);
}

function lineOf(html, index) {
  return html.slice(0, index).split('\n').length;
}

// Color-emoji glyphs (📤, 📊, 🧾, …) render from their own embedded colour,
// not the CSS `color` property — an icon badge styled `color:var(--text2)`
// around a single emoji isn't a real contrast bug. Narrow on purpose: only
// skip short, letter/digit-free content that actually contains an emoji
// codepoint, so real (non-Latin) text content still gets checked.
const EMOJI_RE = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2190}-\u{21FF}\u{2B00}-\u{2BFF}]/u;

function isEmojiOnlyContent(html, afterIndex) {
  const nextTagIdx = html.indexOf('<', afterIndex);
  if (nextTagIdx === -1) return false;
  const content = html.slice(afterIndex, nextTagIdx).trim();
  if (!content || content.length > 8) return false;
  if (/[A-Za-z0-9]/.test(content)) return false;
  return EMOJI_RE.test(content);
}

function resolveBackground(raw, parentBg, resolveColor) {
  if (!raw) return parentBg;
  const lower = raw.toLowerCase();
  if (lower === 'transparent' || lower === 'none' || lower === 'inherit') return parentBg;
  const parsed = resolveColor(raw);
  if (!parsed) return null; // unresolvable (gradient, url(), unknown var) -> unknown
  if ((parsed.a ?? 1) >= 1) return { r: parsed.r, g: parsed.g, b: parsed.b };
  if (!parentBg) return null; // need a known parent to composite a translucent layer
  return compositeOver(parsed, parentBg);
}

function resolveText(raw, ownBg, resolveColor) {
  if (!raw) return undefined; // "not set" — caller decides whether to inherit
  const parsed = resolveColor(raw);
  if (!parsed) return null; // unresolvable -> unknown
  if ((parsed.a ?? 1) >= 1) return { r: parsed.r, g: parsed.g, b: parsed.b };
  if (!ownBg) return null;
  return compositeOver(parsed, ownBg);
}

/** Returns an array of { line, tag, ratio, required, textColor, bgColor } findings. */
export function findLowContrastText(html, cssVars) {
  const resolveColor = makeColorResolver(cssVars);
  const findings = [];

  const rootBg = resolveColor('var(--cream)');
  const rootText = resolveColor('var(--text)');
  const stack = [{ bg: rootBg, text: rootText }];

  let m;
  TAG_RE.lastIndex = 0;
  while ((m = TAG_RE.exec(html)) !== null) {
    const [, rawTag, attrs, selfClose] = m;
    const tag = rawTag.toLowerCase();
    const isClose = m[0].startsWith('</');

    if (isClose) {
      if (stack.length > 1) stack.pop();
      continue;
    }

    const parent = stack[stack.length - 1];
    const style = getAttr(attrs, 'style');
    const classes = getClasses(attrs);
    const cls = classStyle(classes);

    const rawBg = extractProp(style, 'background(?:-color)?') ?? cls.background ?? null;
    const rawColor = extractProp(style, 'color') ?? cls.color ?? null;

    const ownBg = rawBg ? resolveBackground(rawBg, parent.bg, resolveColor) : parent.bg;
    const ownText = rawColor !== null
      ? (resolveText(rawColor, ownBg, resolveColor) ?? null)
      : parent.text;

    // Only check where this tag explicitly sets its own text colour. Inferring
    // contrast for *inherited* text would also need every CSS-class-driven
    // colour in style.css (.kpi-label, .header-wordmark, .section-hed, …) to
    // be modeled — this script intentionally doesn't attempt a full cascade,
    // so an unstyled container is assumed to get correct colour from a class
    // this script doesn't track, not flagged as broken.
    const reviewedOk = /contrast-ok/i.test(style);
    const emojiOnly = isEmojiOnlyContent(html, m.index + m[0].length);
    if (rawColor && ownBg && ownText && !reviewedOk && !emojiOnly) {
      const ratio = contrastRatio(ownText, ownBg);
      const required = isLargeText(style) ? WCAG_AA_LARGE : WCAG_AA_NORMAL;
      if (ratio < required) {
        // `key` identifies the *resolved* colour pairing (not the raw token,
        // which can be the ambiguous literal "(inherited)" for many distinct
        // actual backgrounds) — this is what scripts/contrast-baseline.json
        // entries are keyed by.
        findings.push({
          line: lineOf(html, m.index),
          tag,
          ratio: Math.round(ratio * 100) / 100,
          required,
          textColor: rawColor ?? '(inherited)',
          bgColor: rawBg ?? '(inherited)',
          key: `${rgbHex(ownText)}::${rgbHex(ownBg)}`,
        });
      }
    }

    const isVoid = VOID_TAGS.has(tag) || selfClose === '/';
    if (!isVoid) stack.push({ bg: ownBg, text: ownText });
  }
  return findings;
}

// ---------------------------------------------------------------------------
// Baseline — pre-existing, accepted colour pairings (e.g. this app's
// established muted/secondary-text palette) recorded by resolved RGB pair
// so the checker gates on *new* regressions without relitigating every
// already-shipped screen. See scripts/contrast-baseline.json.
// ---------------------------------------------------------------------------

export function loadBaseline(path = BASELINE_JSON) {
  try {
    const data = JSON.parse(readFileSync(path, 'utf8'));
    return new Set((data.accepted ?? []).map(e => e.key));
  } catch {
    return new Set();
  }
}

/** Splits findings into { fresh, known } using a Set of baseline keys. */
export function partitionFindings(findings, baselineKeys) {
  const fresh = [];
  const known = [];
  for (const f of findings) (baselineKeys.has(f.key) ? known : fresh).push(f);
  return { fresh, known };
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

if (import.meta.url === `file://${process.argv[1]}`) {
  const html = readFileSync(INDEX_HTML, 'utf8');
  const css = readFileSync(STYLE_CSS, 'utf8');
  const cssVars = parseRootVars(css);
  const findings = findLowContrastText(html, cssVars);

  if (process.argv.includes('--write-baseline')) {
    const byKey = new Map();
    for (const f of findings) {
      if (!byKey.has(f.key)) byKey.set(f.key, { key: f.key, textColor: f.textColor, bgColor: f.bgColor, ratio: f.ratio, count: 0 });
      byKey.get(f.key).count++;
    }
    const accepted = [...byKey.values()].sort((a, b) => a.ratio - b.ratio);
    const out = {
      _comment: [
        "Pre-existing colour pairings that fail strict WCAG AA (4.5:1 normal / 3:1 large)",
        "but are this app's established secondary/meta-text design language, used",
        "consistently across many screens (var(--text3) muted labels, var(--gold)",
        "accent labels/links, low-opacity rgba() captions on dark cards, etc).",
        "Recorded here so npm run lint:contrast / tests/contrast.test.js gate on NEW",
        'regressions instead of failing on every pre-existing screen. "count" is how',
        "many places in index.html use this exact resolved colour pairing as of the",
        "last regeneration — informational only, not enforced.",
        "Regenerate after an intentional palette change with:",
        "  node scripts/check-contrast.mjs --write-baseline",
      ],
      accepted,
    };
    writeFileSync(BASELINE_JSON, JSON.stringify(out, null, 2) + '\n');
    console.log(`Wrote ${accepted.length} baseline entries (covering ${findings.length} current findings) to scripts/contrast-baseline.json`);
    process.exit(0);
  }

  const baseline = loadBaseline();
  const { fresh, known } = partitionFindings(findings, baseline);

  if (fresh.length === 0) {
    const note = known.length ? ` (${known.length} pre-existing, accepted via scripts/contrast-baseline.json)` : '';
    console.log(`✓ check-contrast: no new WCAG AA contrast failures in index.html${note}`);
    process.exit(0);
  }
  console.error(`✗ check-contrast: ${fresh.length} new contrast failure(s) in index.html (WCAG AA):`);
  for (const f of fresh) {
    console.error(
      `  index.html:${f.line}  <${f.tag}> color:${f.textColor} on background:${f.bgColor}` +
      `  ratio=${f.ratio}:1 (needs ${f.required}:1)`
    );
  }
  console.error('\nFix the colour, add it to scripts/contrast-baseline.json if it matches an already-accepted pairing, or mark a reviewed exception with `/* contrast-ok */`.');
  process.exit(1);
}
