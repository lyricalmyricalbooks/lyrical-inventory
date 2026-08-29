import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from 'vitest';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const main = readFileSync(path.join(__dirname, '../src/main.js'), 'utf8');
const styles = readFileSync(path.join(__dirname, '../src/style.css'), 'utf8');

function renderWebAnalyticsBody() {
  const m = main.match(/function renderWebAnalytics\(\) \{([\s\S]+?)\n\}\n/);
  expect(m, 'renderWebAnalytics() not found').not.toBeNull();
  return m[1];
}

test('the Web Analytics "Connected" badge relies on the themed .sheets-badge class, not a hardcoded light-mode fill', () => {
  const body = renderWebAnalyticsBody();

  // The identical Google Sheets badge (updateSheetsBadge()) never touches
  // .style on the element — it only swaps className between 'sheets-badge'
  // and 'sheets-badge off' and lets the stylesheet paint it. This badge used
  // to override that with a literal '#e0f5ea' / '#1d7a4a' pair, which never
  // flips in dark mode and clashed with the correctly-themed Sheets badge
  // right next to it in the same nav group.
  expect(body).not.toMatch(/statusBadge\.style\.(background|color)/);
  expect(body).toMatch(/statusBadge\.className = 'sheets-badge';/);
  expect(body).toMatch(/statusBadge\.className = 'sheets-badge off';/);
});

test('.sheets-badge (connected) is themed with a token, so delegating to it carries dark mode for free', () => {
  const rule = styles.match(/\.sheets-badge\{([^}]*)\}/);
  expect(rule, '.sheets-badge rule not found').not.toBeNull();
  expect(rule[1]).toMatch(/color:\s*var\(--emerald-bright\)/);
  expect(rule[1]).not.toMatch(/#[0-9a-fA-F]{3,6}/);
});
