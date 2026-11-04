// The Tax Centre (and the catalogue) are saved by merging with the cloud copy.
// Offline, that copy can't be read: the save used to write this device's whole
// copy anyway, which Firestore queued and sent on reconnect unmerged — wiping
// the expenses another device logged meanwhile — and it hung until then.
//
// Runs src/firebase.js's real _fbLoadSettings / _fbSaveSettings against an
// in-memory Firestore (tests/helpers/fake-firestore.js).
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { createFakeFirestore } from './helpers/fake-firestore.js';

const store = createFakeFirestore();
const PATH = 'settings/taxCenter';
let online = true;

const cloud = () => store.read(PATH);
const ids = tc => (tc.businessExpenses || []).map(e => e.id).sort();
const putCloud = tc => store.docs.set(PATH, { data: JSON.stringify(tc), ts: 1 });
const settle = async (n = 10) => { for (let i = 0; i < n; i++) await new Promise(r => setTimeout(r, 0)); };

function goOffline() { online = false; store.setOffline(true); window.dispatchEvent(new Event('offline')); }
function goOnline() { online = true; store.setOffline(false); window.dispatchEvent(new Event('online')); }

beforeAll(async () => {
  Object.defineProperty(window.navigator, 'onLine', { configurable: true, get: () => online });
  store.install();
  await import('../src/firebase.js');
  window._useFirestoreGlobal = () => true;
  window.showToast = vi.fn();
});

afterAll(() => store.uninstall());

beforeEach(async () => {
  goOnline();
  await settle();
  store.docs.clear();
  localStorage.clear();
});

const T0 = { businessExpenses: [{ id: 1, amount: 5 }], recurring: [], settings: {} };

describe('saving the Tax Centre with no connection', () => {
  it('does not write over another device\'s new expense when it reconnects', async () => {
    putCloud(T0);
    const phone = await window._fbLoadSettings('taxCenter');

    goOffline();
    phone.businessExpenses.push({ id: 3, amount: 9, desc: 'phone receipt' });
    // Returns at once, rather than waiting for the connection.
    expect(await window._fbSaveSettings('taxCenter', phone)).toBe(true);
    expect(ids(cloud())).toEqual([1]);

    // Meanwhile the desktop logs its own expense.
    putCloud({ ...T0, businessExpenses: [...T0.businessExpenses, { id: 2, amount: 40, desc: 'desktop receipt' }] });

    goOnline();
    await settle(20);
    expect(ids(cloud())).toEqual([1, 2, 3]);
  });

  it('keeps an offline change across a reload and merges it in on the next load', async () => {
    putCloud(T0);
    const phone = await window._fbLoadSettings('taxCenter');
    goOffline();
    phone.businessExpenses.push({ id: 3, amount: 9 });
    await window._fbSaveSettings('taxCenter', phone);
    expect(localStorage.getItem('lm-pending-setting:taxCenter')).toBeTruthy();

    // The desktop adds one; this device loads again (a reload, back online).
    putCloud({ ...T0, businessExpenses: [...T0.businessExpenses, { id: 2, amount: 40 }] });
    goOnline();
    const loaded = await window._fbLoadSettings('taxCenter');
    expect(ids(loaded)).toEqual([1, 2, 3]);
    await settle(20);
    expect(ids(cloud())).toEqual([1, 2, 3]);
    expect(localStorage.getItem('lm-pending-setting:taxCenter')).toBeNull();
  });

  it('saves straight through when the cloud copy can be read', async () => {
    putCloud(T0);
    const tc = await window._fbLoadSettings('taxCenter');
    tc.businessExpenses.push({ id: 4, amount: 1 });
    expect(await window._fbSaveSettings('taxCenter', tc)).toBe(true);
    expect(ids(cloud())).toEqual([1, 4]);
    expect(localStorage.getItem('lm-pending-setting:taxCenter')).toBeNull();
  });
});
