import { beforeAll, describe, expect, it, vi } from 'vitest';
import { loadApp, makeBook } from './helpers/load-app.js';

// A book moving to the new storage while another device saved a sale to the
// old one: the move hands that sale back (`late`) and it is added through the
// normal save, never dropped.
const BOOK = 'harbour';
const a = { uid: 'a', chan: 'Book Fair', qty: 1, price: 20, date: '2026-06-01' };
const late = { uid: 'late', chan: 'In Person', qty: 2, price: 20, date: '2026-07-01' };
let app;

beforeAll(async () => {
  app = await loadApp({ books: [makeBook({ id: BOOK, listPrice: 20 })], states: { [BOOK]: { hist: [a] } } });
}, 30000);

describe('moving a book to the new storage', () => {
  it('adds a sale saved to the old storage during the move, and saves it', async () => {
    app.window._fbAdoptBook = async () => ({ decision: 'adopted', state: { hist: [a] }, late: [{ part: 'hist', row: late }] });
    await app.main.loadBook(BOOK);
    expect(app.main.states[BOOK].hist.map(h => h.uid)).toEqual(['late', 'a']);
    await vi.waitFor(() => expect(app.cloud.lastSave(BOOK).state.hist.some(h => h.uid === 'late')).toBe(true), { timeout: 4000, interval: 10 });
  });

  it('changes nothing when no sale arrived during the move', async () => {
    await app.resetBook(BOOK, { hist: [a] });
    app.cloud.saves.length = 0;
    app.window._fbAdoptBook = async () => ({ decision: 'adopted', state: { hist: [a] }, late: [] });
    await app.main.loadBook(BOOK);
    expect(app.main.states[BOOK].hist.map(h => h.uid)).toEqual(['a']);
    await app.settle(20);
    expect(app.cloud.savesFor(BOOK)).toHaveLength(0);
  });
});
