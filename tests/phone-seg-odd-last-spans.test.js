import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from 'vitest';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const phone = readFileSync(path.join(__dirname, '../src/styles/phone.css'), 'utf8');

test('an odd last phone option button spans the full row instead of sitting alone', () => {
  expect(phone).toMatch(
    /\.phone-seg-opt:last-child:nth-child\(odd\)\s*\{\s*grid-column:\s*1\s*\/\s*-1;\s*\}/,
  );
});
