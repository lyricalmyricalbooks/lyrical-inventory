// Recording an artist payout, driven through the real app.
//
// These replace the source-text checks that used to live in
// artist-payout-form.test.js ("the handler contains `s.artistPayouts.push`").
// Here the form is rendered by the app, typed into, and saved with the same
// functions its buttons call, and the assertions are on what the publisher is
// told and what reaches the ledger and the cloud — so a wrong amount fails.
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { loadApp, makeBook } from './helpers/load-app.js';

const BOOK = 'harbour';

// Two tiers so the owed figure isn't a single multiplication: the first 200 of
// revenue pays the artist 25%, everything after pays 50%.
const book = makeBook({
  id: BOOK,
  currency: 'CA$',
  profitTiers: [
    { label: 'Early', revenueUpTo: 200, artistPct: 25 },
    { label: 'After', revenueUpTo: null, artistPct: 50 },
  ],
});

// 5 × 40 = 200 (all in the 25% tier → 50) then 3 × 40 = 120 (50% → 60):
// lifetime earnings 110. One 30 payout already made → 80 owed.
const SALES = [
  { num: 'S-2', chan: 'Book Fair', qty: 3, price: 40, date: '2026-02-01', cur: 'CAD' },
  { num: 'S-1', chan: 'Book Fair', qty: 5, price: 40, date: '2026-01-01', cur: 'CAD' },
];
const PRIOR_PAYOUT = { id: 'p-1', date: '2026-01-15', amount: 30, method: 'PayPal', notes: '', cur: 'CAD' };

let app;
let win;

const el = (id) => document.getElementById(`${id}-${BOOK}`);
const preview = () => el('ap-preview');
function type(id, value) {
  const input = el(id);
  input.value = value;
  // Fire what a keystroke fires, so the markup's own oninput handler runs.
  input.dispatchEvent(new Event('input', { bubbles: true }));
}
function choose(id, value) {
  const select = el(id);
  select.value = value;
  select.dispatchEvent(new Event('change', { bubbles: true }));
}
const payouts = () => app.main.states[BOOK].artistPayouts;
const savedPayouts = () => app.cloud.lastSave(BOOK)?.state.artistPayouts;
const statText = (label) => {
  const card = [...document.querySelectorAll('#ps-dash-content .ps-stat-card')]
    .find(c => c.querySelector('.ps-stat-label')?.textContent.trim() === label);
  return card ? card.querySelector('.ps-stat-val').textContent.trim() : null;
};

beforeAll(async () => {
  app = await loadApp({ books: [book] });
  win = app.window;
  win.switchBook(BOOK);
}, 30000);

beforeEach(async () => {
  await app.resetBook(BOOK, {
    hist: SALES,
    sold: 8,
    revenue: 320,
    stock: 92,
    artistPayouts: [PRIOR_PAYOUT],
  });
  win.renderProfitSharingBreakdown(BOOK);
});

describe('the balance card before anything is recorded', () => {
  it('shows lifetime earnings, what has been paid and what is owed', () => {
    expect(statText('Artist earnings')).toMatch(/110\.00$/);
    expect(statText('Paid to artist')).toMatch(/30\.00$/);
    expect(document.querySelector('#ps-dash-content .ps-stat-card.is-lead .ps-stat-val').textContent)
      .toMatch(/80\.00/);
  });
});

