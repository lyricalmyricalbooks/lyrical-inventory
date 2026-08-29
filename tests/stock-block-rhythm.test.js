import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from 'vitest';

// Resolved via __dirname rather than `new URL(..., import.meta.url)`: under the
// jsdom test environment the global URL is jsdom's, and node:fs / fileURLToPath
// reject a foreign URL object with "must be of scheme file".
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const styles = readFileSync(path.join(__dirname, '../src/style.css'), 'utf8');
const html = readFileSync(path.join(__dirname, '../index.html'), 'utf8');

const rule = (selector) => {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = styles.match(new RegExp(`\\n${escaped}\\s*\\{([\\s\\S]*?)\\}`));
  expect(match, `missing rule for ${selector}`).not.toBeNull();
  return match[1];
};

test('the stock panels space their stages from two gaps, not per-block margins', () => {
  const block = rule('.stock-block');
  expect(block).toMatch(/display:\s*flex/);
  expect(block).toMatch(/flex-direction:\s*column/);
  // BETWEEN stages.
  expect(block).toMatch(/gap:\s*var\(--space-5\)/);

  // WITHIN one stage — and visibly tighter, or the grouping reads as a
  // rounding error rather than as grouping.
  const stage = rule('.stock-stage');
  expect(stage).toMatch(/gap:\s*var\(--space-2\)/);
  expect(stage).toMatch(/min-width:\s*0/);

  // The margins the gaps replaced must not creep back onto the children.
  expect(rule('.stock-author')).not.toMatch(/margin-bottom/);
  expect(rule('.bar-track')).not.toMatch(/margin-bottom/);
  expect(rule('.stock-alert')).not.toMatch(/margin-top/);
});

test('the on-hand reading leads the panel and sits above the bar it explains', () => {
  const lead = rule('.bar-meta-lead');
  const note = rule('.bar-meta-note');

  // Figure tier: mono, tabular, and two steps above the note beside it.
  expect(lead).toMatch(/font-family:\s*'DM Mono',monospace/);
  expect(lead).toMatch(/font-size:\s*var\(--text-xl\)/);
  expect(lead).toMatch(/font-variant-numeric:\s*tabular-nums/);
  expect(lead).toMatch(/font-feature-settings:\s*'tnum' 1,'zero' 1/);
  // DM Mono ships at 400/500 only — a heavier request is synthesised and
  // faux-bold smears the digits it is meant to strengthen.
  expect(lead).toMatch(/font-weight:\s*500/);

  expect(note).toMatch(/font-size:\s*var\(--text-xs\)/);
  expect(note).toMatch(/font-family:\s*'DM Mono',monospace/);

  // Reading first, bar second — in both panels.
  for (const [labelId, trackId] of [
    ['d-bar-label', 'd-bar-track'],
    ['d-be-bar-label', 'd-be-bar-track'],
  ]) {
    const labelAt = html.indexOf(`id="${labelId}"`);
    const trackAt = html.indexOf(`id="${trackId}"`);
    expect(labelAt, `${labelId} missing`).toBeGreaterThan(-1);
    expect(trackAt, `${trackId} missing`).toBeGreaterThan(-1);
    expect(labelAt).toBeLessThan(trackAt);
  }
});

test('the ink panels use the inverse text tier, not raw white alphas', () => {
  expect(rule('.stock-author')).toMatch(/color:\s*var\(--on-inverse-2\)/);
  expect(rule('.bar-meta-lead')).toMatch(/color:\s*var\(--on-inverse\)/);
  expect(rule('.bar-meta-note')).toMatch(/color:\s*var\(--on-inverse-2\)/);
  // .bar-meta itself no longer paints text at all — the two spans do.
  expect(rule('.bar-meta')).not.toMatch(/color:/);
});

test('the actions row owns its layout in CSS so a mode switch cannot flatten it', () => {
  // updateDashboard() resets this row with `style.display = ''`, which clears
  // an inline `display:flex` outright. The class has to carry the row.
  expect(rule('.stock-actions')).toMatch(/display:\s*flex/);
  expect(html).toMatch(/<div class="stock-actions" id="d-recalc-onhand-wrap">/);
  // No inline margins left in either panel's markup.
  const inventory = html.slice(
    html.indexOf('<div class="stock-block">'),
    html.indexOf('id="d-breakeven-block"'),
  );
  expect(inventory).not.toMatch(/margin-top:|margin-bottom:/);
});
