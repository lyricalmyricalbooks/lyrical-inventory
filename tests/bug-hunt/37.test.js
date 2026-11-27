import { test, expect } from 'vitest';
import { findDeductionGaps } from '../../src/lib/deduction-gaps.js';
test('Book Fair sales feed event detector', () => {
  const g = findDeductionGaps({ tripsSummary: { Expo: { total: 0, record: { startDate: '2026-05-01', endDate: '2026-05-02' } } },
    states: { b1: { hist: [{ chan: 'Book Fair', date: '2026-05-01', qty: 2, price: 20, num: 'POS-1' }] } } });
  const ids = (g.gaps || g).map?.(x => x.id) ?? JSON.stringify(g);
  expect(JSON.stringify(ids)).toContain('event-no-costs:Expo');
});
