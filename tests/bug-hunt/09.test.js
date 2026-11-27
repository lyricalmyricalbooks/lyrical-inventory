import { test, expect } from 'vitest';
import { csvToObjects } from '../../src/lib/csv.js';
test('tab in quoted field', () => {
  expect(csvToObjects('name,notes\nA,"multi\nline\twith tab"')).toEqual([{ name: 'A', notes: 'multi\nline\twith tab' }]);
});
