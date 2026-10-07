// Sales must reach the cloud exactly once, whatever the timing: an edit made
// while a save is still uploading, two tabs open on one device, a book the
// cloud keeps refusing, a reload with changes still waiting. Driven against the
// real save path (src/main.js) and a fake cloud.
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { loadApp, makeBook } from './helpers/load-app.js';
import { partHashesOf } from '../src/lib/merge-state.js';
import { SYNC_TAB_PREFIX } from '../src/lib/sync-queue-store.js';

const A = 'harbour';
const B = 'lantern';
const SALE = { num: 'S-1', chan: 'Website', qty: 1, price: 40, date: '2026-03-01', cur: 'CAD' };

let app;
let fbSaveCalls;
const state = (id = A) => app.main.states[id];

function recordSale(id = A, extra = {}) {
  state(id).hist.unshift({ ...SALE, ...extra });
}

/** A save the test finishes by hand, so it can act while one is in flight. */
function holdSaves() {
  const held = [];
  app.cloud.saveImpl = (bookId, json) => new Promise(resolve => {
    held.push({ bookId, json, finish: (answer = { ok: true }) => { app.cloud.books[bookId] = json; resolve(answer); } });
  });
  return held;
}

beforeAll(async () => {
  app = await loadApp({ books: [makeBook({ id: A }), makeBook({ id: B })] });
  // Record what each upload was told to merge against (the harness drops opts).
  const inner = app.window._fbSave;
  fbSaveCalls = [];
  app.window._fbSave = async (bookId, json, opts) => {
    fbSaveCalls.push({ bookId, json, opts });
    return inner(bookId, json, opts);
  };
}, 30000);

beforeEach(async () => {
  await app.resetBook(A, {});
  await app.resetBook(B, {});
  fbSaveCalls.length = 0;
});

afterEach(async () => {
  app.cloud.saveImpl = (bookId, json) => { app.cloud.books[bookId] = json; return { ok: true }; };
  await app.settle(20);
});

describe('one book is saved one save at a time', () => {
  it('runs a save asked for mid-upload afterwards, with both sales in it', async () => {
    const held = holdSaves();
    recordSale(A, { num: 'S-1' });
    const first = app.main.saveState(A);
    await app.settle();
    recordSale(A, { num: 'S-2' });
    const second = app.main.saveState(A);
    await app.settle();
    expect(held).toHaveLength(1); // the second did not race the first

    held[0].finish();
    await vi.waitFor(() => expect(held).toHaveLength(2));
    held[1].finish();
    await Promise.all([first, second]);

    const last = JSON.parse(held[1].json);
    expect(last.hist.map(h => h.num)).toEqual(['S-2', 'S-1']);
  });

  it('keeps an edit made while a merged save was in flight, and merges it with the snapshot sent', async () => {
    const held = holdSaves();
    recordSale(A, { num: 'S-1' });
    const run = app.main.saveState(A);
    await app.settle();
    const sent = JSON.parse(held[0].json);

    // Meanwhile: the owner records another sale on this device…
    recordSale(A, { num: 'S-2' });
    app.main.saveState(A);
    // …and the cloud answers that another device had added a sale too.
    const merged = { ...sent, hist: [{ ...SALE, num: 'OTHER' }, ...sent.hist] };
    held[0].finish({ ok: true, merged: true, state: merged, conflicts: [] });
    await vi.waitFor(() => expect(held).toHaveLength(2));

    // The new sale is still on screen, not wiped by the merged copy.
    expect(state(A).hist.map(h => h.num)).toContain('S-2');
    // The follow-up merges against what the first save sent.
    const followUp = fbSaveCalls[fbSaveCalls.length - 1];
    expect(followUp.opts.base).toEqual(partHashesOf(sent));
    expect(JSON.parse(followUp.json).hist.map(h => h.num)).toEqual(['S-2', 'S-1']);
    held[1].finish();
    await run;
  });
});

