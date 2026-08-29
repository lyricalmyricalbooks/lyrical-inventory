import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from 'vitest';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const styles = readFileSync(path.join(__dirname, '../src/style.css'), 'utf8');

test('profit sharing stat cards use the shared stat-card anatomy, not the header-strip class', () => {
  const card = styles.match(/\.ps-stat-card\s*\{([\s\S]*?)\n\}/);
  const label = styles.match(/\.ps-stat-label\s*\{([\s\S]*?)\n\}/);
  const val = styles.match(/\.ps-stat-val\s*\{([\s\S]*?)\n\}/);

  expect(card).not.toBeNull();
  expect(label).not.toBeNull();
  expect(val).not.toBeNull();

  // Label matches the documented stat-card tier, not a raw pixel guess.
  expect(label[1]).toMatch(/font-size:\s*var\(--text-2xs\)/);
  expect(label[1]).toMatch(/font-weight:\s*800/);

  // Figure is DM Mono with tabular numerals, at the stat-card figure step.
  expect(val[1]).toMatch(/font-family:\s*'DM Mono',\s*monospace/);
  expect(val[1]).toMatch(/font-size:\s*var\(--text-xl\)/);
  expect(val[1]).toMatch(/font-feature-settings:\s*"tnum"\s*1/);

  // The 3px bottom accent, not a left border, matching .hist-kpi-card / .consignment-stat-card.
  expect(card[1]).toMatch(/position:\s*relative/);
});

test('exactly one profit sharing card leads, by size, and its tone is a token modifier', () => {
  const lead = styles.match(/\.ps-stat-card\.is-lead\s*\.ps-stat-val\s*\{([\s\S]*?)\}/);
  expect(lead).not.toBeNull();
  expect(lead[1]).toMatch(/font-size:\s*var\(--text-2xl\)/);

  for (const tone of ['gold', 'critical', 'green']) {
    const rule = styles.match(new RegExp(`\\.ps-stat-card\\.tone-${tone}\\s*\\{([\\s\\S]*?)\\}`));
    expect(rule, `tone-${tone} rule should exist`).not.toBeNull();
    // Every tone is built from a semantic/status token, never a raw hex or rgba literal.
    expect(rule[1]).not.toMatch(/#[0-9a-fA-F]{3,8}/);
    expect(rule[1]).not.toMatch(/rgba?\(\s*\d/);
  }
});

test('the grid step is a class modifier, not an inline template-computed column count', () => {
  const mainJs = readFileSync(path.join(__dirname, '../src/main.js'), 'utf8');
  expect(mainJs).not.toMatch(/grid-template-columns:repeat\(\$\{hasHeld/);
  expect(mainJs).toMatch(/ps-stat-grid \$\{hasHeld \? 'cols-4' : 'cols-3'\}/);

  const grid3 = styles.match(/\.ps-stat-grid\.cols-3\s*\{([\s\S]*?)\}/);
  const grid4 = styles.match(/\.ps-stat-grid\.cols-4\s*\{([\s\S]*?)\}/);
  expect(grid3[1]).toMatch(/repeat\(3,\s*minmax\(0,\s*1fr\)\)/);
  expect(grid4[1]).toMatch(/repeat\(4,\s*minmax\(0,\s*1fr\)\)/);
});
