// Undo from the Payments list's Done section: a recorded Stripe sale is
// voided for real and its payment comes back to the list, to be recorded
// against the right book, and never again by the background check.
import { describe, expect, it, vi } from 'vitest';
import { buildHarness } from './helpers/extract-decl.js';

const rowsFor = (...ids) => ids.map(([sheetsId, voided]) => ({ sheetsId, voided, qty: 1, price: 20 }));

function ids(states) {
  return buildHarness({
    names: ['_reconChargeOfRow', '_reconRecordedChargeIds', '_reconLiveChargeIds', '_reconIsReopened', '_reconAlreadyRecorded', '_reconSaleKey'],
    deps: { states, getReconMemory: () => ({ recorded: {}, dismissed: {}, reopened: {} }) },
    returns: '{ _reconChargeOfRow, _reconRecordedChargeIds, _reconLiveChargeIds, _reconIsReopened, _reconAlreadyRecorded, _reconSaleKey }',
  });
}

describe('which charges count as recorded', () => {
  it('reads the charge from a split row and from a row recorded again after an Undo', () => {
    const api = ids({});
    expect(api._reconChargeOfRow({ sheetsId: 'stripe-ch_1' })).toBe('ch_1');
    expect(api._reconChargeOfRow({ sheetsId: 'stripe-ch_1-2' })).toBe('ch_1');
    expect(api._reconChargeOfRow({ sheetsId: 'stripe-ch_1-r1' })).toBe('ch_1');
    expect(api._reconChargeOfRow({ sheetsId: 'abc' })).toBe('');
  });

  it('keeps a voided sale in the recorded set, so the background check never records it again', () => {
    const api = ids({ b1: { hist: rowsFor(['stripe-ch_1', true], ['stripe-ch_2', false]) } });
    expect([...api._reconRecordedChargeIds()]).toEqual(['ch_1', 'ch_2']);
    expect([...api._reconLiveChargeIds()]).toEqual(['ch_2']);
  });

  it('lets an undone payment be recorded by hand, under a new key, until a live sale exists again', () => {
    const states = { b1: { hist: rowsFor(['stripe-ch_1', true]) } };
    const api = ids(states);
    const mem = { recorded: {}, dismissed: {}, reopened: { ch_1: true } };
    expect(api._reconIsReopened('ch_1', mem)).toBe(true);
    expect(api._reconAlreadyRecorded('ch_1', mem)).toBe(false);
    expect(api._reconSaleKey('ch_1')).toBe('ch_1-r1');
    // Recorded again: it counts as recorded, whatever the memory still says.
    states.b1.hist.push({ sheetsId: 'stripe-ch_1-r1', voided: false });
    expect(api._reconIsReopened('ch_1', mem)).toBe(false);
    expect(api._reconAlreadyRecorded('ch_1', mem)).toBe(true);
  });

  it('refuses to record a refunded-and-voided sale that was never undone from the list', () => {
    const api = ids({ b1: { hist: rowsFor(['stripe-ch_1', true]) } });
    expect(api._reconAlreadyRecorded('ch_1', { recorded: {}, dismissed: {}, reopened: {} })).toBe(true);
  });
});

describe('Undo in Done', () => {
  function undo({ mem, hist, confirm = true }) {
    const states = { b1: { hist } };
    const deps = {
      states, BOOKS: { b1: { title: 'Meadow Hymns' } },
      _reconFindPayment: () => ({ id: 'ch_1', amount: 20, currency: 'CAD' }),
      getReconMemory: () => mem, saveReconMemory: vi.fn(), _reconSession: { dismissed: 1 },
      renderReconcile: vi.fn(), showToast: vi.fn(), confirmDialog: vi.fn(async () => confirm),
      _stripeFmtMoney: (a, c) => `${c} ${a}`,
      voidHistEntry: vi.fn((s, book, h) => { h.voided = true; }), saveState: vi.fn(),
      activeBook: 'other', renderAll: vi.fn(), updateDash: vi.fn(), window: {},
    };
    const api = buildHarness({ names: ['reconcileUndo', '_reconChargeOfRow'], deps, returns: '{ reconcileUndo }' });
    return { ...api, deps, states };
  }

  it('brings a payment set aside straight back, with no question', async () => {
    const mem = { recorded: {}, dismissed: { ch_1: true }, reopened: {} };
    const u = undo({ mem, hist: [] });
    await u.reconcileUndo('ch_1');
    expect(mem.dismissed.ch_1).toBeUndefined();
    expect(u.deps.confirmDialog).not.toHaveBeenCalled();
  });

  it('voids every live row of a recorded sale and puts the payment back in the list', async () => {
    const mem = { recorded: { ch_1: { bookId: 'b1' } }, dismissed: {}, reopened: {} };
    const hist = [{ sheetsId: 'stripe-ch_1', qty: 1 }, { sheetsId: 'stripe-ch_1-2', qty: 2 }, { sheetsId: 'stripe-ch_9', qty: 1 }];
    const u = undo({ mem, hist });
    await u.reconcileUndo('ch_1');
    expect(u.deps.voidHistEntry).toHaveBeenCalledTimes(2);
    expect(hist.map(h => !!h.voided)).toEqual([true, true, false]);
    expect(u.deps.saveState).toHaveBeenCalledWith('b1');
    expect(mem.recorded.ch_1).toBeUndefined();
    expect(mem.reopened.ch_1).toBe(true);
  });

  it('changes nothing when she cancels', async () => {
    const mem = { recorded: { ch_1: { bookId: 'b1' } }, dismissed: {}, reopened: {} };
    const hist = [{ sheetsId: 'stripe-ch_1', qty: 1 }];
    const u = undo({ mem, hist, confirm: false });
    await u.reconcileUndo('ch_1');
    expect(u.deps.voidHistEntry).not.toHaveBeenCalled();
    expect(mem.recorded.ch_1).toBeTruthy();
    expect(mem.reopened.ch_1).toBeUndefined();
  });

  it('leaves a sale already settled with the author alone', async () => {
    const mem = { recorded: { ch_1: { bookId: 'b1' } }, dismissed: {}, reopened: {} };
    const u = undo({ mem, hist: [{ sheetsId: 'stripe-ch_1', qty: 1, artistSettlementId: 's1' }] });
    await u.reconcileUndo('ch_1');
    expect(u.deps.confirmDialog).not.toHaveBeenCalled();
    expect(u.deps.voidHistEntry).not.toHaveBeenCalled();
  });
});
