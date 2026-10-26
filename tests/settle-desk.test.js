// The publisher's "Settle up with your artist" card: both directions of money
// in one place, netted into one figure. See src/lib/settle-desk.js.
import { describe, it, expect } from 'vitest';
import { settleDeskModel, dashHeadsUp } from '../src/lib/settle-desk.js';

describe('settleDeskModel', () => {
  it('nets expenses owed against money the artist collected', () => {
    const m = settleDeskModel({ expenses: [{ amount: 80 }], transfers: [{ amount: 17 }], cur: 'EUR' });
    expect(m.show).toBe(true);
    expect(m.owe.total).toBe(80);
    expect(m.owed.total).toBe(17);
    expect(m.direction).toBe('to-artist');
    expect(m.amount).toBe(63);
    expect(m.kicker).toBe('So you pay');
    expect(m.askForLink).toBe(true);
    expect(m.note).toMatch(/Settle each line on its own/);
    expect(m.note).toMatch(/hasn't added a payment link/);
  });

  it('turns around when the artist owes more', () => {
    const m = settleDeskModel({ expenses: [{ amount: 10 }], transfers: [{ amount: 25.5 }] });
    expect(m.direction).toBe('to-publisher');
    expect(m.amount).toBe(15.5);
    expect(m.kicker).toBe('So the artist sends you');
    expect(m.askForLink).toBe(false);
  });

  it('uses the Settle up figure when Settle up is live, so the two never disagree', () => {
    const m = settleDeskModel({
      expenses: [{ amount: 80 }], transfers: [{ amount: 17 }],
      settle: { direction: 'to-artist', amount: 71.2 }, hasPayLink: true,
    });
    expect(m.amount).toBe(71.2);
    expect(m.inSettleUp).toBe(true);
    expect(m.openLink).toBe(true);
    expect(m.note).toMatch(/One payment covers both sides/);
  });

  it('leaves sales awaiting approval or without a price out of the sum, and says so', () => {
    const m = settleDeskModel({ transfers: [{ amount: 20 }, { amount: null, pending: true }, { amount: null }] });
    expect(m.owed.total).toBe(20);
    expect(m.note).toMatch(/1 more sale needs your approval/);
    expect(m.note).toMatch(/1 sale has no price yet/);
  });

  it('hides when nothing is owed either way', () => {
    const m = settleDeskModel({});
    expect(m.show).toBe(false);
    expect(m.direction).toBe('settled');
  });
});

describe('dashHeadsUp', () => {
  it('names low stock and costs still to recover', () => {
    expect(dashHeadsUp({ stock: 3, threshold: 5, breakEven: { remaining: 181 }, cur: 'EUR' }))
      .toEqual(['Stock is low: 3 left, alert at 5.', expect.stringMatching(/^Not broken even: .*181.* to go\.$/)]);
  });
  it('stays quiet when all is well', () => {
    expect(dashHeadsUp({ stock: 20, threshold: 5, breakEven: { remaining: 0 } })).toEqual([]);
  });
});
