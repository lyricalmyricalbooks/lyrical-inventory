// A card payment picked up from Stripe has to land in the ledger the same way a
// sale typed into the order form does: same stock effect, same running Stock
// After, same invoice-discount note, same Google Sheet row. Both now go through
// writeOrderToLedger; these tests hold that line.
import { describe, expect, it, vi } from 'vitest';
import { buildHarness } from './helpers/extract-decl.js';
import { noteAuthorTaken, takeSaleStock } from '../src/lib/inventory.js';
import { channelStats } from '../src/lib/channel-mix.js';

function harness({ currency = 'CAD', invoices = [] } = {}) {
  const BOOKS = { b1: { id: 'b1', title: 'Night Garden', currency, listPrice: 20 } };
  const states = { b1: { stock: 10, sold: 0, revenue: 0, chStats: {}, hist: [], invoices } };
  const deps = {
    BOOKS,
    states,
    activeBook: 'b1',
    isAuthor: () => false,
    deductSaleFromStockBreakdown: vi.fn(),
    takeSaleStock,
    channelStats,
    noteAuthorTaken,
    notesWithInvoiceDiscount: vi.fn((_inv, num, notes) => (num === 'INV-1' ? `${notes} · invoice discount` : notes)),
    makeEventId: () => 'evt-1',
    today: () => '2026-10-05',
    bookCurrencyCode: (b) => b.currency,
    getBookCurrencyCode: (b) => b.currency,
    normalizeCurrencyCode: (c, fb) => (c ? String(c).toUpperCase() : fb),
    cadEquivalentForSale: ({ nativeCurrency, totalNative, payment }) => {
      if (nativeCurrency === 'CAD') return totalNative;
      if (payment?.currency === 'CAD') return payment.amount;
      return '';
    },
    recomputeAfters: vi.fn(),
    invalidateAppliedIds: vi.fn(),
    saveState: vi.fn(),
    syncToSheets: vi.fn(),
    renderHist: vi.fn(),
    updateDash: vi.fn(),
  };
  const api = buildHarness({
    names: ['recordOrder', 'writeOrderToLedger', 'addSaleToState', '_reconApplySaleToBook'],
    deps,
    returns: '{ recordOrder, _reconApplySaleToBook }',
  });
  return { ...api, ...deps };
}

const stripePayment = (over = {}) => ({ currency: 'CAD', amount: 40, rate: null, convertedTotal: 40, ref: 'ch_1', ...over });

describe('a Stripe sale enters the ledger the way a manual sale does', () => {
  it('writes the same row shape, apart from where the money came from', () => {
    const manual = harness();
    manual.recordOrder('', 'Website', 2, 20, 'Stripe', stripePayment());
    const card = harness();
    card._reconApplySaleToBook('b1', 2, 20, stripePayment(), 'ch_1', 'Stripe', { date: '2026-10-05', chan: 'Website' });

    const [m] = manual.states.b1.hist;
    const [c] = card.states.b1.hist;
    const { sheetsId: mId, recordedAt: mTime, ...mRest } = m;
    const { sheetsId: cId, shipEmail, recordedAt: cTime, ...cRest } = c;
    expect(Number.isFinite(Date.parse(mTime))).toBe(true);
    expect(Number.isFinite(Date.parse(cTime))).toBe(true);
    expect(cRest).toEqual(mRest);
    expect(mId).toBe('evt-1');
    expect(cId).toBe('stripe-ch_1');
    expect(shipEmail).toBe('');
    expect(card.states.b1).toMatchObject({ stock: 8, sold: 2, revenue: 40 });
  });

  it('recomputes the running Stock After, as a manual sale does', () => {
    const card = harness();
    card._reconApplySaleToBook('b1', 1, 20, stripePayment({ amount: 20, convertedTotal: 20 }), 'ch_2', 'Stripe', { date: '2026-09-01' });
    expect(card.recomputeAfters).toHaveBeenCalledWith(card.states.b1, card.BOOKS.b1);
    expect(card.saveState).toHaveBeenCalledWith('b1');
    expect(card.states.b1.hist[0].date).toBe('2026-09-01');
  });

  it('adds the invoice-discount note when the order number names an invoice', () => {
    const card = harness();
    card._reconApplySaleToBook('b1', 1, 20, stripePayment({ amount: 20 }), 'ch_3', 'Stripe', { num: 'INV-1' });
    expect(card.states.b1.hist[0].notes).toBe('Stripe · invoice discount');
  });

  it('sends the Google Sheet the CAD value the manual path sends, not the book-currency total', () => {
    const card = harness({ currency: 'USD' });
    card._reconApplySaleToBook('b1', 1, 20, stripePayment({ currency: 'USD', amount: 20, convertedTotal: 20 }), 'ch_4', 'Stripe', { date: '2026-10-01' });
    expect(card.syncToSheets).toHaveBeenCalledWith(expect.objectContaining({
      type: 'order', sheetsId: 'stripe-ch_4', date: '2026-10-01', currency: 'USD', convertedTotal: '',
    }));
  });

  it('keeps marking a sale the app recorded on its own', () => {
    const card = harness();
    card._reconApplySaleToBook('b1', 1, 20, stripePayment({ amount: 20 }), 'ch_5', 'Card reader', { chan: 'Book Fair', auto: true, email: 'a@b.c' });
    expect(card.states.b1.hist[0]).toMatchObject({ autoRecorded: true, shipEmail: 'a@b.c', chan: 'Book Fair', enteredBy: 'Publisher' });
  });

  it('refuses a book it does not know rather than writing half a sale', () => {
    const card = harness();
    expect(() => card._reconApplySaleToBook('nope', 1, 20, stripePayment(), 'ch_6', 'Stripe')).toThrow('Unknown book');
    expect(card.syncToSheets).not.toHaveBeenCalled();
  });
});

