import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from 'vitest';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const styles = readFileSync(path.join(__dirname, '../src/style.css'), 'utf8');

// The Payments worklist toolbar's type and sort selects inherited the bare
// `select{width:100%}` reset, so on a computer each took a whole row and the
// toolbar stacked into slabs. The class shorthand `background:` also wiped the
// select arrow the reset paints with background-image.
test('Payments toolbar selects size to their options and keep their arrow', () => {
  const mini = styles.match(/\.recon-mini\{([^}]*)\}/);
  expect(mini).not.toBeNull();
  expect(mini[1]).toMatch(/width:auto;/);
  expect(mini[1]).toMatch(/flex:0 0 auto;/);
  expect(mini[1]).toMatch(/background-color:var\(--cream2\);/);
  expect(mini[1]).not.toMatch(/(^|;|\s)background:/);
  expect(mini[1]).toMatch(/padding:7px 34px 7px 10px;/);
});
