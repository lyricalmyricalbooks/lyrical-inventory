import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from 'vitest';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const phone = readFileSync(path.join(__dirname, '../src/styles/phone.css'), 'utf8');

test('phone payments toolbar keeps "Group identical" and "Dismiss all shown" on one line each', () => {
  const toggle = phone.match(/#tab-reconcile \.recon-toggle \{([^}]*)\}/);
  const btn = phone.match(/#tab-reconcile \.recon-toolbar > \.btn \{([^}]*)\}/);
  expect(toggle).not.toBeNull();
  expect(btn).not.toBeNull();
  expect(toggle[1]).toMatch(/white-space:\s*nowrap/);
  expect(toggle[1]).toMatch(/font-size:\s*var\(--text-sm\)/);
  expect(btn[1]).toMatch(/white-space:\s*nowrap/);
  expect(btn[1]).toMatch(/padding-inline:\s*var\(--space-2\)/);
});
