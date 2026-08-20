import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from 'vitest';

// Resolved via __dirname rather than `new URL(..., import.meta.url)` — see the
// note in tests/book-strip-kpi-alignment.test.js for why.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const styles = readFileSync(path.join(__dirname, '../src/style.css'), 'utf8');
const main = readFileSync(path.join(__dirname, '../src/main.js'), 'utf8');

// First declaration block for a selector, whether it is written on one line or
// spread over several. Both styles are in use in this part of style.css.
function block(selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const m = styles.match(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`));
  expect(m, `no rule found for ${selector}`).not.toBeNull();
  return m[1];
}

test('per-book channel cards wear the same frame as the panel above them', () => {
  const card = block('.ch-book-card');
  const panel = block('.ch-panel');

  // The card grid sits directly under .ch-panel; a smaller radius or a
  // different elevation is what made it read as an older component.
  expect(card).toMatch(/border-radius:\s*var\(--r3\)/);
  expect(panel).toMatch(/border-radius:\s*var\(--r3\)/);
  expect(card).toMatch(/box-shadow:\s*var\(--elev-2\)/);
  expect(panel).toMatch(/box-shadow:\s*var\(--elev-2\)/);
});

test('the mix bar trough is --track-bg so the unfilled remainder survives dark mode', () => {
  const stack = block('.ch-stack');
  expect(stack).toMatch(/background:\s*var\(--track-bg\)/);
  // --cream2 lands ~2% off --surface-card on the dark theme.
  expect(stack).not.toMatch(/--cream2/);
  // Same trough as the chart bar in the panel above.
  expect(block('.ch-row-track')).toMatch(/background:\s*var\(--track-bg\)/);
});

test('legend figures share one set of column edges down each card', () => {
  const legend = block('.ch-legend');
  const row = block('.ch-leg-row');

  // The card owns the tracks; each row subscribes to them.
  expect(legend).toMatch(/display:\s*grid/);
  expect(legend).toMatch(/grid-template-columns:\s*auto minmax\(0,\s*1fr\) auto auto/);
  expect(row).toMatch(/grid-column:\s*1\s*\/\s*-1/);

  // Subgrid is what makes the % and money columns line up; the plain tracks
  // stay in the base rule as the fallback where it is unsupported.
  expect(row).toMatch(/grid-template-columns:\s*auto minmax\(0,\s*1fr\) auto auto/);
  expect(styles).toMatch(
    /@supports \(grid-template-columns:\s*subgrid\)\s*\{\s*\.ch-leg-row\s*\{\s*grid-template-columns:\s*subgrid;\s*\}\s*\}/
  );

  // Geometry lives on every row, not only the tappable ones: padding on a
  // subgrid item insets its own tracks, so a hover pill applied to some rows
  // only would shift those rows out of the shared edges.
  expect(row).toMatch(/margin:\s*0 -6px/);
  expect(row).toMatch(/padding:\s*3px 6px/);
  expect(block('.ch-leg-tap')).not.toMatch(/padding:/);
});

test('the card total is not asked for a DM Mono weight the app never loads', () => {
  // DM Mono ships at 400/500 only; 600 was synthesised into faux-bold.
  const total = block('.ch-book-total');
  expect(total).toMatch(/font-family:\s*'DM Mono'/);
  expect(total).toMatch(/font-weight:\s*500/);
});

test('a tappable legend row has a hover that reads in both themes, and a reachable focus ring', () => {
  expect(block('.ch-leg-tap:hover')).toMatch(/background:\s*var\(--cream3\)/);
  const focus = block('.ch-leg-tap:focus-visible');
  expect(focus).toMatch(/outline:\s*2px solid var\(--gold2\)/);
  expect(focus).not.toMatch(/outline:\s*none/);
  expect(block('.ch-leg-tap:active')).toMatch(/background:\s*var\(--cream4\)/);

  // The ring is dead weight unless the row can actually take focus.
  expect(main).toMatch(/ch-leg-row ch-leg-tap" role="button" tabindex="0"/);
  expect(main).toMatch(/onkeydown="if\(event\.key===&#39;Enter&#39;\|\|event\.key===&#39; &#39;\)/);
});

test('the stacked mix bar collapses its animation under reduced motion', () => {
  expect(styles).toMatch(
    /@media \(prefers-reduced-motion: reduce\)\{\s*\.ch-row-fill,\.ch-seg\{transition:none;\}/
  );
});
