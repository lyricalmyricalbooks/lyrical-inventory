import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from 'vitest';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const phone = readFileSync(path.join(__dirname, '../src/styles/phone.css'), 'utf8');

test('phone dashboard count tiles reserve two label lines so a pair sits level', () => {
  const rule = phone.match(
    /\.kpi-grid-primary > \.kpi:not\(\.is-lead\):not\(:nth-child\(2\)\) \.kpi-label\s*\{([^}]*)\}/,
  );
  expect(rule).not.toBeNull();
  expect(rule[1]).toMatch(/min-height:\s*2lh;/);
});
