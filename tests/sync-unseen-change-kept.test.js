// A sale queued in an earlier session (or by a tab that has since closed) is
// uploaded by this one, but this screen never showed it. The next sale made
// here must not write over it.
//
// Runs the real save path end to end: saveState / processSyncQueue in main.js
// and _fbLoad / _fbSave / _fbWatch in firebase.js, against an in-memory
// Firestore (tests/helpers/fake-firestore.js).
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { createFakeFirestore } from './helpers/fake-firestore.js';
import { loadApp, makeBook } from './helpers/load-app.js';

const BOOK = 'harbour';
const store = createFakeFirestore();
let app;

const state = () => app.main.states[BOOK];
const ids = list => list.map(h => h.sheetsId).filter(id => id !== 'BASE').sort();
const cloudHist = () => ids(store.read(`books/${BOOK}/data/hist`) || []);
const screenHist = () => ids(state().hist);
const sale = id => ({ num: id, chan: 'Book Fair', qty: 1, price: 20, date: '2026-11-01', cur: 'CAD', notes: '', sheetsId: id });

beforeAll(async () => {
  store.install();
  // The real Firebase-backed functions, kept before the harness swaps them for fakes.
  await import('../src/firebase.js');
  const real = {};
  for (const k of ['_fbSave', '_fbLoad', '_fbWatch', '_fbBaseFor']) real[k] = window[k];
  app = await loadApp({ books: [makeBook({ id: BOOK })], overrides: real });
}, 30000);

afterAll(() => store.uninstall());

beforeEach(async () => {
  store.setSilent(false);
  store.setOffline(false);
  // One sale already in the cloud, so every part has a stored document.
  await app.resetBook(BOOK, { hist: [sale('BASE')] });
  // Load the book the way the app does, so the screen is built on the cloud copy.
  await app.main.loadBook(BOOK);
  await app.settle();
});

/** A sale this screen never showed, waiting in the queue (as adopted on start-up). */
function queueUnseenSale(id) {
  const s = JSON.parse(JSON.stringify(state()));
  s.hist.unshift(sale(id));
  app.main.syncQueue.push({ bookId: BOOK, state: s, base: window._fbBaseFor(BOOK), ts: Date.now(), qid: `gone-tab#${id}`, adopted: true });
}

describe('a change this screen never showed', () => {
  it('survives the next sale made on this screen', async () => {
    app.setOnline(false);
    queueUnseenSale('S-earlier');
    app.setOnline(true);
    await app.settle(20);
    expect(app.queued()).toHaveLength(0);
    expect(cloudHist()).toEqual(['S-earlier']);

    state().hist.unshift(sale('T-now'));
    await app.main.saveState(BOOK);
    await app.settle(20);

    expect(cloudHist()).toEqual(['S-earlier', 'T-now']);
    expect(screenHist()).toEqual(['S-earlier', 'T-now']);
  });

  it('shows up on screen once it has uploaded', async () => {
    app.setOnline(false);
    queueUnseenSale('S-earlier');
    app.setOnline(true);
    await app.settle(20);
    expect(screenHist()).toEqual(['S-earlier']);
  });

  it('is merged in, not written over, when the cloud moved under the screen', async () => {
    // The cloud (and the live merge base) now hold a sale the screen was not
    // told about: what happens while the live listener stands aside for a
    // queued change. A direct save from this screen must merge with it.
    store.setSilent(true);
    const s = JSON.parse(JSON.stringify(state()));
    s.hist.unshift(sale('S-earlier'));
    await window._fbSave(BOOK, JSON.stringify(s), { base: window._fbBaseFor(BOOK) });
    store.setSilent(false);
    expect(cloudHist()).toEqual(['S-earlier']);

    state().hist.unshift(sale('T-now'));
    await app.main.saveState(BOOK);
    await app.settle(20);
    expect(cloudHist()).toEqual(['S-earlier', 'T-now']);
  });

  it('is kept when the next sale is queued offline instead', async () => {
    store.setSilent(true);
    const s = JSON.parse(JSON.stringify(state()));
    s.hist.unshift(sale('S-earlier'));
    await window._fbSave(BOOK, JSON.stringify(s), { base: window._fbBaseFor(BOOK) });
    store.setSilent(false);

    app.setOnline(false);
    state().hist.unshift(sale('T-now'));
    await app.main.saveState(BOOK);
    app.setOnline(true);
    await app.settle(20);
    expect(app.queued()).toHaveLength(0);
    expect(cloudHist()).toEqual(['S-earlier', 'T-now']);
  });
});
