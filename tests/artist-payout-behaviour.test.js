// Recording an artist payout, driven through the real app.
//
// These replace the source-text checks that used to live in
// artist-payout-form.test.js ("the handler contains `s.artistPayouts.push`").
// Here the form is rendered by the app, typed into, and saved with the same
// functions its buttons call, and the assertions are on what the publisher is
// told and what reaches the ledger and the cloud — so a wrong amount fails.
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
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

describe('calculating the author payment', () => {
  it('opens from the real button offline without writing or clearing any balances', async () => {
    app.main.states[BOOK].hist.unshift({ num: 'held', qty: 1, price: 200, artistPending: true });
    app.setOnline(false);
    win.renderProfitSharingBreakdown(BOOK);
    const before = JSON.stringify(app.main.states[BOOK]);
    const saves = app.cloud.saves.length;
    const queued = JSON.stringify(app.queued());
    const button = el('artist-settlement-button');
    expect(button).not.toBeNull();
    expect(button.getAttribute('aria-expanded')).toBe('false');
    button.click();
    const result = el('artist-settlement');
    expect(result.hidden).toBe(false);
    expect(result.textContent).toContain('Author sends you');
    expect(result.querySelector('.ps-stat-val').textContent).toBe('CA$20.00');
    expect(result.textContent).toContain('CA$100.00');
    expect(result.textContent).toContain('CA$80.00');
    expect(JSON.stringify(app.main.states[BOOK])).toBe(before);
    expect(app.cloud.saves.length).toBe(saves);
    expect(JSON.stringify(app.queued())).toBe(queued);
    button.click();
    expect(result.hidden).toBe(true);
    // Reopening reads the newest balances rather than retaining the old result.
    app.main.states[BOOK].artistReceivables = [{ id: 'new', amount: 15 }];
    button.click();
    expect(result.querySelector('.ps-stat-val').textContent).toBe('CA$35.00');
  });

  it('says you send the author money when they hold no sales money', () => {
    el('artist-settlement-button').click();
    const result = el('artist-settlement');
    expect(result.textContent).toContain('You send the author');
    expect(result.querySelector('.ps-stat-val').textContent).toBe('CA$80.00');
  });
});

