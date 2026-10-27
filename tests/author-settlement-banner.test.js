// The author's "Money to send to your publisher" card when money runs both
// ways, and the Stripe payment that settles it. Driven through the real app.
//
// Figures from the owner's screenshot: the author holds CA$574.68 from 9
// copies, keeps their CA$74.71 share, and is owed CA$267.76 → sends CA$232.21.
import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import { loadApp, makeBook } from './helpers/load-app.js';

const BOOK = 'harbour';
const book = makeBook({ id: BOOK, title: 'Harbour', currency: 'CA$', profitTiers: [{ label: 'All', revenueUpTo: null, artistPct: 13 }] });
const SOLD = 542.47 / 0.13;

let app, win;
const $ = id => document.getElementById(id);
const asAuthor = () => win.sessionStorage.setItem('lm-unlocked', `author:${BOOK}`);
const payment = (over = {}) => ({
  id: 'ch_settle', amount: 232.21, currency: 'CAD', date: '2026-10-08', created: Date.now(),
  metadata: { kind: 'artist_transfer', settlement: '1', settlement_amount: '232.21', transfer_book: BOOK }, ...over,
});

beforeAll(async () => {
  app = await loadApp({ books: [book] });
  win = app.window;
  win.switchBook(BOOK);
}, 30000);

beforeEach(async () => {
  await app.resetBook(BOOK, {
    hist: [
      { num: 'held', qty: 9, price: 574.68 / 9, date: '2026-10-08', chan: 'Fair', artistPending: true, directToArtist: true },
      { num: 'paid', qty: 1, price: SOLD, date: '2025-12-01', chan: 'Shop' },
    ],
    revenue: SOLD,
    artistTransfers: [{ id: 11, num: 'held', qty: 9, price: 574.68 / 9, total: 574.68, date: '2026-10-08', chan: 'Fair',
      payUrl: 'https://buy.stripe.com/old-full-amount', payAmount: 574.68, payLinkV: 2 }],
    artistPayouts: [{ id: 'p1', amount: 274.71, date: '2026-02-01' }],
  });
});

afterEach(() => { win.sessionStorage.removeItem('lm-unlocked'); });

// The author's side lives on the money card at the top of the dashboard; the
// "Money to send to your publisher" banner steps aside for it.
const card = () => document.getElementById(`artist-settlement-${BOOK}`);
const cardPay = () => card()?.querySelector('.ps-receipt-actions a.btn');
const cardNotice = () => card()?.querySelector('.ps-ledger-notice')?.textContent || '';
function showAuthor() {
  asAuthor();
  app.main.renderArtistTransfers();
  win.renderProfitSharingBreakdown(BOOK);
}

describe("the author's card", () => {
  it('asks for the one net payment, not the full sale amounts', () => {
    app.main.states[BOOK].settlementLink = { url: 'https://buy.stripe.com/net', amount: 232.21, key: 'settle-23221', v: 2 };
    showAuthor();
    expect($('author-payment-banner').style.display).toBe('none');
    expect(card().querySelector('.ps-settle-result .ps-stat-val').textContent).toBe('CA$232.21');
    expect(card().textContent).toContain('keep your CA$74.71 share');
    expect(card().textContent).toContain('CA$267.76');
    expect(cardPay().getAttribute('href')).toBe('https://buy.stripe.com/net');
    expect(cardPay().textContent).toBe('Pay CA$232.21 →');
    // The old full-amount sale link is no longer offered anywhere.
    expect(card().innerHTML).not.toContain('old-full-amount');
  });

  it('says the link is on its way rather than offering a wrong amount', () => {
    showAuthor();
    expect(card().querySelector('.ps-settle-result .ps-stat-val').textContent).toBe('CA$232.21');
    expect(cardNotice()).toMatch(/link is on its way/);
    expect(cardPay()).toBeNull();
  });

  it('ignores a link made for a different amount', () => {
    app.main.states[BOOK].settlementLink = { url: 'https://buy.stripe.com/stale', amount: 200, key: 'settle-20000', v: 2 };
    showAuthor();
    expect(cardPay()).toBeNull();
  });

  it('has nothing to send when the publisher owes more', () => {
    app.main.states[BOOK].artistPayouts = [];
    showAuthor();
    expect(card().querySelector('.ps-settle-result .ps-stat-label').textContent).toBe('The publisher sends you');
    expect(card().querySelector('.ps-settle-result .ps-stat-val').textContent).toBe('CA$42.50');
    expect(cardPay()).toBeNull();
    // No payment link saved yet: the card asks for one, and offers the payout request.
    expect(card().querySelector('[data-action="moneyCard.setUpPayLink"]')).not.toBeNull();
    expect(card().querySelector('[data-action="moneyCard.requestPayout"]').dataset.book).toBe(BOOK);
  });

  it('brings the banner back for a sale still waiting on the publisher', () => {
    win.authorSubmissions[BOOK] = { sales: { s1: { data: JSON.stringify({ num: 'ART-1', chan: 'Direct', qty: 1, price: 24, date: '2026-10-09', directToArtist: true }) } } };
    try {
      showAuthor();
      expect($('author-payment-banner').style.display).toBe('');
      expect($('apb-transfers').textContent).toContain('Waiting for your publisher');
    } finally {
      delete win.authorSubmissions[BOOK];
    }
  });
});

