import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from 'vitest';

// Resolved via __dirname rather than `new URL(..., import.meta.url)`: under the
// jsdom test environment the global URL is jsdom's, and node:fs / fileURLToPath
// reject a foreign URL object with "must be of scheme file".
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const styles = readFileSync(path.join(__dirname, '../src/style.css'), 'utf8');
const markup = readFileSync(path.join(__dirname, '../index.html'), 'utf8');

/** Lift one rule block out of the stylesheet by exact selector. */
function rule(selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const m = styles.match(new RegExp(`(?:^|\\n)${escaped}\\s*\\{([\\s\\S]*?)\\n?\\}`));
  expect(m, `missing rule for ${selector}`).not.toBeNull();
  return m[1];
}

test('the cash flow strip accents with a bottom rule, never a left border', () => {
  const card = rule('.cf-stat');
  // A left slab shrinks only the accented cards' content boxes under the
  // global border-box, so the three labels stop sharing a left edge.
  expect(card).not.toMatch(/border-left/);
  expect(rule('.cf-stat::after')).toMatch(/height:\s*3px;/);
  expect(rule('.cf-stat::after')).toMatch(/inset:\s*auto\s+0\s+0;/);
});

test('exactly one headline card leads, by size and by colour', () => {
  // Net Cash Flow is the question the screen exists to answer.
  expect(markup).toMatch(/class="cf-stat cf-net is-lead" id="tc-net-card"/);

  // The two input figures are neutral — no `.cf-income`/`.cf-expense` rule may
  // colour a figure without `.is-lead`, or the strip has three loud numbers
  // and no entry point again.
  expect(styles).not.toMatch(/\.cf-stat\.cf-(income|expense)\s+\.cf-stat-val\s*\{/);
  expect(rule('.cf-stat.is-lead.cf-income .cf-stat-val')).toMatch(/color:\s*var\(--green\);/);
  expect(rule('.cf-stat.is-lead.cf-expense .cf-stat-val')).toMatch(/color:\s*var\(--red\);/);

  // Size step as well as colour, and only the lead carries a coloured accent.
  expect(rule('.cf-stat-val')).toMatch(/font-size:\s*var\(--text-xl\);/);
  expect(rule('.cf-stat.is-lead .cf-stat-val')).toMatch(/font-size:\s*var\(--text-2xl\);/);
  expect(rule('.cf-stat::after')).toMatch(/background:\s*var\(--cream3\);/);
  expect(styles).toMatch(/\.cf-stat\.is-lead\.cf-income::after\{background:linear-gradient/);
});

test('the three headline figures and sub-lines share their baselines', () => {
  const card = rule('.cf-stat');
  expect(card).toMatch(/align-items:\s*stretch;/);
  expect(rule('.cf-stat-content')).toMatch(/min-width:\s*0;/);
  // The figures hang off the bottom of a stretched card rather than off the
  // label above them: "Operating Expenses (Money Out)" wraps to two lines
  // where "Net Cash Flow" stays on one, so a figure anchored to its own label
  // starts at a different height on every card.
  expect(rule('.cf-stat-figure')).toMatch(/margin-top:\s*auto;/);
  // The label must NOT reserve a blank second line to fake that alignment.
  expect(rule('.cf-stat-label')).not.toMatch(/min-height/);
});

test('every cash flow figure is tabular mono', () => {
  for (const sel of ['.cf-stat-val', '.cf-kpi-val']) {
    const decls = rule(sel);
    expect(decls).toMatch(/font-family:\s*'DM Mono',\s*monospace;/);
    expect(decls).toMatch(/font-variant-numeric:\s*tabular-nums;/);
    expect(decls).toMatch(/"tnum"\s*1/);
  }
  // Secondary chips stay a step below the headline figures.
  expect(rule('.cf-kpi-val')).toMatch(/font-size:\s*var\(--text-md\);/);
});

test('the strip responds to its card, not to the viewport', () => {
  // An element cannot query its own container, so the container-type sits on
  // the .cf-strip wrapper that index.html now provides.
  expect(markup).toMatch(/<div class="cf-strip">/);
  expect(rule('.cf-strip')).toMatch(/container-type:\s*inline-size;\s*container-name:\s*cf-strip;/);
  const cq = styles.match(/@container cf-strip \(max-width:680px\)\{([\s\S]*?)\n\}/);
  expect(cq).not.toBeNull();
  expect(cq[1]).toMatch(/\.cf-stats\{grid-template-columns:1fr;\}/);
  // The viewport breakpoint must not still be fighting the container query.
  const viewport = styles.match(/@media \(max-width:760px\)\{([\s\S]*?)\n\}/);
  expect(viewport).not.toBeNull();
  expect(viewport[1]).not.toMatch(/\.cf-stats\s*\{/);
  expect(viewport[1]).not.toMatch(/\.cf-kpis\s*\{/);
});
