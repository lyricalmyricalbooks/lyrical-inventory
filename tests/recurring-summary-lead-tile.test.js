import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from 'vitest';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const styles = readFileSync(path.join(__dirname, '../src/style.css'), 'utf8');
const taxCentre = readFileSync(path.join(__dirname, '../src/features/taxcentre.js'), 'utf8');

test('the Recurring Subscriptions summary strip has exactly one leading tile', () => {
  const stat = styles.match(/\.rec-stat\s*\{([\s\S]*?)\n\}/);
  const statVal = styles.match(/\.rec-stat-val\s*\{([\s\S]*?)\n\}/);
  const leadVal = styles.match(/\.rec-stat\.is-lead \.rec-stat-val\s*\{([\s\S]*?)\}/);

  expect(stat).not.toBeNull();
  expect(statVal).not.toBeNull();
  expect(leadVal).not.toBeNull();

  // Baseline tiles stay neutral — colour is spent once, on the lead only.
  expect(statVal[1]).toMatch(/color:\s*var\(--content-primary\);/);
  expect(statVal[1]).not.toMatch(/--gold-text/);

  // The lead steps up in both size and colour, per the house stat-card rule.
  expect(leadVal[1]).toMatch(/font-size:\s*var\(--text-xl\);/);
  expect(leadVal[1]).toMatch(/color:\s*var\(--gold-text\);/);

  // The accent is a bottom ::after, never a left border, matching the other
  // stat strips in the app (.hist-kpi-card, .consignment-stat-card).
  expect(styles).toMatch(/\.rec-stat::after\{[\s\S]*?inset:auto 0 0;height:3px;/);
  expect(styles).toMatch(/\.rec-stat\.is-lead::after\{background:linear-gradient\(90deg,var\(--gold\),var\(--gold3\)\);\}/);

  // Exactly one tile in the rendered strip carries the class — "Committed per
  // month" is the figure the panel exists to report.
  const leadMatches = taxCentre.match(/class="rec-stat is-lead"/g) || [];
  expect(leadMatches).toHaveLength(1);
  expect(taxCentre).toMatch(/class="rec-stat is-lead">\s*<div class="rec-stat-val">\$\{fmt\(summary\.monthlyBase/);
});
