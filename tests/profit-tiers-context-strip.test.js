import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from 'vitest';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const styles = readFileSync(path.join(__dirname, '../src/style.css'), 'utf8');
const mainJs = readFileSync(path.join(__dirname, '../src/main.js'), 'utf8');

test('Profit Tiers context strip renders on the shared stat-card anatomy, not a bare --cream2 card', () => {
  // The old card painted `background: var(--cream2)`, which sits ~1-2% off
  // the dark-theme page colour and read as nearly invisible. Renders should
  // use .ps-stat-card, whose surface token and bottom accent are already
  // verified against both themes.
  expect(mainJs).toMatch(/ctx\.className = 'ps-stat-grid cols-auto';/);
  expect(mainJs).toMatch(/class="ps-stat-card\$\{accent === 'gold' \? ' tone-gold' : ''\}"/);
  expect(mainJs).not.toMatch(/settings-metric-grid/);
  expect(mainJs).not.toMatch(/settings-metric-card/);
  expect(mainJs).not.toMatch(/settings-metric-value/);

  // The card rule itself must be gone from the stylesheet — this is the
  // regression a future edit could silently reintroduce by restyling
  // .settings-metric-card instead of touching .ps-stat-card.
  expect(styles).not.toMatch(/\.settings-metric-card\s*\{/);
  expect(styles).not.toMatch(/\.settings-metric-grid\s*\{/);

  // .ps-stat-card itself must stay on the themed surface token, never the
  // raw --cream2 this fix moved away from.
  const psStatCard = styles.match(/\.ps-stat-card\s*\{([\s\S]*?)\n\}/);
  expect(psStatCard).not.toBeNull();
  expect(psStatCard[1]).toMatch(/background:\s*var\(--surface-card\);/);

  // The strip needs an auto-fit track so the single-card "no revenue yet"
  // state doesn't get stretched to a fixed grid's stranded column.
  expect(styles).toMatch(/\.ps-stat-grid\.cols-auto\s*\{\s*grid-template-columns:\s*repeat\(auto-fit,\s*minmax\(180px,\s*1fr\)\);\s*\}/);
});
