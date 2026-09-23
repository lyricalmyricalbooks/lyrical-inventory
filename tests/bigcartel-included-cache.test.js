import { describe, it, expect } from 'vitest';
import { extractDecl } from './helpers/extract-decl.js';

// The Shipping tab reads the saved Big Cartel cache's `included` list once per
// order. Re-parsing the whole cache each time made opening the tab take seconds,
// so it is parsed once and reused — but a fresh write must never be missed.
function harness() {
  const store = {};
  let parses = 0;
  const localStorage = {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
  };
  const JSONSpy = { ...JSON, parse: (s) => { parses++; return JSON.parse(s); }, stringify: JSON.stringify };
  const body = `
    ${extractDecl('_cachedIncludedMemo')}
    ${extractDecl('_cachedIncludedWatching')}
    ${extractDecl('cachedBigCartelIncluded')}
    ${extractDecl('cacheBigCartelOrders')}
    ${extractDecl('loadCachedBigCartelOrders')}
    return { cachedBigCartelIncluded, cacheBigCartelOrders };
  `;
  const api = new Function('localStorage', 'JSON', 'window', body)(localStorage, JSONSpy, undefined);
  return { api, parses: () => parses };
}

describe('saved Big Cartel included cache', () => {
  it('parses the saved cache once however many orders read it', () => {
    const { api, parses } = harness();
    api.cacheBigCartelOrders([{ id: 'A-1' }], [{ id: 'c1', type: 'customers' }]);
    for (let i = 0; i < 500; i++) api.cachedBigCartelIncluded();
    expect(parses()).toBe(1);
    expect(api.cachedBigCartelIncluded()).toEqual([{ id: 'c1', type: 'customers' }]);
  });

  it('picks up a new write instead of serving the old copy', () => {
    const { api } = harness();
    api.cacheBigCartelOrders([], [{ id: 'old' }]);
    expect(api.cachedBigCartelIncluded()).toEqual([{ id: 'old' }]);
    api.cacheBigCartelOrders([], [{ id: 'new' }]);
    expect(api.cachedBigCartelIncluded()).toEqual([{ id: 'new' }]);
  });

  it('returns an empty list when nothing is saved', () => {
    const { api } = harness();
    expect(api.cachedBigCartelIncluded()).toEqual([]);
  });
});