describe('recording and explaining a combined settlement', () => {
  beforeEach(() => {
    const s = app.main.states[BOOK];
    s.hist.unshift({ num: 'held', qty: 1, price: 200, artistPending: true, date: '2026-03-01', chan: 'Fair' });
    s.artistTransfers = [{ id: 't-held', num: 'held', total: 200, price: 200, qty: 1, date: '2026-03-01', chan: 'Fair' }];
    win.renderProfitSharingBreakdown(BOOK);
    el('artist-settlement-button').click();
  });

  it('copies the displayed explanation without recording money', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    const before = JSON.stringify(app.main.states[BOOK]);
    await win.copyArtistSettlement(BOOK);
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining('You send the publisher CA$20.00'));
    expect(writeText.mock.calls[0][0]).toContain('CA$100.00');
    expect(writeText.mock.calls[0][0]).toContain('not a receipt');
    expect(JSON.stringify(app.main.states[BOOK])).toBe(before);
  });

  it('keeps the text selectable when clipboard access fails', async () => {
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: vi.fn().mockRejectedValue(new Error('denied')) } });
    await win.copyArtistSettlement(BOOK);
    expect(el('artist-settlement-text').value).toContain('You send the publisher CA$20.00');
    expect(app.toast()).toMatch(/select|copy/i);
  });

  it('records offline, queues the whole linked change, and undoes both balances', async () => {
    app.setOnline(false);
    win.toggleArtistSettlementForm(BOOK);
    const saved = win.recordArtistSettlement(BOOK);
    await app.answerConfirm(true);
    await saved;
    const record = payouts().at(-1);
    expect(record.amount).toBe(180);
    expect(record.settlement.balance).toMatchObject({ amount: 20, direction: 'to-publisher' });
    expect(app.main.states[BOOK].artistTransfers).toHaveLength(0);
    expect(app.queued().at(-1).state.artistPayouts.at(-1).settlement.balance.amount).toBe(20);
    expect(app.queued().at(-1).state.hist[0].artistPending).toBe(false);
    expect(document.querySelector('#ps-dash-content .is-lead .ps-stat-val').textContent).toBe('CA$0.00');
    const undone = win.undoRecordedArtistSettlement(BOOK, record.id);
    await app.answerConfirm(true);
    await undone;
    expect(record.voided).toBe(true);
    expect(app.main.states[BOOK].hist[0].artistPending).toBe(true);
    expect(app.main.states[BOOK].artistTransfers).toHaveLength(1);
    expect(document.querySelector('#ps-dash-content .is-lead .ps-stat-val').textContent).toBe('CA$80.00');
  });

  it('leaves everything unchanged when confirmation is cancelled', async () => {
    win.toggleArtistSettlementForm(BOOK);
    const before = JSON.stringify(app.main.states[BOOK]);
    const saved = win.recordArtistSettlement(BOOK);
    await app.answerConfirm(false);
    await saved;
    expect(JSON.stringify(app.main.states[BOOK])).toBe(before);
  });

  it('rejects a stale preview rather than recording a different amount', async () => {
    win.toggleArtistSettlementForm(BOOK);
    app.main.states[BOOK].artistPayouts.push({ id: 'new', amount: 10 });
    const before = JSON.stringify(app.main.states[BOOK]);
    await win.recordArtistSettlement(BOOK);
    expect(JSON.stringify(app.main.states[BOOK])).toBe(before);
    expect(app.toast()).toMatch(/changed|calculate again/i);
  });

  it('checks again after confirmation if another payment arrives while the dialog is open', async () => {
    win.toggleArtistSettlementForm(BOOK);
    const saved = win.recordArtistSettlement(BOOK);
    app.main.states[BOOK].artistPayouts.push({ id: 'received-elsewhere', amount: 10 });
    const before = JSON.stringify(app.main.states[BOOK]);
    await app.answerConfirm(true); await saved;
    expect(JSON.stringify(app.main.states[BOOK])).toBe(before);
    expect(app.toast()).toMatch(/changed|calculate again/i);
  });

  it('uses the settlement undo path when the generic delete action is invoked', async () => {
    win.toggleArtistSettlementForm(BOOK);
    const saved = win.recordArtistSettlement(BOOK);
    await app.answerConfirm(true); await saved;
    const record = payouts().at(-1);
    const deleted = win.deleteArtistPayout(BOOK, record.id);
    await app.answerConfirm(true); await deleted;
    expect(record.voided).toBe(true);
    expect(app.main.states[BOOK].hist[0].artistPending).toBe(true);
  });

  it('uses Undo from the Tax Centre without deleting only half the settlement', async () => {
    win.toggleArtistSettlementForm(BOOK);
    const saved = win.recordArtistSettlement(BOOK);
    await app.answerConfirm(true); await saved;
    const record = payouts().at(-1);
    const deleted = app.main.removeLedgerEntry('artistPayout', BOOK, record.id);
    await app.answerConfirm(true); await deleted;
    expect(record.voided).toBe(true);
    expect(app.main.states[BOOK].hist[0].artistPending).toBe(true);
    expect(app.main.states[BOOK].artistTransfers).toHaveLength(1);
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

// The artist owes the shop 30 (copies they bought) while the shop owes them 80.
describe('netting what the artist owes against a payout', () => {
  const DEBT = { id: 'd-1', date: '2026-02-10', amount: 30, reason: 'Author copies', cur: 'CAD' };
  const withDebt = async (debts = [DEBT]) => {
    await app.resetBook(BOOK, {
      hist: SALES, sold: 8, revenue: 320, stock: 92,
      artistPayouts: [PRIOR_PAYOUT], artistReceivables: debts,
    });
    win.renderProfitSharingBreakdown(BOOK);
    win.toggleArtistPayoutForm(BOOK);
  };

  it('offers nothing to net when the artist owes nothing', async () => {
    await withDebt([]);
    expect(el('ap-net')).toBeNull();
  });

  it('spells the sum out on the balance card', async () => {
    await withDebt();
    const sub = document.querySelector('#ps-dash-content .ps-stat-card.is-lead .ps-stat-sub').textContent;
    expect(sub).toMatch(/less CA\$30\.00 the artist owes you → send CA\$50\.00/);
  });

  it('"Pay full balance" fills the net cash and the preview says what clears', async () => {
    await withDebt();
    expect(el('ap-net').checked).toBe(true);
    const fill = [...el('artist-payout-form').querySelectorAll('button')].find(b => /Pay full balance/.test(b.textContent));
    expect(fill.textContent).toMatch(/50\.00/);
    fill.click();
    expect(el('ap-amount').value).toBe('50.00');
    expect(preview().textContent).toMatch(/settles the balance in full/);
  });

  it('saving records the cash and the debt it cleared in one write', async () => {
    await withDebt();
    type('ap-amount', '50');
    await win.saveArtistPayout(BOOK);
    const saved = payouts().at(-1);
    expect(saved.amount).toBe(50);
    expect(saved.offsets).toEqual([{ id: 'd-1', amount: 30 }]);
    const stats = win.calculateArtistEarnings(BOOK);
    expect(stats.owedToArtist).toBe(0);
    expect(stats.owedByArtist).toBe(0);
    expect(app.cloud.lastSave(BOOK)?.state.artistPayouts.at(-1).offsets).toHaveLength(1);
  });

  it('unticking the box pays the full royalty and leaves the debt open', async () => {
    await withDebt();
    el('ap-net').checked = false;
    type('ap-amount', '80');
    await win.saveArtistPayout(BOOK);
    expect(payouts().at(-1).offsets).toBeUndefined();
    expect(win.calculateArtistEarnings(BOOK).owedByArtist).toBe(30);
  });

  it('a debt bigger than the royalty sends no cash and keeps the rest open', async () => {
    await withDebt([{ ...DEBT, amount: 200 }]);
    el('ap-amount').value = '';
    await win.saveArtistPayout(BOOK);
    const saved = payouts().at(-1);
    expect(saved.amount).toBe(0);
    expect(saved.offsets).toEqual([{ id: 'd-1', amount: 80 }]);
    expect(win.calculateArtistEarnings(BOOK).owedByArtist).toBe(120);
  });

  it('deleting the netted payout reopens the debt and says so', async () => {
    await withDebt();
    type('ap-amount', '50');
    await win.saveArtistPayout(BOOK);
    const id = payouts().at(-1).id;
    const deleting = win.deleteArtistPayout(BOOK, id);
    await app.answerConfirm(true);
    await deleting;
    const stats = win.calculateArtistEarnings(BOOK);
    expect(stats.owedByArtist).toBe(30);
    expect(stats.owedToArtist).toBe(80);
    expect(app.toast()).toMatch(/debt it netted is owed again/);
  });

  it('the history row notes what was netted', async () => {
    await withDebt();
    type('ap-amount', '50');
    await win.saveArtistPayout(BOOK);
    expect(document.querySelector('#ps-dash-content .ps-payout-list').textContent)
      .toMatch(/netted CA\$30\.00 owed to you/);
  });

  it('a mistyped amount is rejected, not silently treated as "send nothing"', async () => {
    await withDebt();
    const before = payouts().length;
    type('ap-amount', '-5');
    await win.saveArtistPayout(BOOK);
    expect(payouts()).toHaveLength(before);
    expect(app.toast()).toMatch(/valid amount/);
  });

  it('a payout request is closed by a netted payment', async () => {
    await withDebt();
    await app.resetBook(BOOK, {
      hist: SALES, sold: 8, revenue: 320, stock: 92,
      artistPayouts: [PRIOR_PAYOUT], artistReceivables: [DEBT],
      payoutRequests: [{ id: 'r1', requestedAt: '2026-03-01T00:00:00Z', amount: 80, currency: 'CA$', paidAtRequest: 30 }],
    });
    win.renderProfitSharingBreakdown(BOOK);
    win.toggleArtistPayoutForm(BOOK);
    type('ap-amount', '50');
    await win.saveArtistPayout(BOOK);
    expect(app.main.states[BOOK].payoutRequests[0].settled).toBe(true);
  });

  it('editing a netted payout keeps what it netted', async () => {
    await withDebt();
    type('ap-amount', '50');
    await win.saveArtistPayout(BOOK);
    const id = payouts().at(-1).id;
    await win.editArtistPayout(BOOK, id);
    expect(el('ap-net')).toBeNull(); // debt already cleared, nothing left to offer
    type('ap-amount', '55');
    await win.saveArtistPayout(BOOK);
    expect(payouts().at(-1).offsets).toEqual([{ id: 'd-1', amount: 30 }]);
    expect(payouts().at(-1).amount).toBe(55);
  });
});
