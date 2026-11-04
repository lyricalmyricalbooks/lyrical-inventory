// Deleting a book must not leave its unsent changes behind: uploaded later,
// they wrote the deleted book's data back into the cloud.
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { loadApp, makeBook } from './helpers/load-app.js';

const KEEP = 'harbour';
const GONE = 'lantern';
let app;

beforeAll(async () => {
  app = await loadApp({ books: [makeBook({ id: KEEP }), makeBook({ id: GONE, title: 'Lantern Days' })] });
}, 30000);

beforeEach(async () => {
  if (app.main.BOOKS[GONE]) await app.resetBook(GONE, {});
  await app.resetBook(KEEP, {});
});

const sell = id => app.main.states[id].hist.unshift({ num: 'S-1', chan: 'Manual', qty: 1, price: 20, date: '2026-11-01', cur: 'CAD', sheetsId: `s-${id}` });

describe('deleting a book with changes still queued', () => {
  it('drops that book\'s queued changes and keeps the others', async () => {
    app.setOnline(false);
    sell(GONE); await app.main.saveState(GONE);
    sell(KEEP); await app.main.saveState(KEEP);
    expect(app.queued().map(i => i.bookId).sort()).toEqual([KEEP, GONE].sort());

    const done = app.window.deleteBook(GONE);
    await app.answerConfirm(true);
    await done;
    expect(app.queued().map(i => i.bookId)).toEqual([KEEP]);

    app.setOnline(true);
    await app.settle(20);
    expect(app.cloud.savesFor(GONE)).toHaveLength(0);
    expect(app.cloud.savesFor(KEEP)).toHaveLength(1);
    expect(app.queued()).toHaveLength(0);
  });

  it('holds, rather than sends, a queued change for a book no longer in the catalogue', async () => {
    app.setOnline(false);
    app.main.syncQueue.push({ bookId: 'removed-elsewhere', state: { hist: [] }, ts: Date.now(), qid: 'q-removed' });
    sell(KEEP); await app.main.saveState(KEEP);
    app.setOnline(true);
    await app.settle(20);
    expect(app.cloud.savesFor('removed-elsewhere')).toHaveLength(0);
    expect(app.cloud.savesFor(KEEP)).toHaveLength(1);
    expect(app.main.syncQueue.map(i => i.bookId)).toEqual(['removed-elsewhere']);
    // Leave the next test an empty queue.
    app.main.syncQueue.splice(0);
  });
});
