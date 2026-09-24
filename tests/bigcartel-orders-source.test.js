import { describe, it, expect } from 'vitest';
import { extractDecl } from './helpers/extract-decl.js';

// Every order lookup (address copy, one-touch shipping, the Shipping tab's
// destination pickers) reads orders through one helper: the live list once the
// Big Cartel tab has fetched it, else the copy saved from the last fetch.
function harness(bigCartelData, saved) {
  const localStorage = {
    getItem: () => (saved === undefined ? null : JSON.stringify(saved)),
  };
  const body = `
    ${extractDecl('loadCachedBigCartelOrders')}
    ${extractDecl('getBigCartelOrders')}
    return getBigCartelOrders;
  `;
  return new Function('localStorage', 'bigCartelData', body)(localStorage, bigCartelData);
}

describe('getBigCartelOrders', () => {
  it('prefers the live orders once they have been fetched', () => {
    const live = [{ id: 'LIVE-1' }];
    expect(harness({ orders: live }, { orders: [{ id: 'SAVED-1' }] })()).toBe(live);
  });

  it('falls back to the saved copy when nothing has been fetched yet', () => {
    expect(harness({ orders: [] }, { orders: [{ id: 'SAVED-1' }] })()).toEqual([{ id: 'SAVED-1' }]);
  });

  it('returns an empty list when there is neither', () => {
    expect(harness({ orders: [] }, undefined)()).toEqual([]);
    expect(harness(null, { included: [] })()).toEqual([]);
  });
});
