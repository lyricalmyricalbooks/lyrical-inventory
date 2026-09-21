import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from 'vitest';

// Resolved via __dirname rather than `new URL(..., import.meta.url)` — jsdom's
// global URL is not a node file URL and node:fs rejects it. Matches the rest
// of tests/.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const styles = readFileSync(path.join(__dirname, '../src/style.css'), 'utf8');

// A full-viewport backdrop-filter is re-rasterised on every frame that anything
// above it paints. The note above .overlay records what that cost when it was
// measured on a 4x-throttled CPU with the receipts dialog: 55ms per frame while
// scrolling (~18fps) and 79ms per keystroke, against 17ms and 12ms without it —
// and no compositing trick recovered it. Depth is carried by a layered scrim
// instead, which composites once.
//
// The decision was recorded only as a comment, and was then missed twice: the
// Canada Post label dialog kept a 12px blur behind a form, and a send overlay
// had one re-added. A comment cannot fail a build, so this does.
//
// Scope: elements that cover the viewport (position:fixed + inset:0). A blur on
// a small popover's ::backdrop, or over a live camera feed, is a different and
// much cheaper thing, and is deliberately not covered here.

/** Every top-level rule whose body covers the whole viewport. */
function fullViewportRules(css) {
  const out = [];
  const re = /(?:^|\n)([.#][\w.#>\s:,()[\]="-]*?)\s*\{([^}]*)\}/g;
  let m;
  while ((m = re.exec(css)) !== null) {
    const [, selector, rawBody] = m;
    // Comments are stripped before anything is judged. The rules explaining
    // why the blur was removed necessarily say "backdrop-filter", and matching
    // those would fail the build on its own documentation.
    const body = rawBody.replace(/\/\*[\s\S]*?\*\//g, '');
    if (!/position:\s*fixed/.test(body)) continue;
    if (!/inset:\s*0/.test(body)) continue;
    out.push({
      selector: selector.trim(),
      body,
      line: css.slice(0, m.index).split('\n').length,
    });
  }
  return out;
}

/** Matches a real declaration, not a mention of one in prose. */
const DECLARES_BLUR = /(?:^|[;{\s])-?(?:webkit-)?backdrop-filter\s*:/;

// One transient exception, stated rather than silent: the updating splash is a
// non-interactive takeover shown while the app replaces itself. Nothing is
// scrolled or typed behind it, and blurring the app you are about to reload is
// the effect itself rather than decoration.
const ALLOWED = new Set(['.updating-screen']);

test('no dialog scrim blurs the whole viewport', () => {
  const offenders = fullViewportRules(styles)
    .filter(r => DECLARES_BLUR.test(r.body))
    .filter(r => !ALLOWED.has(r.selector));

  expect(
    offenders.map(r => `${r.selector} (src/style.css:${r.line})`),
    'full-viewport backdrop-filter costs ~55ms/frame and ~79ms/keystroke; '
    + 'use the layered scrim (see the note above .overlay) instead'
  ).toEqual([]);
});

test('the guard can actually see a violation', () => {
  // A test that only ever passes proves nothing. This confirms the matcher
  // finds the exact shape that shipped twice.
  const bad = '\n.some-overlay {\n  position: fixed;\n  inset: 0;\n  backdrop-filter: blur(12px);\n}';
  const found = fullViewportRules(bad).filter(r => DECLARES_BLUR.test(r.body));
  expect(found).toHaveLength(1);
  expect(found[0].selector).toBe('.some-overlay');
});

test('the two scrims that regressed carry the layered scrim instead', () => {
  for (const sel of ['.cp-label-modal-overlay', '.send-overlay']) {
    const rule = fullViewportRules(styles).find(r => r.selector === sel);
    expect(rule, `${sel} present`).toBeDefined();
    expect(rule.body, `${sel} uses the scrim`).toMatch(/radial-gradient/);
    expect(DECLARES_BLUR.test(rule.body), `${sel} has no blur`).toBe(false);
  }
});

test('the cheap cases are left alone', () => {
  // Guard the scope: a popover ::backdrop keeps its blur, and this test would
  // notice if the rule above were widened to strip those too.
  expect(styles).toMatch(/\.store-balance-pop::backdrop\s*\{[^}]*backdrop-filter:\s*blur\(8px\)/);
});
