import { describe, it, expect } from 'vitest';
import { describeArtistSettlement } from '../src/lib/earnings.js';
import { needsSettleUp, settleUpModel, settleUpHeadline, settleUpHtml, settlementPayoutSummary } from '../src/lib/settle-up-view.js';

// The figures from the owner's screenshot: the author holds 574.68, keeps their
// 74.71 share, so owes 499.97; the publisher owes 267.76 → author sends 232.21.
const screenshot = { heldByArtistGross: 574.68, heldByArtistShare: 74.71, owedToArtist: 267.76, owedByArtist: 0 };
const balance = (over = {}) => describeArtistSettlement({ ...screenshot, ...over });
const render = (model, opts = {}) => {
  const div = document.createElement('div');
  div.innerHTML = settleUpHtml(model, { bookId: 'b', cur: 'CA$', canRecord: true, hasWork: true, statement: 'S', ...opts });
  return div;
};

describe('when the panel appears', () => {
  it('only when money runs toward the publisher', () => {
    expect(needsSettleUp(balance())).toBe(true);
    expect(needsSettleUp(describeArtistSettlement({ owedToArtist: 80 }))).toBe(false);
    expect(needsSettleUp(describeArtistSettlement({ owedToArtist: 80, owedByArtist: 15 }))).toBe(true);
    expect(needsSettleUp(null)).toBe(false);
  });
});

describe('the two columns', () => {
  it('adds each side up once and puts the difference in the result', () => {
    const m = settleUpModel(balance());
    expect(m.left.rows.map(r => [r.key, r.amount])).toEqual([['held', 499.97]]);
    expect(m.right.rows.map(r => [r.key, r.amount])).toEqual([['royalties', 267.76]]);
    expect([m.left.total, m.right.total, m.amount, m.result]).toEqual([499.97, 267.76, 232.21, 'Author sends you']);
    const html = render(m);
    expect(html.querySelector('.ps-settle-result .ps-stat-val').textContent).toBe('CA$232.21');
    expect(html.querySelector('.ps-settle-result .ps-stat-sub').textContent).toBe('CA$499.97 − CA$267.76');
    expect(html.textContent).toContain('They collected CA$574.68 and keep their CA$74.71 share');
    // The slip reads top-down: their side added, yours taken away, then the result.
    expect([...html.querySelectorAll('.ps-slip-amt')].map(a => a.textContent)).toEqual(['+ CA$499.97', '− CA$267.76', '= CA$232.21']);
  });

  it('reverses when the publisher owes more', () => {
    const m = settleUpModel(balance({ owedToArtist: 600 }));
    expect([m.direction, m.amount, m.result, m.recordLabel]).toEqual(['to-artist', 100.03, 'You send the author', 'Record payment sent']);
    expect(render(m).querySelector('.ps-settle-result .ps-stat-sub').textContent).toBe('CA$600.00 − CA$499.97');
  });

  it('says nothing changes hands when the sides cancel out', () => {
    const m = settleUpModel(balance({ owedToArtist: 499.97 }));
    expect([m.direction, m.amount, m.result, m.recordLabel]).toEqual(['settled', 0, 'Nothing to send', 'Record offset']);
    expect(settleUpHeadline(m, 'CA$').sub).toBe('the two sides cancel out');
  });

  it('lists other debts and an earlier overpayment only when they exist', () => {
    const m = settleUpModel(balance({ owedToArtist: -10, owedByArtist: 25 }));
    expect(m.left.rows.map(r => r.key)).toEqual(['held', 'debt', 'overpaid']);
    expect(m.right.rows).toEqual([]);
    expect(m.left.total).toBe(534.97);
    expect(m.amount).toBe(534.97);
    expect(render(m).textContent).toContain('leave it as credit');
    expect(settleUpModel(balance()).left.rows.map(r => r.key)).toEqual(['held']);
  });
});

describe("the author's read-only view", () => {
  it('speaks from their side and offers no way to record', () => {
    const m = settleUpModel(balance(), { author: true });
    expect([m.left.title, m.right.title, m.result]).toEqual(['You owe the publisher', 'The publisher owes you', 'You send the publisher']);
    const html = render(m, { canRecord: false });
    expect(html.textContent).toContain('You collected CA$574.68 and keep your CA$74.71 share');
    expect(html.textContent).toContain('Copy statement');
    expect(html.querySelector('[id^="artist-settlement-record-button"]')).toBeNull();
    expect(html.querySelector('[id^="artist-settlement-form"]')).toBeNull();
  });
});

describe('recording', () => {
  it('names the button after the direction the money moves', () => {
    expect(render(settleUpModel(balance())).querySelector('#artist-settlement-record-button-b').textContent).toBe('Record payment received');
  });

  it('is withheld while an earlier settlement needs review, or when there is nothing to record', () => {
    const m = settleUpModel(balance());
    const review = render(m, { reviewError: true });
    expect(review.querySelector('#artist-settlement-record-button-b')).toBeNull();
    expect(review.textContent).toMatch(/needs review/);
    expect(render(m, { hasWork: false }).querySelector('#artist-settlement-record-button-b')).toBeNull();
  });

  it('warns when this book has changes still waiting to sync', () => {
    const m = settleUpModel(balance());
    expect(render(m, { pendingSync: 2 }).textContent).toContain("2 changes on this device haven't synced yet");
    expect(render(m).textContent).toContain('Based on the records on this device');
  });
});

describe('a recorded settlement in the payouts list', () => {
  const money = n => `CA$${n.toFixed(2)}`;
  it('shows the earnings it paid and the cash that moved', () => {
    const s = settlementPayoutSummary(balance(), 342.47, money);
    expect(s.title).toBe('Earnings paid by settlement');
    expect(s.amount).toBe(342.47);
    expect(s.detail).toBe('They kept CA$74.71 of the sales money they collected, CA$267.76 came off what they owed you. They sent you CA$232.21.');
  });

  it('splits the earnings into the offset and the cash sent when the publisher owed more', () => {
    const s = settlementPayoutSummary(balance({ owedToArtist: 600 }), 674.71, money);
    expect(s.detail).toBe('They kept CA$74.71 of the sales money they collected, CA$499.97 came off what they owed you, you sent them CA$100.03.');
  });

  it('mentions earnings still owed from newer sales', () => {
    const s = settlementPayoutSummary({ ...balance(), royaltiesCarried: 8.27 }, 342.47, money);
    expect(s.detail).toMatch(/CA\$8\.27 from newer sales is still owed to them\.$/);
  });

  it('names a recovered overpayment', () => {
    const s = settlementPayoutSummary(balance({ owedToArtist: -10 }), 64.71, money);
    expect(s.detail).toContain('CA$10.00 of an earlier overpayment was recovered');
    expect(settlementPayoutSummary(balance({ owedToArtist: -100 }), -25.29, money).title).toBe('Earlier overpayment recovered');
  });
});

describe("the author's view of a recorded settlement", () => {
  it('speaks from their side', () => {
    const s = settlementPayoutSummary({ ...balance(), royaltiesCarried: 8.27 }, 342.47, n => `CA$${n.toFixed(2)}`, { author: true });
    expect(s.detail).toBe('You kept CA$74.71 of the sales money you collected, CA$267.76 came off what you owed the publisher. You sent the publisher CA$232.21. CA$8.27 from newer sales is still owed to you.');
  });
});
