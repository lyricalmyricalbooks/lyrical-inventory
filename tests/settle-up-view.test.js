import { describe, it, expect } from 'vitest';
import { describeArtistSettlement } from '../src/lib/earnings.js';
import { needsSettleUp, settleUpModel, settleUpHeadline, settleUpHtml } from '../src/lib/settle-up-view.js';

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
    // No negative figures anywhere in the columns.
    expect([...html.querySelectorAll('.ps-settle-col .ps-settle-amt')].some(a => a.textContent.includes('−'))).toBe(false);
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
