// The save path every ledger change goes through (saveState in src/main.js),
// driven for real against a fake cloud.
//
// What a publisher depends on here: a change reaches the cloud once; nothing
// is lost when the device is offline or the cloud copy can't be checked; and
// when another device wrote in the meantime, the screen ends up showing the
// merged ledger rather than this device's pre-merge copy.
import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import { loadApp, makeBook } from './helpers/load-app.js';

const BOOK = 'harbour';
const SALE = { num: 'S-1', chan: 'Website', qty: 2, price: 40, date: '2026-03-01', cur: 'CAD' };

let app;
const state = () => app.main.states[BOOK];
const saves = () => app.cloud.savesFor(BOOK);
const chip = () => document.getElementById('sync-chip');
const lastCloudSync = () => localStorage.getItem('lm-last-cloud-sync');

/** Make a real ledger change: one more sale on the book. */
function recordSale(extra = {}) {
  state().hist.unshift({ ...SALE, ...extra });
  state().revenue += (extra.qty ?? SALE.qty) * (extra.price ?? SALE.price);
}

beforeAll(async () => {
  app = await loadApp({ books: [makeBook({ id: BOOK })] });
}, 30000);

beforeEach(async () => {
  await app.resetBook(BOOK, {});
});

afterEach(async () => {
  // Leave the next test a connected device and an empty queue.
  await app.resetBook(BOOK, {});
});

describe('sending a change', () => {
  it('sends the whole book state, exactly as it stands', async () => {
    recordSale();
    await app.main.saveState(BOOK);
    expect(saves()).toHaveLength(1);
    expect(saves()[0].json).toBe(JSON.stringify(state()));
    expect(saves()[0].state.hist[0]).toMatchObject({ qty: 2, price: 40 });
    expect(saves()[0].state.revenue).toBe(80);
  });

  it('does not re-send a state that has not changed since the last save', async () => {
    recordSale();
    await app.main.saveState(BOOK);
    await app.main.saveState(BOOK);
    await app.main.saveState(BOOK);
    expect(saves()).toHaveLength(1);
  });

  it('sends again as soon as something does change', async () => {
    recordSale();
    await app.main.saveState(BOOK);
    recordSale({ num: 'S-2', qty: 1 });
    await app.main.saveState(BOOK);
    expect(saves()).toHaveLength(2);
    expect(saves()[1].state.hist.map(h => h.num)).toEqual(['S-2', 'S-1']);
    expect(saves()[1].state.revenue).toBe(120);
  });

  it('stamps the time of a confirmed cloud write', async () => {
    localStorage.removeItem('lm-last-cloud-sync');
    recordSale();
    const before = Date.now();
    await app.main.saveState(BOOK);
    expect(Number(lastCloudSync())).toBeGreaterThanOrEqual(before);
    expect(chip().hidden).toBe(true);
  });
});

describe('saving while offline', () => {
  it('queues the change on the device instead of sending it', async () => {
    app.setOnline(false);
    localStorage.removeItem('lm-last-cloud-sync');
    recordSale();
    await app.main.saveState(BOOK);
    expect(saves()).toHaveLength(0);
    const queued = app.queued();
    expect(queued).toHaveLength(1);
    expect(queued[0].bookId).toBe(BOOK);
    expect(queued[0].state.hist[0]).toMatchObject({ qty: 2, price: 40 });
    expect(queued[0].state.revenue).toBe(80);
    expect(lastCloudSync()).toBeNull();
  });

  it('keeps only the newest snapshot per book, so rapid edits don\'t pile up', async () => {
    app.setOnline(false);
    recordSale();
    await app.main.saveState(BOOK);
    recordSale({ num: 'S-2', qty: 1 });
    await app.main.saveState(BOOK);
    const queued = app.queued();
    expect(queued).toHaveLength(1);
    expect(queued[0].state.hist.map(h => h.num)).toEqual(['S-2', 'S-1']);
    expect(queued[0].state.revenue).toBe(120);
  });

  it('shows the offline chip the moment the connection drops', async () => {
    expect(chip().hidden).toBe(true);
    app.setOnline(false);
    expect(chip().hidden).toBe(false);
    expect(chip().classList.contains('is-offline')).toBe(true);
  });

  it('sends the queued change when the connection comes back, then treats it as saved', async () => {
    app.setOnline(false);
    recordSale();
    await app.main.saveState(BOOK);
    expect(saves()).toHaveLength(0);

    app.setOnline(true);
    await app.settle();
    expect(saves()).toHaveLength(1);
    expect(saves()[0].state.revenue).toBe(80);
    expect(app.queued()).toHaveLength(0);
    expect(chip().hidden).toBe(true);
    expect(Number(lastCloudSync())).toBeGreaterThan(0);

    // The drained snapshot counts as saved: nothing to re-send.
    await app.main.saveState(BOOK);
    expect(saves()).toHaveLength(1);
  });
});