describe('the author paying the net link', () => {
  it('records the settlement once, clears both sides, and thanks the author', async () => {
    const r = app.main.settleArtistTransfersFromStripe(payment());
    expect(r).toMatchObject({ settled: 1, total: 232.21, settlement: true });
    const s = app.main.states[BOOK];
    const record = s.artistPayouts.at(-1);
    expect(record).toMatchObject({ chargeId: 'ch_settle', date: '2026-10-08', method: 'Stripe' });
    expect(record.settlement.balance).toMatchObject({ amount: 232.21, direction: 'to-publisher' });
    expect(s.artistTransfers).toEqual([]);
    expect(s.hist[0].artistPending).toBe(false);
    expect(win.calculateArtistEarnings(BOOK)).toMatchObject({ owedToArtist: 0, heldByArtistGross: 0 });
    expect(s.transferReceipts[0]).toMatchObject({ amount: 232.21, chargeId: 'ch_settle' });
    // The sweep sees the same charge again five minutes later: nothing happens.
    const before = JSON.stringify(s);
    expect(app.main.settleArtistTransfersFromStripe(payment())).toBeNull();
    expect(JSON.stringify(s)).toBe(before);
  });

  it('records nothing when the figures changed after the link was made', () => {
    const s = app.main.states[BOOK];
    s.artistPayouts.push({ id: 'p2', amount: 10, date: '2026-10-07' });
    const before = JSON.stringify(s);
    expect(app.main.settleArtistTransfersFromStripe(payment())).toMatchObject({ settled: 0, problem: 'changed' });
    expect(JSON.stringify(s)).toBe(before);
  });

  it('records nothing for a short payment or a different currency', () => {
    const before = JSON.stringify(app.main.states[BOOK]);
    expect(app.main.settleArtistTransfersFromStripe(payment({ amount: 200 }))).toMatchObject({ problem: 'short' });
    expect(app.main.settleArtistTransfersFromStripe(payment({ currency: 'USD' }))).toMatchObject({ problem: 'currency' });
    expect(JSON.stringify(app.main.states[BOOK])).toBe(before);
  });
});

describe("the publisher's awaiting-transfer card", () => {
  it('is not listed twice: the sale sits in the Settle up ledger, with no full-price Stripe link', () => {
    app.main.renderArtistTransfers();
    expect($('artist-transfers-sect').style.display).toBe('none');
    const list = $('artist-transfers-list');
    expect(list.textContent).not.toContain('Stripe link ready');
    expect(list.textContent).not.toContain('Make Stripe link');
  });
});

