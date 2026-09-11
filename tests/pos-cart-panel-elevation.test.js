import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from 'vitest';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const styles = readFileSync(path.join(__dirname, '../src/style.css'), 'utf8');

test('POS cart panel uses the themed elevation token, not a raw warm-black shadow', () => {
  // Anchored to the unindented top-level rule (background/border/shadow) —
  // the file also has an indented `.pos-cart-panel{` inside a mobile
  // @media block and a second top-level rule for the stage-gap flex layout.
  const panel = styles.match(/^\.pos-cart-panel \{([\s\S]*?)\n\}/m);

  expect(panel).not.toBeNull();
  expect(panel[1]).toMatch(/box-shadow:\s*var\(--elev-3\)\s*!important;/);
  // Guards against the panel's own dark-mode invisibility bug coming back —
  // a raw rgba(warm-black) shadow reads as no lift at all once the page
  // goes dark, same class of bug already fixed on .hist-kpi-card.
  expect(panel[1]).not.toMatch(/rgba\(\s*14,\s*12,\s*10/);
});
