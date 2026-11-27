import { test, expect } from 'vitest';
import { ocMergeTemplate as orig } from '../../src/lib/opencall.js';
import { ocMergeTemplate as fixed } from '../../src/lib/opencall.js';
for (const [n,f] of [['orig',orig],['fixed',fixed]]) test(n, () => {
  expect(f('Hi {{name}}', { name: "O$'Brien $&" })).toBe("Hi O$'Brien $&");
});
