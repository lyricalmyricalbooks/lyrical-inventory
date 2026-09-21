import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from 'vitest';

// Resolved via __dirname rather than `new URL(..., import.meta.url)` — jsdom's
// global URL is not a node file URL and node:fs rejects it. Matches the rest
// of tests/.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const mainJs = readFileSync(path.join(__dirname, '../src/main.js'), 'utf8');

// The channel mix is the one place in the app where colour carries identity
// across many series at once. The brand inks were tried here and failed a
// colour-vision check outright: the flare sat within ΔE 2-3 of the warm hues
// under protan and deutan, the yellow came out at 1.4:1, and violet against
// blue read as two blues. Hand-nudging the replacements toward safety broke it
// again in a different way. What is here now is the Okabe-Ito set, which is a
// published, tuned palette — these tests exist so the next person re-points it
// deliberately, with the validator, rather than by eye.

const OKABE_ITO = ['#D55E00', '#CC79A7', '#0072B2', '#009E73', '#E69F00', '#56B4E9'];

test('channel colours are the Okabe-Ito colour-vision-safe set', () => {
  const block = mainJs.match(/const CHANNEL_COLORS = \{([\s\S]*?)\};/);
  expect(block, 'CHANNEL_COLORS present').not.toBeNull();
  for (const hex of OKABE_ITO) {
    expect(block[1], `${hex} missing — the set is tuned as a whole`).toContain(hex);
  }
  // No hue outside the set: one stray "close enough" colour is exactly how the
  // separation guarantee gets lost.
  const used = [...block[1].matchAll(/#[0-9A-Fa-f]{6}/g)].map(m => m[0].toUpperCase());
  for (const hex of used) expect(OKABE_ITO).toContain(hex);
});

test('an unknown channel folds into one neutral rather than a generated hue', () => {
  // Hashing a name into a colour looks like identity and is not: two unknown
  // channels can collide, and one can land beside a named channel it cannot be
  // told apart from.
  expect(mainJs).toMatch(/const CHAN_OTHER = '#6B655B';/);
  expect(mainJs).toMatch(/CHANNEL_COLORS\[k\] != null \? CHANNEL_COLORS\[k\] : CHAN_OTHER/);
});

test('every row states its identity in text, not only in colour', () => {
  // Three of the six sit below 3:1 against the light page. That is allowed for
  // a chart mark, but only where something other than colour carries the
  // meaning — so the direct labels below are load-bearing, not decoration.
  const render = mainJs.match(/const chartRows = chans\.map\(\(x\) => \{[\s\S]*?\}\)\.join\(''\);/);
  expect(render, 'chartRows builder present').not.toBeNull();
  const src = render[0];
  expect(src).toMatch(/class="ch-row-name"/);       // the channel's name
  expect(src).toMatch(/class="ch-row-pct/);          // its share as a number
  expect(src).toMatch(/class="ch-row-rev/);          // its revenue
  expect(src).toMatch(/aria-label="\$\{name\} generated/); // and for a screen reader
});

test('the channel mix is built as markup, so the contrast sweep can see it', () => {
  // Worth pinning: it was long assumed to be a <canvas>, which would have put
  // it outside every automated check the app has. Drawing it to a canvas later
  // would silently remove it from the sweep.
  const fn = mainJs.match(/function renderChannelAnalytics\(\)[\s\S]*?\n\}\n/);
  expect(fn, 'renderChannelAnalytics present').not.toBeNull();
  expect(fn[0]).not.toMatch(/getContext|<canvas/);
});
