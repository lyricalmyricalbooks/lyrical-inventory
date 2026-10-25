// "This book changed" / "the cloud holds this book": announced once by the
// save and the live listener (src/core/store.js), and followed by whatever
// subscribes, instead of each action calling every follow-up by hand.
import { describe, it, expect, beforeAll, vi } from 'vitest';
import { loadApp, makeBook } from './helpers/load-app.js';
import { announceBookChanged, announceBookSaved, onBookEvent } from '../src/core/store.js';

describe('change notices', () => {
  it('reach every subscriber, with the book and where the change came from', () => {
    const changed = vi.fn();
    const saved = vi.fn();
    const offChanged = onBookEvent('book-changed', changed);
    const offSaved = onBookEvent('book-saved', saved);
    announceBookChanged('bk');
    announceBookChanged('bk', 'remote');
    announceBookSaved('bk');
    expect(changed.mock.calls.map(c => c[0])).toEqual([
      { bookId: 'bk', source: 'local' }, { bookId: 'bk', source: 'remote' },
    ]);
    expect(saved).toHaveBeenCalledWith({ bookId: 'bk' });
    offChanged(); offSaved();
    announceBookChanged('bk');
    expect(changed).toHaveBeenCalledTimes(2);
  });

  it('keep going when one subscriber fails, so a broken screen cannot stop the sheet sync', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const after = vi.fn();
    const offBad = onBookEvent('book-changed', () => { throw new Error('boom'); });
    const offGood = onBookEvent('book-changed', after);
    announceBookChanged('bk');
    expect(after).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalled();
    offBad(); offGood(); spy.mockRestore();
  });
});

describe('in the running app', () => {
  let app;
  const watchers = {};
  beforeAll(async () => {
    app = await loadApp({
      books: [makeBook({ id: 'bk', listPrice: 40, maxPrint: 100 })],
      overrides: { _fbWatch: (bookId, cb) => { watchers[bookId] = cb; return () => {}; } },
    });
  }, 30000);

  it('announces a local change when a book is saved, then that the cloud holds it', async () => {
    const seen = [];
    const off1 = onBookEvent('book-changed', d => seen.push(['changed', d.source]));
    const off2 = onBookEvent('book-saved', () => seen.push(['saved']));
    app.main.states.bk.notes = 'x';
    await app.main.saveState('bk');
    off1(); off2();
    expect(seen).toEqual([['changed', 'local'], ['saved']]);
  });

  it('announces a remote change when another device’s save replaces the copy here', async () => {
    const seen = [];
    const off = onBookEvent('book-changed', d => seen.push(d));
    const remote = { ...JSON.parse(JSON.stringify(app.main.states.bk)), artistPaymentLink: 'https://pay.example/from-phone' };
    watchers.bk(JSON.stringify(remote));
    off();
    expect(app.main.states.bk.artistPaymentLink).toBe('https://pay.example/from-phone');
    expect(seen).toEqual([{ bookId: 'bk', source: 'remote' }]);
  });
});
