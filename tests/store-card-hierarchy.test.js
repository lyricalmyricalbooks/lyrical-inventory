import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from 'vitest';

// Resolved via __dirname rather than `new URL(..., import.meta.url)` — see the
// note in tests/book-strip-kpi-alignment.test.js for why jsdom forces this.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const styles = readFileSync(path.join(__dirname, '../src/style.css'), 'utf8');
const darkStyles = readFileSync(path.join(__dirname, '../src/styles/theme-dark.css'), 'utf8');

const block = (selector) => {
  const m = styles.match(new RegExp(`\\n${selector}\\s*\\{([\\s\\S]*?)\\n\\}`));
  expect(m, `no rule block found for ${selector}`).not.toBeNull();
  return m[1];
};

test('the store name outranks the figures beneath it on the type scale', () => {
  // The whole point of the change: the name used to be 17px against 18px mono
  // figures, so the identity of the card lost to its own numbers. --text-xl
  // (22px) over --text-lg (18px) is the step that puts it back on top.
  expect(block('\\.store-name')).toMatch(/font-size:\s*var\(--text-xl\);/);
  expect(block('\\.sk-v')).toMatch(/font-size:\s*var\(--text-lg\);/);
  expect(block('\\.sk-l')).toMatch(/font-size:\s*var\(--text-3xs\);/);
});

test('store card spacing comes off the shared scale, not ad-hoc px', () => {
  const card = block('\\.store-card');
  expect(card).toMatch(/padding:\s*var\(--space-5\);/);
  expect(card).toMatch(/margin-bottom:\s*var\(--space-3\);/);

  // Between-group gap must visibly exceed within-group gap, or four tiles stop
  // reading as four groups: --space-2 between tiles, --space-1 inside one.
  expect(block('\\.store-kpis')).toMatch(/gap:\s*var\(--space-2\);/);
  expect(block('\\.sk')).toMatch(/gap:\s*var\(--space-1\);/);

  // No ad-hoc lengths left anywhere in the block. Hairline borders and the
  // inset accent bar are the only literals allowed through — everything that
  // sets rhythm has to come off the scale, or the block drifts again.
  //
  // The comment stripping here is also what caught a real defect while this
  // was written: a `--space-*/--text-*` written inside a CSS comment closes it
  // early, and the prose after it lands in the stylesheet as garbage.
  const storeBlock = styles.slice(
    styles.indexOf('/* STORE CARDS'),
    styles.indexOf('.store-actions{'),
  );
  const rawLengths = storeBlock
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/inset 3px 0 0/g, '')
    .replace(/\b1px solid\b/g, '')
    .match(/\b\d+(\.\d+)?(px|rem|em)\b/g);
  expect(rawLengths).toBeNull();
});

test('a long money figure wraps inside its tile instead of widening the card', () => {
  expect(block('\\.store-kpis')).toMatch(
    /grid-template-columns:\s*repeat\(4,\s*minmax\(0,\s*1fr\)\)/,
  );
  expect(block('\\.sk')).toMatch(/min-width:\s*0;/);
  expect(block('\\.sk-v')).toMatch(/overflow-wrap:\s*anywhere;/);
});

test('store figures are tabular so the tiles do not jitter as counts change', () => {
  const val = block('\\.sk-v');
  expect(val).toMatch(/font-family:\s*'DM Mono',monospace;/);
  expect(val).toMatch(/font-feature-settings:\s*"tnum" 1,"zero" 1;/);
  expect(val).toMatch(/font-variant-numeric:\s*tabular-nums;/);
});

test('a flagged tile is marked by an accent bar, never by a paler fill', () => {
  const warn = block('\\.sk:has\\(\\.sk-v\\.warn\\)');
  const off = block('\\.sk:has\\(\\.sk-v\\.is-off\\)');

  expect(warn).toMatch(/box-shadow:\s*inset 3px 0 0 var\(--status-active\);/);
  expect(off).toMatch(/box-shadow:\s*inset 3px 0 0 var\(--status-critical\);/);

  // A --status-*-bg wash is LIGHTER than --surface-inset in light mode, so
  // filling the plate would make the flagged tile the palest one on the card
  // and drop its own amber figure under AA. Guard against it coming back.
  expect(warn).not.toMatch(/background/);
  expect(off).not.toMatch(/background/);

  // Critical outranks active: the disputed-figure rule must stay second, or a
  // tile that is both owed-money and off-ledger paints amber.
  expect(styles.indexOf('.sk:has(.sk-v.warn)')).toBeLessThan(
    styles.indexOf('.sk:has(.sk-v.is-off)'),
  );
});

test('every store-card colour is a token, so both themes follow', () => {
  const storeBlock = styles.slice(
    styles.indexOf('/* STORE CARDS'),
    styles.indexOf('/* ── STORE BALANCE FLAG'),
  ).replace(/\/\*[\s\S]*?\*\//g, '');

  expect(storeBlock).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  expect(storeBlock).not.toMatch(/rgba?\(/);
  expect(storeBlock).not.toMatch(/color:\s*var\(--cream/);

  // The amber "needs attention" figure now takes the semantic status role
  // rather than a one-off orange hex, and dark mode still re-points it.
  expect(block('\\.sk-v\\.warn')).toMatch(/color:\s*var\(--status-active\);/);
  expect(darkStyles).toMatch(/\.theme-dark \.sk-v\.warn \{ color: var\(--orange\); \}/);
});

test('store card motion uses the tokens, so it collapses under reduced motion', () => {
  const card = block('\\.store-card');
  expect(card).toMatch(/var\(--dur-base\)\s+var\(--ease-entrance\)/);
  expect(card).not.toMatch(/\b\d+(\.\d+)?s\b/);
  expect(block('\\.store-card:hover')).toMatch(/box-shadow:\s*var\(--elev-hover\);/);
});
