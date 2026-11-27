import { test, expect } from 'vitest';
import { classifyImportRows } from '../../src/lib/import-batch.js';
test('numeric hist num counts as inBook', () => {
  const rows=[{num:'1001'}]; classifyImportRows(rows,[{num:1001}]);
  expect(rows[0].status).toBe('inBook');
});
