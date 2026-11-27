import { test, expect } from 'vitest';
import { buildActivityFeed } from '../../src/lib/activity-feed.js';
test('voided book expense hidden', () => {
  const f = buildActivityFeed([{id:'b'}], {b:{expenses:[{id:1, amount:50, desc:'x', voided:true, date:'2026-01-01'}]}});
  expect(f.filter(e=>e.kind==='expense')).toHaveLength(0);
});
