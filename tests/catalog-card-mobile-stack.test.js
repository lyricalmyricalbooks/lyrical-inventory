import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from 'vitest';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const styles = readFileSync(path.join(__dirname, '../src/style.css'), 'utf8');

test('the Book Catalog row stacks instead of overflowing on a phone', () => {
  const mobileBlock = styles.match(/@media \(max-width: 768px\)\{([\s\S]*?)\n\}\n\n\/\* =+ SMALL PHONES/);
  expect(mobileBlock).not.toBeNull();

  const card = mobileBlock[1].match(/\.catalog-card\s*\{([\s\S]*?)\}/);
  const actions = mobileBlock[1].match(/\.catalog-actions\s*\{([\s\S]*?)\}/);
  const actionsBtn = mobileBlock[1].match(/\.catalog-actions \.btn\s*\{([\s\S]*?)\}/);

  expect(card).not.toBeNull();
  expect(actions).not.toBeNull();
  expect(actionsBtn).not.toBeNull();

  // Column stacking is what removes the row's forced min-content width —
  // the Edit/Remove buttons' own min-width is what pushed the row past the
  // screen edge in the first place.
  expect(card[1]).toMatch(/flex-direction:\s*column/);
  expect(card[1]).toMatch(/align-items:\s*stretch/);
  expect(actions[1]).toMatch(/width:\s*100%/);
  expect(actionsBtn[1]).toMatch(/flex:\s*1/);
});
