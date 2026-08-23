import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from 'vitest';

// Resolved via __dirname rather than `new URL(..., import.meta.url)`: under the
// jsdom test environment the global URL is jsdom's, and node:fs / fileURLToPath
// reject a foreign URL object with "must be of scheme file". Passing a string
// keeps node's own parser in play, and matches how the rest of tests/ does it.
const styles = readFileSync(path.join(__dirname, '../src/style.css'), 'utf8').replace(/\r\n/g, '\n');
const markup = readFileSync(path.join(__dirname, '../index.html'), 'utf8').replace(/\r\n/g, '\n');

test('the primary KPI band fills its row however many tiles a book shows', () => {
  // A fixed four-column band stranded the fifth tile (a profit-sharing book's
  // "Publisher keeps") alone at quarter width on a second line. auto-fit is
  // what stops that, so pin the track function rather than the whole rule.
  const band = styles.match(/\.kpi-grid-primary\s*\{([\s\S]*?)\}/);
  expect(band).not.toBeNull();
  expect(band[1]).toMatch(/grid-template-columns:\s*repeat\(auto-fit,\s*minmax\(180px,\s*1fr\)\)/);
});

test('exactly one dashboard KPI leads the band, at a larger size', () => {
  const lead = styles.match(/\.kpi\.is-lead\s*\{([\s\S]*?)\}/);
  expect(lead).not.toBeNull();
  // Accent-tinted border + a real lift, so the lead reads as raised against
  // the flat supporting tiles rather than merely bigger.
  expect(lead[1]).toMatch(/border-color:\s*color-mix\(/);
  expect(lead[1]).toMatch(/box-shadow:\s*var\(--elev-3\)/);

  // The size step comes off the scale, never a one-off px value — --text-3xl
  // clamps 28px→40px so the step survives the ≤480px .kpi-value drop to 22px.
  const leadValue = styles.match(/\.kpi\.is-lead \.kpi-value\s*\{([\s\S]*?)\}/);
  expect(leadValue).not.toBeNull();
  expect(leadValue[1]).toMatch(/font-size:\s*var\(--text-3xl\)/);
});

test('the book accent marks the lead tile only, not the whole row', () => {
  // The accent hairline used to be painted across every .kpi in a tab panel,
  // which spent the colour on the entire band. Both halves matter: the lead
  // keeps the gradient, and everything else is explicitly neutralised.
  expect(styles).toMatch(
    /\.tab-panel \.kpi\.is-lead::before\s*\{[\s\S]*?background:\s*linear-gradient\(90deg,\s*transparent,\s*var\(--book-accent/,
  );
  const neutral = styles.match(/\.tab-panel \.kpi:not\(\.is-lead\)::before\s*\{([\s\S]*?)\}/);
  expect(neutral).not.toBeNull();
  expect(neutral[1]).toMatch(/background:\s*rgba\(255,\s*255,\s*255,\s*\.09\)\s*!important/);
  expect(neutral[1]).toMatch(/opacity:\s*1/);
});

test('only the lead figure carries the accent colour in the markup', () => {
  const band = markup.match(/<div class="kpi-grid kpi-grid-primary">([\s\S]*?)\n\s*<\/div>\n\s*<details/);
  expect(band).not.toBeNull();

  // Exactly one tile is the lead, and it is the one holding the gold figure —
  // .tab-panel .kpi-value.gold resolves to the book accent, so a second gold
  // figure here would put the accent back on more than one thing.
  expect(band[1].match(/class="kpi is-lead"/g)).toHaveLength(1);
  expect(band[1].match(/class="kpi-value gold"/g)).toHaveLength(1);
  expect(band[1]).toMatch(/class="kpi is-lead"[\s\S]*?class="kpi-value gold" id="d-stock"/);
});