describe('previewing a payout before it is saved', () => {
  it('states the balance the moment the form opens', () => {
    win.toggleArtistPayoutForm(BOOK);
    expect(el('artist-payout-form').hidden).toBe(false);
    expect(preview().textContent).toMatch(/80\.00 is currently owed to the artist/);
  });

  it('recomputes on every keystroke: a partial payout says what is left', () => {
    win.toggleArtistPayoutForm(BOOK);
    type('ap-amount', '50');
    expect(preview().textContent).toMatch(/Records CA\$50\.00 — leaves CA\$30\.00 still owed/);
    type('ap-amount', '79.99');
    expect(preview().textContent).toMatch(/leaves CA\$0\.01 still owed/);
  });

  it('recognises the exact balance and marks it good', () => {
    win.toggleArtistPayoutForm(BOOK);
    type('ap-amount', '80');
    expect(preview().textContent).toMatch(/Records CA\$80\.00 — settles the balance in full/);
    expect(preview().className).toContain('is-good');
  });

  it('warns with the overshoot when the payout exceeds what is owed', () => {
    win.toggleArtistPayoutForm(BOOK);
    type('ap-amount', '100');
    expect(preview().textContent).toMatch(/CA\$20\.00 more than the CA\$80\.00 owed/);
    expect(preview().className).toContain('is-warn');
  });

  it('"Pay full balance" fills the owed amount and refreshes the verdict', () => {
    win.toggleArtistPayoutForm(BOOK);
    const fill = [...el('artist-payout-form').querySelectorAll('button')]
      .find(b => /Pay full balance/.test(b.textContent));
    expect(fill.textContent).toMatch(/80\.00/);
    fill.click();
    expect(el('ap-amount').value).toBe('80.00');
    expect(preview().textContent).toMatch(/settles the balance in full/);
  });

  it('reads the balance live, so a payout recorded elsewhere changes the verdict', () => {
    win.toggleArtistPayoutForm(BOOK);
    // Another device's payout synced in without the panel re-rendering.
    payouts().push({ id: 'p-sync', amount: 20, date: '2026-02-02', cur: 'CAD' });
    type('ap-amount', '60');
    expect(preview().textContent).toMatch(/settles the balance in full/);
  });

  it('judges a foreign payout on its converted value, and waits for a rate', async () => {
    win.toggleArtistPayoutForm(BOOK);
    choose('ap-cur', 'USD');
    await app.settle(); // the live-rate lookup fails offline; the box stays empty
    expect(el('ap-fx-row').hidden).toBe(false);
    type('ap-amount', '40');
    expect(preview().textContent).toMatch(/Enter a conversion rate/);
    type('ap-rate', '1.5');
    // 40 USD × 1.5 = 60 CAD against 80 owed.
    expect(preview().textContent).toMatch(/Records CA\$60\.00 — leaves CA\$20\.00 still owed/);
  });
});

