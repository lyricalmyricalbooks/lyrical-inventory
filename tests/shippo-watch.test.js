import { describe, expect, it } from 'vitest';
import {
  describeImportedLabels,
  dueForShippoCheck,
  isImportableTransaction,
  newShippoTransactions,
  shippoExpenseRef,
} from '../src/lib/shippo-watch.js';
import {
  autoLinkConfidentShippingMatches,
  reconcileShippingExpense,
} from '../src/lib/shipping-reconciliation.js';

const tx = (id, status = 'SUCCESS') => ({ object_id: id, status });

describe('which Shippo labels are worth importing', () => {
  it('turns a transaction id into the one dedupe key the ledger uses', () => {
    expect(shippoExpenseRef('abc123')).toBe('shippo:abc123');
    expect(shippoExpenseRef('')).toBe('');
    expect(shippoExpenseRef(null)).toBe('');
  });

  it('skips labels that were never paid for', () => {
    expect(isImportableTransaction(tx('a', 'REFUNDED'))).toBe(false);
    expect(isImportableTransaction(tx('a', 'ERROR'))).toBe(false);
    expect(isImportableTransaction(tx('a', 'INVALID'))).toBe(false);
    expect(isImportableTransaction(tx('a', 'SUCCESS'))).toBe(true);
  });

  it('skips a transaction with no id, which nothing could dedupe', () => {
    expect(isImportableTransaction({ status: 'SUCCESS' })).toBe(false);
  });

  it('returns only the rows the ledger has never seen', () => {
    const fresh = newShippoTransactions([tx('a'), tx('b'), tx('c')], ['shippo:a', 'shippo:c']);
    expect(fresh.map(t => t.object_id)).toEqual(['b']);
  });

  it('finds nothing when the whole page is already in the ledger', () => {
    // This is the steady state, and the reason a check costs one request.
    expect(newShippoTransactions([tx('a'), tx('b')], ['shippo:a', 'shippo:b'])).toEqual([]);
  });

  it('does not return the same transaction twice', () => {
    expect(newShippoTransactions([tx('a'), tx('a')], [])).toHaveLength(1);
  });

  it('survives junk rather than throwing at the publisher', () => {
    expect(newShippoTransactions(null, null)).toEqual([]);
    expect(newShippoTransactions([null, undefined], [])).toEqual([]);
  });
});

describe('when to ask Shippo again', () => {
  const base = {
    lastCheckedAt: 0, now: 60_000, intervalMs: 30_000,
    online: true, configured: true, visible: true, busy: false,
  };

  it('asks once the last answer has gone stale', () => {
    expect(dueForShippoCheck(base)).toBe(true);
  });

  it('leaves a fresh answer alone', () => {
    expect(dueForShippoCheck({ ...base, lastCheckedAt: 45_000 })).toBe(false);
  });

  it('does not spend mobile data while nobody is looking', () => {
    expect(dueForShippoCheck({ ...base, visible: false })).toBe(false);
  });

  it('does not try while offline, unconfigured, or already running', () => {
    expect(dueForShippoCheck({ ...base, online: false })).toBe(false);
    expect(dueForShippoCheck({ ...base, configured: false })).toBe(false);
    expect(dueForShippoCheck({ ...base, busy: true })).toBe(false);
  });

  it('never fires without an interval', () => {
    expect(dueForShippoCheck({ ...base, intervalMs: 0 })).toBe(false);
    expect(dueForShippoCheck()).toBe(false);
  });
});

describe('what the summary says', () => {
  it('reports a single label matched on its own', () => {
    expect(describeImportedLabels({ imported: 1, linked: 1, needsReview: 0 })).toMatchObject({
      count: 1,
      title: '1 label imported',
      detail: 'Bought outside the app — matched to its order.',
    });
  });

  it('splits what was handled from what still needs a person', () => {
    const said = describeImportedLabels({ imported: 3, linked: 2, needsReview: 1 });
    expect(said.title).toBe('3 labels imported');
    expect(said.detail).toBe('Bought outside the app — 2 matched to their orders, 1 needs you.');
    expect(said.needsReview).toBe(1);
  });

  it('says so plainly when every label matched', () => {
    expect(describeImportedLabels({ imported: 2, linked: 2 }).detail)
      .toBe('Bought outside the app — all matched to their orders.');
  });

  it('does not claim a match when none was made', () => {
    expect(describeImportedLabels({ imported: 2, linked: 0, needsReview: 2 }).detail)
      .toBe('Bought outside the app — 2 need you.');
  });

  it('says nothing when nothing was imported', () => {
    expect(describeImportedLabels({ imported: 0 }).count).toBe(0);
    expect(describeImportedLabels().title).toBe('');
  });
});

