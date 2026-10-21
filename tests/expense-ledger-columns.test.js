import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from 'vitest';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const read = (p) => readFileSync(path.join(__dirname, p), 'utf8');
const styles = read('../src/style.css');
const receipts = read('../src/features/receipts.js');
const html = read('../index.html');

test('expense ledger keeps dates and refs on one line and gives the description room', () => {
  expect(html).toMatch(/<table class="tbl exp-ledger">\s*<thead id="exp-head-row">/);

  const desc = styles.match(/\.tbl\.exp-ledger td\.exp-desc\{([^}]*)\}/);
  const ref = styles.match(/\.tbl\.exp-ledger td\.exp-ref\{([\s\S]*?)\}/);
  expect(desc).not.toBeNull();
  expect(ref).not.toBeNull();
  expect(desc[1]).toMatch(/min-width:\s*18ch/);
  expect(ref[1]).toMatch(/white-space:\s*nowrap/);
  expect(ref[1]).toMatch(/font-family:\s*var\(--font-mono\)/);
});

test('both expense row shapes use the shared date, lead and money cells', () => {
  // The awaiting-approval row and the ordinary row must line up column for column.
  expect(receipts.match(/<td class="date-cell">\$\{fmtD\(e\.date\) \?\? '—'\}<\/td>/g)).toHaveLength(2);
  expect(receipts.match(/<td class="lead-cell exp-desc">/g)).toHaveLength(2);
  expect(receipts.match(/<td class="exp-ref">/g)).toHaveLength(2);
  expect(receipts.match(/<td class="r money-cell"/g)).toHaveLength(2);
});
