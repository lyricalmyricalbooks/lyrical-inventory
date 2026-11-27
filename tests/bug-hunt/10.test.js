import { test, expect } from 'vitest';
import { mapImportRow } from '../../src/lib/import-columns.js';
test('Units is quantity, not price', () => {
  const r = mapImportRow({ Order: 'A1', Units: 2, Price: 5 });
  expect(r.price).toBe(5); expect(r.qty).toBe(2);
});