describe('which matches are exact enough to link unasked', () => {
  const orders = [
    { num: '#AAAA-1', date: '2026-09-01', shipEmail: 'dana@example.com', shipName: 'Dana Okafor', shipPostal: 'H2X 1Y4' },
    { num: '#BBBB-2', date: '2026-09-01', shipEmail: 'sam@example.com', shipName: 'Sam Reyes', shipPostal: '60616' },
  ];
  const reconcile = (recipient) => reconcileShippingExpense({ ...recipient, date: '2026-09-02' }, orders);

  it('grades an exact email match as the strongest tier', () => {
    const result = reconcile({ recipientEmail: 'dana@example.com' });
    expect(result).toMatchObject({
      shippingSuggestedOrderNumber: '#AAAA-1',
      shippingMatchTier: 'email',
      shippingMatchStatus: 'suggested',
    });
  });

  it('grades an exact name and postal together as strong', () => {
    expect(reconcile({ recipientName: 'Dana Okafor', recipientPostal: 'h2x1y4' }))
      .toMatchObject({ shippingMatchTier: 'name-postal', shippingSuggestedOrderNumber: '#AAAA-1' });
  });

  it('grades a near-miss surname as a guess, not a fact', () => {
    expect(reconcile({ recipientName: 'Dana Okafur' }))
      .toMatchObject({ shippingMatchTier: 'fuzzy', shippingMatchStatus: 'suggested' });
  });

  const expense = (ref, patch) => ({ ref, ...patch });

  it('links the exact tiers on its own', () => {
    const links = autoLinkConfidentShippingMatches([
      expense('shippo:a', reconcile({ recipientEmail: 'dana@example.com' })),
      expense('shippo:b', reconcile({ recipientName: 'Sam Reyes', recipientPostal: '60616' })),
    ], orders);
    expect(links.map(l => [l.expense.ref, l.orderNumber]))
      .toEqual([['shippo:a', '#AAAA-1'], ['shippo:b', '#BBBB-2']]);
  });

  it('leaves a fuzzy guess for the publisher', () => {
    const links = autoLinkConfidentShippingMatches(
      [expense('shippo:a', reconcile({ recipientName: 'Dana Okafur' }))], orders);
    expect(links).toEqual([]);
  });

  it('links neither label when two of them claim the same order', () => {
    // One of the two is wrong and there is no way to tell which, so guessing
    // costs a real parcel being charged against the wrong sale.
    const both = reconcile({ recipientEmail: 'dana@example.com' });
    const links = autoLinkConfidentShippingMatches([
      expense('shippo:a', both),
      expense('shippo:b', { ...both }),
    ], orders);
    expect(links).toEqual([]);
  });

  it('still links the uncontested label beside a contested pair', () => {
    const dana = reconcile({ recipientEmail: 'dana@example.com' });
    const links = autoLinkConfidentShippingMatches([
      expense('shippo:a', dana),
      expense('shippo:b', { ...dana }),
      expense('shippo:c', reconcile({ recipientEmail: 'sam@example.com' })),
    ], orders);
    expect(links.map(l => l.expense.ref)).toEqual(['shippo:c']);
  });

  it('ignores anything not awaiting a decision', () => {
    const suggested = reconcile({ recipientEmail: 'dana@example.com' });
    expect(autoLinkConfidentShippingMatches([
      expense('shippo:a', { ...suggested, shippingMatchStatus: 'matched' }),
      expense('shippo:b', { ...suggested, shippingMatchStatus: 'dismissed' }),
      expense('shippo:c', { ...suggested, shippingMatchStatus: 'ambiguous' }),
    ], orders)).toEqual([]);
  });

  it('refuses to link to an order that has left the ledger', () => {
    // A renumbered or voided order can leave a stale suggestion pointing at
    // nothing; that is not a reason to act on it.
    const stale = reconcile({ recipientEmail: 'dana@example.com' });
    expect(autoLinkConfidentShippingMatches([expense('shippo:a', stale)], [orders[1]])).toEqual([]);
  });

  it('survives junk rather than throwing at the publisher', () => {
    expect(autoLinkConfidentShippingMatches(null, null)).toEqual([]);
    expect(autoLinkConfidentShippingMatches([null], orders)).toEqual([]);
  });
});