describe('new sales coming in', () => {
  const panelNet = () => document.querySelector('#artist-settlement-harbour .ps-settle-result .ps-stat-val')?.textContent;
  async function sellAtRegister(qty) {
    win.posSetCurrency('CAD');
    win.posUpdateQty(BOOK, qty);
    document.getElementById('pos-payment-method').value = 'Cash';
    win.posCheckout();
    await win.posConfirmSale();
    await app.settle();
  }

  it('updates the Settle up figures, the headline and the author card straight away', async () => {
    win.renderProfitSharingBreakdown(BOOK);
    expect(panelNet()).toBe('CA$232.21');
    // Two copies at CA$40: the author earns 13% of CA$80 = CA$10.40 more, so
    // the publisher owes CA$278.16 and the author sends CA$499.97 − 278.16.
    await sellAtRegister(2);
    expect(win.calculateArtistEarnings(BOOK).owedToArtist).toBe(278.16);
    expect(panelNet()).toBe('CA$221.81');
    // The author's card follows, and the old link for CA$232.21 is not offered.
    app.main.states[BOOK].settlementLink = { url: 'https://buy.stripe.com/old', amount: 232.21, key: 'settle-23221', v: 2 };
    showAuthor();
    expect(panelNet()).toBe('CA$221.81');
    expect(cardPay()).toBeNull();
  });

  it('settles correctly when the author pays the older amount after a new sale', async () => {
    await sellAtRegister(2);
    // They paid CA$232.21 from the link they had open; CA$221.81 is due now.
    const r = app.main.settleArtistTransfersFromStripe(payment({ amount: 232.21 }));
    expect(r).toMatchObject({ settlement: true, carried: 10.4 });
    const s = app.main.states[BOOK];
    expect(s.artistTransfers).toEqual([]);
    expect(s.hist.find(h => h.num === 'held').artistPending).toBe(false);
    // Their held cut is fully cleared; the CA$10.40 from the new sale is still
    // owed to them, exactly as if they'd been paid everything else.
    expect(win.calculateArtistEarnings(BOOK)).toMatchObject({ owedToArtist: 10.4, heldByArtistGross: 0, owedByArtist: 0 });
    expect(s.artistPayouts.at(-1).settlement.statement).toContain('still owed to you and paid separately: CA$10.40');
  });

  it("doesn't let the author pay twice when the amount changes after they paid", async () => {
    // Stripe brought them back after paying CA$232.21 …
    win.localStorage.setItem('lm-author-paid-v2', JSON.stringify({ 'settle-23221': Date.now() }));
    try {
      // … then a sale lowered the amount before the publisher's app recorded it.
      await sellAtRegister(2);
      app.main.states[BOOK].settlementLink = { url: 'https://buy.stripe.com/new', amount: 221.81, key: 'settle-22181', v: 2 };
      showAuthor();
      expect(cardNotice()).toMatch(/Paid — thank you/);
      expect(cardPay()).toBeNull();
    } finally {
      win.localStorage.removeItem('lm-author-paid-v2');
    }
  });
});

describe('the settlement in the payouts list', () => {
  it('shows the earnings it paid the artist, so the rows add up to the total', () => {
    app.main.settleArtistTransfersFromStripe(payment());
    win.renderProfitSharingBreakdown(BOOK);
    const list = document.querySelector('#ps-dash-content .ps-payout-section');
    expect(list.textContent).toContain('Earnings paid by settlement');
    // 74.71 kept + 267.76 offset = 342.47 paid to the artist by this settlement.
    expect(list.textContent).toContain('CA$342.47');
    expect(list.textContent).toContain('They kept CA$74.71 of the sales money they collected, CA$267.76 came off what they owed you.');
    expect(list.textContent).toContain('They sent you CA$232.21.');
    // 274.71 + 342.47 = the 617.18 they earned: nothing left owed either way.
    expect(list.querySelector('.ps-payout-total-val').textContent).toBe('CA$617.18');
    expect(win.calculateArtistEarnings(BOOK)).toMatchObject({ totalArtistEarned: 617.18, owedToArtist: 0 });
  });
});

describe('the money card when money runs both ways', () => {
  it('leads with the net balance, and folds the lifetime figures and tiers under it', () => {
    win.renderProfitSharingBreakdown(BOOK);
    const block = $('d-profit-sharing-block');
    expect(block.classList.contains('is-money-card')).toBe(true);
    // It sits at the top of the dashboard, ahead of the banners and the metrics.
    expect(block.nextElementSibling.id).toBe('author-payment-banner');
    // One figure leads; the old headline boxes are gone.
    expect(document.querySelector('#ps-dash-content .ps-stat-grid')).toBeNull();
    expect(document.querySelector('#ps-dash-content .ps-settle-result .ps-stat-val').textContent).toBe('CA$232.21');
    expect(document.querySelector('#ps-dash-content .ps-money-totals').textContent).toBe('Earned so far CA$617.18 · paid CA$274.71 · held by the artist CA$574.68');
    const folds = [...document.querySelectorAll('#ps-dash-content .ps-money-more > summary')].map(x => x.textContent.replace(/\s+/g, ' ').trim());
    expect(folds).toEqual(['How the artist is paid ▾', 'Payments to the artist (1) ▾']);
    // Recording a payout unfolds the payments it lives in.
    win.toggleArtistPayoutForm(BOOK);
    expect(document.getElementById(`ps-payments-${BOOK}`).open).toBe(true);
  });

  it('goes back below the metrics, with its boxes, once money runs one way', () => {
    app.main.states[BOOK].artistTransfers = [];
    app.main.states[BOOK].hist[0].artistPending = false;
    win.renderProfitSharingBreakdown(BOOK);
    const block = $('d-profit-sharing-block');
    expect(block.classList.contains('is-money-card')).toBe(false);
    expect(block.nextElementSibling.id).toBe('artist-transfers-sect');
    expect(document.querySelector('#ps-dash-content .ps-stat-grid')).not.toBeNull();
  });
});
