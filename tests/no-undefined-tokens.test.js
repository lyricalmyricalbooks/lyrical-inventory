import { readFileSync, readdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from 'vitest';

// Resolved via __dirname rather than `new URL(..., import.meta.url)` — jsdom's
// global URL is not a node file URL and node:fs rejects it. Matches the rest
// of tests/.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const read = (p) => readFileSync(path.join(root, p), 'utf8');

// `var(--typo)` with no fallback does not fall back to anything — the whole
// declaration becomes invalid at computed-value time and the property drops to
// its initial value. Nothing warns: the CSS parses, the build passes, and the
// rule simply does not apply.
//
// That had happened eleven times. Among them: a success banner whose
// background, border colour AND text colour were all undefined, so it rendered
// transparent with inherited text; a popover backdrop with no scrim; a hover
// state that changed nothing; and a radius asking for --shipping-pnl-r when the
// token is --shipping-pnl-radius.
//
// The existing guard in modal-shell-seams.test.js only knew a hardcoded list of
// bad surface names, so it could not catch a name nobody had thought of. This
// one works the other way round: every reference must resolve to something
// actually defined.

const CSS_FILES = ['src/style.css', 'src/styles/system.css', 'src/styles/theme-dark.css'];

function definedTokens() {
  const defined = new Set();
  // Declared anywhere in the stylesheets…
  const stylesDir = path.join(root, 'src', 'styles');
  const cssPaths = [
    'src/style.css',
    ...(existsSync(stylesDir)
      ? readdirSync(stylesDir).filter(f => f.endsWith('.css')).map(f => `src/styles/${f}`)
      : []),
  ];
  for (const f of cssPaths) {
    for (const [, name] of read(f).matchAll(/(--[\w-]+)\s*:/g)) defined.add(name);
  }
  // …or set at runtime from JS, or on an element's own style attribute.
  const jsDir = path.join(root, 'src', 'features');
  const jsPaths = [
    'src/main.js',
    ...(existsSync(jsDir)
      ? readdirSync(jsDir).filter(f => f.endsWith('.js')).map(f => `src/features/${f}`)
      : []),
  ];
  for (const f of [...jsPaths, 'index.html']) {
    const src = read(f);
    for (const [, name] of src.matchAll(/setProperty\(\s*['"`](--[\w-]+)/g)) defined.add(name);
    // Inline custom properties, e.g. style="--accent-color: #abc"
    for (const [, name] of src.matchAll(/style="[^"]*?(--[\w-]+)\s*:/g)) defined.add(name);
    for (const [, name] of src.matchAll(/style=`[^`]*?(--[\w-]+)\s*:/g)) defined.add(name);
  }
  return defined;
}

/** Every `var(--x)` with NO fallback. A fallback makes it legal to be unset. */
function referencesWithoutFallback(css) {
  return [...css.matchAll(/var\(\s*(--[\w-]+)\s*\)/g)].map(m => m[1]);
}

test('every token referenced without a fallback is actually defined', () => {
  const defined = definedTokens();
  const missing = [];

  for (const f of CSS_FILES) {
    const lines = read(f).split('\n');
    lines.forEach((line, i) => {
      for (const name of referencesWithoutFallback(line)) {
        if (!defined.has(name)) missing.push(`${name} — ${f}:${i + 1}`);
      }
    });
  }

  expect(
    missing,
    'an undefined custom property makes the whole declaration invalid, so the '
    + 'rule silently does not apply — give it a real token or a fallback'
  ).toEqual([]);
});

test('the guard recognises a fallback as legitimate', () => {
  // `var(--x, 10px)` is a deliberate pattern in this codebase (dark-only tokens
  // read from the light theme). It must not be reported.
  expect(referencesWithoutFallback('a{b:var(--nope, 10px);}')).toEqual([]);
  expect(referencesWithoutFallback('a{b:var(--yep);}')).toEqual(['--yep']);
});

test('the guard would have caught the bugs that prompted it', () => {
  const defined = definedTokens();
  // These are the exact names that were live and broken. If any is ever
  // defined for real, this test should be updated rather than the name reused.
  for (const dead of ['--emerald-text', '--surface-hover', '--shipping-pnl-r', '--r4', '--leading-relaxed']) {
    expect(defined.has(dead), `${dead} should not exist`).toBe(false);
  }
});