describe('the offline queue', () => {
  it('keeps an edit queued while the same book is uploading', async () => {
    app.setOnline(false);
    recordSale(A, { num: 'S-1' });
    await app.main.saveState(A);
    expect(app.queued()).toHaveLength(1);

    const held = holdSaves();
    app.setOnline(true);
    await vi.waitFor(() => expect(held).toHaveLength(1));
    const firstSent = JSON.parse(held[0].json);

    // A sale recorded while the queued one is uploading.
    recordSale(A, { num: 'S-2' });
    await app.main.saveState(A);
    expect(app.queued()).toHaveLength(2);

    held[0].finish();
    await vi.waitFor(() => expect(held).toHaveLength(2));
    // The second change survived the first one landing, and merges against it.
    const second = fbSaveCalls[fbSaveCalls.length - 1];
    expect(second.opts.base).toEqual(partHashesOf(firstSent));
    expect(JSON.parse(second.json).hist.map(h => h.num)).toEqual(['S-2', 'S-1']);
    held[1].finish();
    await vi.waitFor(() => expect(app.queued()).toHaveLength(0));
  });

  it('lets other books upload while one keeps being refused', async () => {
    app.setOnline(false);
    recordSale(A);
    await app.main.saveState(A);
    recordSale(B);
    await app.main.saveState(B);

    app.cloud.saveImpl = (bookId, json) => {
      if (bookId === A) throw new Error('permission-denied');
      app.cloud.books[bookId] = json;
      return { ok: true };
    };
    app.setOnline(true);
    await vi.waitFor(() => expect(app.queued().map(i => i.bookId)).toEqual([A]));
    expect(JSON.parse(app.cloud.books[B]).hist).toHaveLength(1);

    // Let A through so the queue drains for the next test.
    app.cloud.saveImpl = (bookId, json) => { app.cloud.books[bookId] = json; return { ok: true }; };
    app.window.retrySyncNow?.();
    app.setOnline(true);
    await vi.waitFor(() => expect(app.queued()).toHaveLength(0), { timeout: 5000 });
  });

  it('shows a change still waiting to upload after the book reloads, so the next edit keeps it', async () => {
    app.setOnline(false);
    recordSale(A, { num: 'QUEUED' });
    await app.main.saveState(A);
    // The cloud copy (what a reload reads) has never seen it.
    expect(JSON.parse(app.cloud.books[A]).hist).toHaveLength(0);

    await app.main.loadBook(A);
    expect(state(A).hist.map(h => h.num)).toEqual(['QUEUED']);

    recordSale(A, { num: 'NEXT' });
    await app.main.saveState(A);
    expect(app.queued()[0].state.hist.map(h => h.num)).toEqual(['NEXT', 'QUEUED']);
    app.setOnline(true);
    await vi.waitFor(() => expect(app.queued()).toHaveLength(0));
  });
});

describe('two tabs on one device', () => {
  it('uploads changes a closed tab left behind, and only once', async () => {
    const leftover = {
      bookId: B, ts: 1, base: {}, qid: 'gone-1',
      state: { ...state(B), hist: [{ ...SALE, num: 'FROM-OTHER-TAB' }] },
    };
    localStorage.setItem('lm-sync-queue:gone', JSON.stringify([leftover]));
    localStorage.setItem(SYNC_TAB_PREFIX + 'gone', String(Date.now() - 10 * 60_000));

    await app.main.adoptOrphanedSyncChanges();
    expect(localStorage.getItem('lm-sync-queue:gone')).toBeNull();
    await vi.waitFor(() => expect(app.queued()).toHaveLength(0));
    expect(app.cloud.savesFor(B).map(s => s.state.hist[0].num)).toEqual(['FROM-OTHER-TAB']);

    // Running again finds nothing more to send.
    await app.main.adoptOrphanedSyncChanges();
    await app.settle(10);
    expect(app.cloud.savesFor(B)).toHaveLength(1);
  });

  it('leaves a live tab\'s changes to that tab', async () => {
    localStorage.setItem('lm-sync-queue:alive', JSON.stringify([{ bookId: B, ts: 1, base: {}, qid: 'alive-1', state: state(B) }]));
    localStorage.setItem(SYNC_TAB_PREFIX + 'alive', String(Date.now()));
    await app.main.adoptOrphanedSyncChanges();
    await app.settle(10);
    expect(localStorage.getItem('lm-sync-queue:alive')).not.toBeNull();
    expect(app.cloud.savesFor(B)).toHaveLength(0);
    localStorage.removeItem('lm-sync-queue:alive');
    localStorage.removeItem(SYNC_TAB_PREFIX + 'alive');
  });
});
