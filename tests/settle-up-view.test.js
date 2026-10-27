import { describe, it, expect } from 'vitest';
import { describeArtistSettlement } from '../src/lib/earnings.js';
import { needsSettleUp, settleUpModel, settleUpHtml, settlementPayoutSummary } from '../src/lib/settle-up-view.js';

// The figures from the owner's screenshot: the author holds 574.68, keeps their
// 74.71 share, so owes 499.97; the publisher owes 267.76 → author sends 232.21.
const screenshot = { heldByArtistGross: 574.68, heldByArtistShare: 74.71, owedToArtist: 267.76, owedByArtist: 0 };
const balance = (over = {}) => describeArtistSettlement({ ...screenshot, ...over });
// Each ledger line as its sign and amount, top to bottom.
const lines = html => [...html.querySelectorAll('.ps-ledger-line')].map(l => `${l.querySelector('.ps-ledger-sign').textContent} ${l.querySelector('.ps-ledger-amt').textContent}`);
const sum = html => html.querySelector('.ps-settle-result .ps-stat-sub').textContent.split(' · ')[0];
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
    expect(html.querySelector('.ps-settle-result .ps-stat-sub').textContent).toBe('CA$499.97 − CA$267.76 · one payment clears both sides');
    expect(html.textContent).toContain('They collected CA$574.68 and keep their CA$74.71 share');
    // The ledger reads top-down: their side added, yours taken away.
    expect(lines(html)).toEqual(['+ CA$499.97', '− CA$267.76']);
    // Each side is a group with its own subtotal, named from your side.
    expect([...html.querySelectorAll('.ps-ledger-group-head')].map(g => [...g.children].map(c => c.textContent)))
      .toEqual([['The author owes you', 'CA$499.97'], ['You owe the author', 'CA$267.76']]);
    expect(html.textContent).toContain('Accrued');
  });

  it('reverses when the publisher owes more', () => {
    const m = settleUpModel(balance({ owedToArtist: 600 }));
    expect([m.direction, m.amount, m.result, m.recordLabel]).toEqual(['to-artist', 100.03, 'You send the author', 'Record payment sent']);
    expect(sum(render(m))).toBe('CA$600.00 − CA$499.97');
  });

  it('says nothing changes hands when the sides cancel out', () => {
    const m = settleUpModel(balance({ owedToArtist: 499.97 }));
    expect([m.direction, m.amount, m.result, m.recordLabel]).toEqual(['settled', 0, 'Nothing to send', 'Record offset']);
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

describe('the sales behind the held line', () => {
  it('lists each held sale, folded away, with its own Settle menu for the publisher', () => {
    const t = { id: 7, num: 'S-2', date: '2026-03-01', chan: 'In Person', qty: 10, total: 400 };
    const html = render(settleUpModel(balance()), { transfers: [t] });
    // Where the sales stand is said once, on the line.
    expect(html.querySelector('.ps-ledger-line .ps-ledger-wait').textContent).toBe('⏳ awaiting transfer');
    const toggle = html.querySelector('.ps-ledger-toggle');
    expect(toggle.textContent).toContain('Show the sale');
    const list = html.querySelector(`#${toggle.getAttribute('aria-controls')}`);
    expect(list.hidden).toBe(true);
    const sub = list.querySelector('.ps-ledger-item');
    expect([...sub.querySelectorAll('.ps-ledger-when,.ps-ledger-what,.ps-ledger-qty,.ps-ledger-amt')].map(c => c.textContent))
      .toEqual(['1 Mar 2026', 'S-2 · In Person', '10×', 'CA$400.00']);
    const opts = [...sub.querySelectorAll('.settle-opt')].map(b => b.getAttribute('onclick'));
    expect(opts.map(o => o.split(';')[1])).toEqual(['markArtistTransferReceived(7)', 'settleArtistTransferKeepShare(7)', 'settleArtistTransferKeepAll(7)']);
  });

  it("says when a held sale has no amount it can trust", () => {
    const html = render(settleUpModel(balance()), { transfers: [{ id: 8, num: 'S-3', total: 'x' }] });
    expect(html.querySelector('.ps-ledger-item').textContent).toContain('Amount missing, check this sale');
  });
});

describe('the colour of the answer', () => {
  it('is due (amber band) while money has to move, and settled (green) when it cancels out', () => {
    expect(render(settleUpModel(balance())).querySelector('.ps-ledger-top').classList.contains('is-due')).toBe(true);
    expect(render(settleUpModel(balance({ owedToArtist: 499.97 }))).querySelector('.ps-ledger-top').classList.contains('is-settled')).toBe(true);
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

describe('unpaid expenses on the slip', () => {
  // The owner's screenshot: 555.48 owed by the author, 312.55 in earnings and
  // a 28.17 shipping receipt owed back to them → author sends 214.76.
  const owner = { heldByArtistGross: 638.49, heldByArtistShare: 83.01, owedToArtist: 312.55, owedByArtist: 0 };
  const shipping = { id: 1, amount: 28.17, desc: 'Shipping Cost (Paid EUR 17.85)', date: '2025-10-08' };
  const withExpenses = (expenses, over = {}) => describeArtistSettlement({ ...owner, ...over }, { expenses });

  it('gets its own line on your side, with the receipt named under it', () => {
    const m = settleUpModel(withExpenses([shipping]));
    expect(m.right.rows.map(r => [r.key, r.amount])).toEqual([['royalties', 312.55], ['expenses', 28.17]]);
    expect([m.amount, m.result]).toEqual([214.76, 'Author sends you']);
    const html = render(m);
    expect(lines(html)).toEqual(['+ CA$555.48', '− CA$312.55', '− CA$28.17']);
    // A single receipt is the line itself: its name and Mark received sit on it.
    const line = [...html.querySelectorAll('.ps-ledger-line')].at(-1);
    expect(line.querySelector('.ps-ledger-label').textContent).toBe('Expenses they paid, owed back');
    expect(line.querySelector('.ps-ledger-detail').textContent).toBe('8 Oct 2025 · Shipping Cost (Paid EUR 17.85) · ⏳ awaiting payment');
    expect(line.querySelector('[data-action="settleUp.markExpenseReceived"]').dataset.id).toBe('1');
    expect(html.querySelector('.ps-ledger-records')).toBeNull();
    // Every ledger figure appears in the sum under the big number.
    expect(sum(html)).toBe('CA$555.48 − CA$312.55 − CA$28.17');
    expect(html.textContent).toContain('marking the CA$28.17 of expenses as paid back');
  });

  it('gives every receipt its own row and Mark received button, because the separate list no longer shows them', () => {
    const many = [1, 2, 3, 4, 5].map(i => ({ id: i, amount: 10, desc: `Receipt ${i}`, date: `2025-10-0${i}` }));
    const html = render(settleUpModel(withExpenses(many)));
    expect([...html.querySelectorAll('.ps-ledger-toggle')].at(-1).textContent).toContain('Show the 5 receipts');
    expect([...html.querySelectorAll('.ps-ledger-item .ps-ledger-what')].map(w => w.textContent)).toEqual([1, 2, 3, 4, 5].map(i => `${i} Oct 2025 · Receipt ${i}`));
    const marks = [...html.querySelectorAll('button')].filter(b => b.textContent.includes('Mark received'));
    expect(marks.map(b => [b.dataset.action, b.dataset.id])).toEqual([1, 2, 3, 4, 5].map(i => ['settleUp.markExpenseReceived', String(i)]));
  });

  it("gives the author no buttons on the lines, only what each one is waiting on", () => {
    const m = settleUpModel(withExpenses([shipping]), { author: true });
    const html = render(m, { canRecord: false, transfers: [{ id: 7, num: 'S-2', date: '2026-03-01', chan: 'In Person', qty: 10, total: 400 }] });
    expect(html.querySelector('[data-action="settleUp.markExpenseReceived"]')).toBeNull();
    expect(html.querySelector('.settle-chooser')).toBeNull();
    // Only the toggle that shows the sales behind the line.
    expect([...html.querySelectorAll('.ps-ledger button')].map(b => b.dataset.action)).toEqual(['settleUp.toggleItems']);
    expect(html.textContent).toContain('⏳ awaiting transfer');
    expect(html.textContent).toContain('⏳ awaiting payment');
  });

  it('reverses when the expenses tip the balance toward the author', () => {
    const m = settleUpModel(withExpenses([{ ...shipping, amount: 300 }]));
    expect([m.direction, m.amount, m.result]).toEqual(['to-artist', 57.07, 'You send the author']);
    expect(sum(render(m))).toBe('CA$312.55 + CA$300.00 − CA$555.48');
  });

  it('speaks from the author side', () => {
    const m = settleUpModel(withExpenses([shipping]), { author: true });
    expect(render(m, { canRecord: false }).textContent).toContain('Expenses you paid, owed back to you');
  });

  it('says when a receipt in another currency was left out of the sum', () => {
    const m = settleUpModel(describeArtistSettlement(owner, { expenses: [shipping], expensesLeftOut: 1 }));
    expect(render(m).textContent).toContain("1 unpaid expense is in another currency with no exchange rate to this book's, so it isn't in this sum. Pay it back separately.");
    expect(render(settleUpModel(withExpenses([shipping]))).textContent).not.toContain('another currency');
  });

  it('names the repaid expenses in the recorded settlement', () => {
    const money = n => `CA$${n.toFixed(2)}`;
    const s = settlementPayoutSummary(withExpenses([shipping]), 395.56, money);
    expect(s.detail).toBe('They kept CA$83.01 of the sales money they collected, CA$28.17 of expenses they paid was paid back, CA$340.72 came off what they owed you. They sent you CA$214.76.');
    const flipped = settlementPayoutSummary(withExpenses([{ ...shipping, amount: 300 }]), 395.56, money);
    expect(flipped.detail).toBe('They kept CA$83.01 of the sales money they collected, CA$300.00 of expenses they paid was paid back, CA$555.48 came off what they owed you, you sent them CA$57.07.');
  });
});