describe('recording a payout', () => {
  it('stores the amount, lowers what is owed, and sends it to the cloud', async () => {
    win.toggleArtistPayoutForm(BOOK);
    type('ap-amount', '50');
    el('ap-date').value = '2026-03-01';
    el('ap-method').value = '  e-Transfer ';
    el('ap-notes').value = 'March';
    await win.saveArtistPayout(BOOK);

    expect(payouts()).toHaveLength(2);
    const row = payouts().find(p => p.id !== 'p-1');
    expect(row).toMatchObject({ amount: 50, date: '2026-03-01', method: 'e-Transfer', notes: 'March', cur: 'CAD' });
    expect(row.payment).toMatchObject({ currency: 'CAD', amount: 50, convertedTotal: 50 });
    expect(typeof row.id).toBe('string');

    // What is owed is measured against the new total paid.
    expect(win.calculateArtistEarnings(BOOK)).toMatchObject({ totalPaidToArtist: 80, owedToArtist: 30 });

    // The write reached the cloud with the new row in it.
    expect(app.cloud.savesFor(BOOK)).toHaveLength(1);
    expect(savedPayouts().map(p => p.amount)).toEqual([30, 50]);

    // The panel re-rendered from the new figures and closed the form.
    expect(statText('Paid to artist')).toMatch(/80\.00$/);
    expect(document.querySelector('#ps-dash-content .ps-stat-card.is-lead .ps-stat-val').textContent).toMatch(/30\.00/);
    expect(el('artist-payout-form').hidden).toBe(true);
    expect(app.toast()).toMatch(/Recorded payout of CA\$50\.00/);
  });

  it('is a payout, not a sale: stock, revenue and order history are untouched', async () => {
    win.toggleArtistPayoutForm(BOOK);
    type('ap-amount', '80');
    await win.saveArtistPayout(BOOK);
    const s = app.main.states[BOOK];
    expect(s.hist).toHaveLength(2);
    expect(s.revenue).toBe(320);
    expect(s.stock).toBe(92);
    expect(win.calculateArtistEarnings(BOOK).owedToArtist).toBe(0);
  });

  it('rounds the stored amount to the cent it previewed', async () => {
    win.toggleArtistPayoutForm(BOOK);
    type('ap-amount', '33.333');
    expect(preview().textContent).toMatch(/Records CA\$33\.33/);
    await win.saveArtistPayout(BOOK);
    expect(payouts()[1].amount).toBe(33.33);
    expect(savedPayouts()[1].amount).toBe(33.33);
    expect(win.calculateArtistEarnings(BOOK).owedToArtist).toBe(46.67);
  });

  it('stores a foreign payout in the book currency and keeps the cash beside it', async () => {
    win.toggleArtistPayoutForm(BOOK);
    choose('ap-cur', 'USD');
    await app.settle();
    type('ap-amount', '20');
    type('ap-rate', '1.35');
    await win.saveArtistPayout(BOOK);
    const row = payouts()[1];
    expect(row.amount).toBe(27);
    expect(row.cur).toBe('CAD');
    expect(row.payment).toMatchObject({ currency: 'USD', amount: 20, rate: 1.35, convertedTotal: 27 });
    expect(win.calculateArtistEarnings(BOOK).owedToArtist).toBe(53);
  });

  it('refuses a foreign payout with no rate, and records nothing', async () => {
    win.toggleArtistPayoutForm(BOOK);
    choose('ap-cur', 'USD');
    await app.settle();
    type('ap-amount', '20');
    await win.saveArtistPayout(BOOK);
    expect(payouts()).toHaveLength(1);
    expect(app.cloud.saves).toHaveLength(0);
    expect(app.toast()).toMatch(/conversion rate/);
  });

  it.each([['empty', ''], ['zero', '0'], ['negative', '-5']])('refuses an %s amount, and records nothing', async (_name, value) => {
    win.toggleArtistPayoutForm(BOOK);
    type('ap-amount', value);
    await win.saveArtistPayout(BOOK);
    expect(payouts()).toHaveLength(1);
    expect(app.cloud.saves).toHaveLength(0);
    expect(app.toast()).toMatch(/Enter a valid amount/);
  });

  it('settles an open payout request once enough has been paid since it was made', async () => {
    const s = app.main.states[BOOK];
    s.payoutRequests = [{ id: 'r-1', requestedAt: '2026-02-10T00:00:00.000Z', amount: 80, paidAtRequest: 30 }];
    win.toggleArtistPayoutForm(BOOK);
    type('ap-amount', '50');
    await win.saveArtistPayout(BOOK);
    expect(s.payoutRequests[0].settled).toBeFalsy();

    win.toggleArtistPayoutForm(BOOK);
    type('ap-amount', '30');
    await win.saveArtistPayout(BOOK);
    expect(s.payoutRequests[0].settled).toBe(true);
    expect(app.cloud.lastSave(BOOK).state.payoutRequests[0].settled).toBe(true);
  });

  it('does nothing, and does not throw, if the form left the screen before the click landed', async () => {
    win.toggleArtistPayoutForm(BOOK);
    type('ap-amount', '25');
    el('ap-notes').remove(); // the panel re-rendered between click and handler
    await expect(win.saveArtistPayout(BOOK)).resolves.toBeUndefined();
    expect(payouts()).toHaveLength(1);
    expect(app.cloud.saves).toHaveLength(0);
  });

  it('queues the payout when offline instead of losing it', async () => {
    app.setOnline(false);
    win.toggleArtistPayoutForm(BOOK);
    type('ap-amount', '25');
    await win.saveArtistPayout(BOOK);
    expect(app.cloud.saves).toHaveLength(0);
    const queued = app.queued().find(q => q.bookId === BOOK);
    expect(queued.state.artistPayouts.map(p => p.amount)).toEqual([30, 25]);
  });
});