describe('a backdated sale tells the Google Sheet its own running stock', () => {
  it('sends the row\'s recomputed Stock After, not today\'s on-hand', () => {
    const h = harness();
    // Pretend the timeline puts this older sale before others: its running
    // balance is 15, while today's on-hand is still 8.
    h.recomputeAfters.mockImplementation((s) => { s.hist[0].after = 15; });
    h._reconApplySaleToBook('b1', 2, 20, stripePayment(), 'ch_old', 'Stripe', { date: '2026-09-01', chan: 'Website' });
    expect(h.states.b1.stock).toBe(8);
    expect(h.syncToSheets.mock.calls[0][0].stockAfter).toBe(15);
  });
});

describe('the worklist Record button cannot record a charge twice', () => {
  it('refuses a charge already in history and repaints the list', () => {
    const p = { id: 'ch_9', amount: 20, currency: 'CAD', date: '2026-10-05' };
    const deps = {
      _reconFindPayment: () => p,
      _reconRecordedChargeIds: () => new Set(['ch_9']),
      _reconApplyPaymentToBook: vi.fn(),
      showToast: vi.fn(),
      renderReconcile: vi.fn(),
      BOOKS: { b1: {} },
      document: { getElementById: () => ({ value: 'b1' }) },
    };
    const { reconcileRecordSale } = buildHarness({ names: ['reconcileRecordSale'], deps, returns: '{ reconcileRecordSale }' });
    reconcileRecordSale('ch_9');
    expect(deps._reconApplyPaymentToBook).not.toHaveBeenCalled();
    expect(deps.renderReconcile).toHaveBeenCalled();
  });
});

describe('finding the "artist kept all" payout for a sale', () => {
  const { findKeptAllPayout } = buildHarness({ names: ['findKeptAllPayout'], deps: {}, returns: '{ findKeptAllPayout }' });
  const kept = (over) => ({ method: 'Kept from direct sale (full)', amount: 10, ...over });

  it('never picks sale #12 for sale #1', () => {
    const s = { artistPayouts: [kept({ sourceNum: '12', notes: '12 — artist retained full gross' }), kept({ sourceNum: '1', notes: '1 — artist retained full gross' })] };
    expect(findKeptAllPayout(s, '1')).toBe(1);
    expect(findKeptAllPayout(s, '12')).toBe(0);
  });

  it('reads an older payout by the start of its note', () => {
    const s = { artistPayouts: [kept({ notes: '12 — artist retained full gross' }), kept({ notes: '1 — artist retained full gross' })] };
    expect(findKeptAllPayout(s, '1')).toBe(1);
    expect(findKeptAllPayout(s, '3')).toBe(-1);
  });
});

describe('an invoice paid off from the ledger', () => {
  it('turns off its Stripe pay link so the store cannot pay twice', () => {
    const deactivateStripePaymentLink = vi.fn();
    const s = { invoices: [{ id: 'i1', status: 'sent', stripe: { paymentLinkId: 'plink_1' }, items: [{ _ledgerId: 'L1' }] }], ledger: [{ id: 'L1', status: 'paid' }] };
    const { maybeAutoPayInvoiceForLedger } = buildHarness({
      names: ['maybeAutoPayInvoiceForLedger'],
      deps: { deactivateStripePaymentLink, ledgerById: (st) => new Map(st.ledger.map(e => [e.id, e])) },
      returns: '{ maybeAutoPayInvoiceForLedger }',
    });
    maybeAutoPayInvoiceForLedger(s, { invoiceId: 'i1' });
    expect(s.invoices[0].status).toBe('paid');
    expect(deactivateStripePaymentLink).toHaveBeenCalledWith('plink_1');
  });
});