describe('when the cloud copy could not be verified ({ ok: false })', () => {
  beforeEach(() => {
    app.cloud.saveImpl = () => ({ ok: false, reason: 'server-read-failed' });
  });

  it('keeps the change queued rather than dropping it', async () => {
    recordSale();
    await app.main.saveState(BOOK);
    await app.settle();
    const queued = app.queued();
    expect(queued).toHaveLength(1);
    expect(queued[0].state.revenue).toBe(80);
    // Online but failing: the chip says so, rather than "offline".
    expect(chip().hidden).toBe(false);
    expect(chip().classList.contains('is-failed')).toBe(true);
  });

  it('does not mark the state saved, so the next save tries again', async () => {
    recordSale();
    await app.main.saveState(BOOK);
    await app.settle();
    const attempts = saves().length;
    expect(attempts).toBeGreaterThanOrEqual(1);
    await app.main.saveState(BOOK);
    expect(saves().length).toBeGreaterThan(attempts);
  });

  it('does not stamp a cloud write that did not happen', async () => {
    localStorage.removeItem('lm-last-cloud-sync');
    recordSale();
    await app.main.saveState(BOOK);
    await app.settle();
    expect(lastCloudSync()).toBeNull();
  });

  it('delivers the queued change once the cloud answers again', async () => {
    recordSale();
    await app.main.saveState(BOOK);
    await app.settle();
    app.cloud.saveImpl = (bookId, json) => { app.cloud.books[bookId] = json; return { ok: true }; };
    app.setOnline(true); // "back online" is also what resets the retry backoff
    await app.settle();
    expect(app.queued()).toHaveLength(0);
    expect(JSON.parse(app.cloud.books[BOOK]).revenue).toBe(80);
    expect(chip().hidden).toBe(true);
  });

  it('"Try again now" on the chip delivers it without waiting for the backoff', async () => {
    recordSale();
    await app.main.saveState(BOOK);
    await app.settle();
    const button = document.getElementById('sync-chip-action');
    expect(button.hidden).toBe(false);
    app.cloud.saveImpl = (bookId, json) => { app.cloud.books[bookId] = json; return { ok: true }; };
    button.click();
    await app.settle();
    expect(app.queued()).toHaveLength(0);
    expect(JSON.parse(app.cloud.books[BOOK]).revenue).toBe(80);
    expect(chip().hidden).toBe(true);
    expect(chip().classList.contains('is-failed')).toBe(false);
  });
});

describe('when the save throws', () => {
  it('queues the change for retry', async () => {
    app.cloud.saveImpl = () => { throw new Error('socket hang up'); };
    recordSale();
    await app.main.saveState(BOOK);
    await app.settle();
    expect(app.queued()).toHaveLength(1);
    expect(app.queued()[0].state.revenue).toBe(80);
  });
});

describe('when another device wrote in the meantime (merged result)', () => {
  const OTHER = { num: 'O-1', chan: 'Book Fair', qty: 1, price: 40, date: '2026-03-02', cur: 'CAD' };

  function mergeWithOtherDevice({ conflicts = [] } = {}) {
    app.cloud.saveImpl = (bookId, json) => {
      const mine = JSON.parse(json);
      const merged = { ...mine, hist: [OTHER, ...mine.hist], revenue: mine.revenue + 40 };
      app.cloud.books[bookId] = JSON.stringify(merged);
      return { ok: true, merged: true, state: merged, conflicts };
    };
  }

  it('adopts the merged ledger so the screen matches the cloud', async () => {
    mergeWithOtherDevice();
    recordSale();
    await app.main.saveState(BOOK);
    expect(state().hist.map(h => h.num)).toEqual(['O-1', 'S-1']);
    expect(state().revenue).toBe(120);
    expect(app.toast()).toMatch(/Merged in changes from another device/);
  });

  it('treats the merged state as saved, so it is not pushed straight back', async () => {
    mergeWithOtherDevice();
    recordSale();
    await app.main.saveState(BOOK);
    expect(saves()).toHaveLength(1);
    await app.main.saveState(BOOK);
    expect(saves()).toHaveLength(1);
  });

  it('warns, with a count, when the same record was changed in both places', async () => {
    // Real conflict shape (see mergePart): the same row edited differently on
    // each device. The price differs, so both are worth a person's attention.
    const row = (id, price) => ({ id, date: '2026-09-01', qty: 1, price, channel: 'pos' });
    mergeWithOtherDevice({ conflicts: [
      { part: 'hist', key: 'S-1', local: row('S-1', 20), remote: row('S-1', 25) },
      { part: 'hist', key: 'S-9', local: row('S-9', 30), remote: row('S-9', 35) },
    ] });
    recordSale();
    await app.main.saveState(BOOK);
    expect(app.toast()).toMatch(/2 records were changed on two devices at once/);
  });

  it('fills in any list the merge dropped, so the screens still have arrays to read', async () => {
    app.cloud.saveImpl = (bookId, json) => {
      const merged = JSON.parse(json);
      delete merged.artistPayouts;
      return { ok: true, merged: true, state: merged, conflicts: [] };
    };
    recordSale();
    await app.main.saveState(BOOK);
    expect(state().artistPayouts).toEqual([]);
  });
});

describe('a book that never loaded', () => {
  it('is marked as not-real-data when its load fails, and then refuses to save', async () => {
    const realLoad = app.window._fbLoad;
    app.window._fbLoad = async () => { throw new Error('unavailable'); };
    try {
      await app.window.forceSync();
    } finally {
      app.window._fbLoad = realLoad;
    }
    expect(app.toast()).toMatch(/not real data/);
    expect(app.cloud.errorReports.map(e => e.kind)).toContain('load-book-failed');
    recordSale();
    await app.main.saveState(BOOK);
    await app.settle();
    expect(saves()).toHaveLength(0);
    expect(app.queued()).toHaveLength(0);
    // JSON.stringify must never carry the marker to the cloud.
    expect(JSON.stringify(state())).not.toContain('_loadFailed');
  });

  it('is not saved over the real one, not queued, and the user is told why', async () => {
    recordSale();
    Object.defineProperty(state(), '_loadFailed', { value: true, enumerable: false, configurable: true });
    await app.main.saveState(BOOK);
    await app.settle();
    expect(saves()).toHaveLength(0);
    expect(app.queued()).toHaveLength(0);
    expect(app.toast()).toMatch(/Not saving/);
  });
});