describe('editing and deleting a payout', () => {
  it('loads the row back into the form and previews against the balance without it', async () => {
    await win.editArtistPayout(BOOK, 'p-1');
    expect(el('ap-amount').value).toBe('30.00');
    expect(el('ap-method').value).toBe('PayPal');
    expect(el('ap-save').textContent).toBe('Update payout');
    // Owed is 80 with this payout counted; editing it, the ceiling is 110.
    type('ap-amount', '30');
    expect(preview().textContent).toMatch(/leaves CA\$80\.00 still owed/);
    type('ap-amount', '110');
    expect(preview().textContent).toMatch(/settles the balance in full/);
  });

  it('updates the row in place rather than adding a second one', async () => {
    await win.editArtistPayout(BOOK, 'p-1');
    type('ap-amount', '45');
    await win.saveArtistPayout(BOOK);
    expect(payouts()).toHaveLength(1);
    expect(payouts()[0]).toMatchObject({ id: 'p-1', amount: 45 });
    expect(payouts()[0].editedAt).toBeTruthy();
    expect(win.calculateArtistEarnings(BOOK).owedToArtist).toBe(65);
    expect(savedPayouts()).toHaveLength(1);
    expect(app.toast()).toMatch(/Updated payout of CA\$45\.00/);
  });

  it('matches legacy numeric ids', async () => {
    payouts()[0].id = 1700000000000;
    await win.editArtistPayout(BOOK, '1700000000000');
    type('ap-amount', '40');
    await win.saveArtistPayout(BOOK);
    expect(payouts()).toHaveLength(1);
    expect(payouts()[0].amount).toBe(40);
  });

  it('asks first before editing a payout that came from a settled sale', async () => {
    payouts()[0].sourceNum = 'S-1';
    const opening = win.editArtistPayout(BOOK, 'p-1');
    await app.answerConfirm(false);
    await opening;
    expect(el('artist-payout-form').hidden).toBe(true);
    expect(el('ap-save').textContent).toBe('Save payout');
  });

  it('will not resurrect a payout deleted while it was being edited', async () => {
    await win.editArtistPayout(BOOK, 'p-1');
    type('ap-amount', '45');
    app.main.states[BOOK].artistPayouts = [];
    await win.saveArtistPayout(BOOK);
    expect(payouts()).toHaveLength(0);
    expect(app.cloud.saves).toHaveLength(0);
    expect(app.toast()).toMatch(/no longer exists/);
  });

  it('deleting a payout puts the amount back on what is owed, after confirming', async () => {
    const deleting = win.deleteArtistPayout(BOOK, 'p-1');
    await app.answerConfirm(true);
    await deleting;
    expect(payouts()).toHaveLength(0);
    expect(win.calculateArtistEarnings(BOOK).owedToArtist).toBe(110);
    expect(savedPayouts()).toEqual([]);
    expect(app.toast()).toMatch(/Payout deleted/);
  });

  it('deletes a legacy row with a numeric id', async () => {
    payouts()[0].id = 1700000000000;
    const deleting = win.deleteArtistPayout(BOOK, '1700000000000');
    await app.answerConfirm(true);
    await deleting;
    expect(payouts()).toHaveLength(0);
  });

  it('only confirms the delete once the save has finished', async () => {
    let finishSave;
    app.cloud.saveImpl = () => new Promise(resolve => { finishSave = () => resolve({ ok: true }); });
    const deleting = win.deleteArtistPayout(BOOK, 'p-1');
    await app.answerConfirm(true);
    expect(finishSave).toBeTypeOf('function');
    expect(app.toast()).not.toMatch(/Payout deleted/);
    finishSave();
    await deleting;
    expect(app.toast()).toMatch(/Payout deleted/);
  });

  it('cancelling the delete keeps the payout', async () => {
    const deleting = win.deleteArtistPayout(BOOK, 'p-1');
    await app.answerConfirm(false);
    await deleting;
    expect(payouts()).toHaveLength(1);
    expect(app.cloud.saves).toHaveLength(0);
  });
});

describe('the payout history list', () => {
  it('totals the recorded payouts against "Paid to artist"', async () => {
    win.toggleArtistPayoutForm(BOOK);
    type('ap-amount', '12.5');
    await win.saveArtistPayout(BOOK);
    const list = document.querySelector('#ps-dash-content .ps-payout-list');
    expect(list.querySelectorAll('.ps-payout-row')).toHaveLength(2);
    expect(list.querySelector('.ps-payout-total').textContent).toMatch(/42\.50/);
    expect(list.textContent).toMatch(/2 payouts/);
  });

  it('says "1 payout", not "1 payouts"', () => {
    const total = document.querySelector('#ps-dash-content .ps-payout-total').textContent;
    expect(total).toMatch(/\b1 payout\b/);
    expect(total).not.toMatch(/1 payouts/);
  });

  it('escapes method and notes text typed by the operator', async () => {
    win.toggleArtistPayoutForm(BOOK);
    type('ap-amount', '5');
    el('ap-method').value = '<img src=x onerror=alert(1)>';
    el('ap-notes').value = '<b>bold</b>';
    await win.saveArtistPayout(BOOK);
    const list = document.querySelector('#ps-dash-content .ps-payout-list');
    expect(list.querySelector('img')).toBeNull();
    expect(list.querySelector('b')).toBeNull();
    expect(list.textContent).toContain('<img src=x onerror=alert(1)>');
    expect(list.textContent).toContain('<b>bold</b>');
  });

  it('shows the guided empty state once there are none', async () => {
    await app.resetBook(BOOK, { hist: SALES, revenue: 320, sold: 8, stock: 92 });
    win.renderProfitSharingBreakdown(BOOK);
    expect(document.querySelector('#ps-dash-content .ps-payout-empty').textContent).toMatch(/No payouts recorded yet/);
  });
});
