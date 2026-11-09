// One broken piece of data or one failing screen must not take the app down:
// screens keep drawing, the user is told once, and device-storage trouble
// doesn't stop a save or the start-up.
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import { makeScreenGuard } from '../src/lib/screen-guard.js';
import { parseSubmissionData, readableSubmissions } from '../src/lib/submissions.js';
import { storageGet, storageSet } from '../src/lib/safe-storage.js';
import { loadApp, makeBook } from './helpers/load-app.js';

describe('screen guard', () => {
  it('returns the result when nothing fails', () => {
    const guard = makeScreenGuard({});
    expect(guard('x', () => 7)).toBe(7);
  });

  it('reports every failure but tells the user once per screen', () => {
    const report = vi.fn();
    const notify = vi.fn();
    const guard = makeScreenGuard({ report, notify });
    const boom = () => { throw new Error('boom'); };
    expect(guard('tab:history', boom)).toBeUndefined();
    guard('tab:history', boom);
    guard('tab:expenses', boom);
    expect(report).toHaveBeenCalledTimes(3);
    expect(notify).toHaveBeenCalledTimes(2);
  });

  it('survives a reporter that itself fails', () => {
    const guard = makeScreenGuard({ report: () => { throw new Error('r'); }, notify: () => { throw new Error('n'); } });
    expect(() => guard('x', () => { throw new Error('boom'); })).not.toThrow();
  });
});

describe('artist submissions', () => {
  it('reads JSON text and older object records, and refuses anything else', () => {
    expect(parseSubmissionData('{"qty":2}')).toEqual({ qty: 2 });
    expect(parseSubmissionData({ qty: 2 })).toEqual({ qty: 2 });
    for (const bad of ['{not json', '', undefined, null, 5, '[1,2]', '"text"', 'null']) {
      expect(parseSubmissionData(bad)).toBeNull();
    }
  });

  it('keeps the readable ones as JSON text and lists the rest', () => {
    const { clean, dropped } = readableSubmissions({
      sales: {
        good: { data: '{"qty":1}', ts: 1 },
        old: { data: { qty: 3 }, ts: 2 },
        garbled: { data: '{qty:', ts: 3 },
        empty: null,
      },
      expenses: { missing: { ts: 4 } },
    });
    expect(Object.keys(clean.sales)).toEqual(['good', 'old']);
    expect(JSON.parse(clean.sales.old.data)).toEqual({ qty: 3 });
    expect(clean.sales.good.ts).toBe(1);
    expect(clean.expenses).toBeUndefined();
    expect(dropped).toEqual(['sales/garbled', 'sales/empty', 'expenses/missing']);
  });

  it('treats nothing at all as no submissions', () => {
    expect(readableSubmissions(null)).toEqual({ clean: {}, dropped: [] });
  });
});

describe('device storage', () => {
  it('falls back instead of throwing when storage is blocked or full', () => {
    const real = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
    try {
      Object.defineProperty(globalThis, 'localStorage', { configurable: true, get() { throw new Error('SecurityError'); } });
      expect(storageGet('k', 'fallback')).toBe('fallback');
      expect(storageSet('k', 'v')).toBe(false);
      Object.defineProperty(globalThis, 'localStorage', {
        configurable: true,
        value: { getItem: () => null, setItem: () => { throw new Error('QuotaExceededError'); }, removeItem() {} },
      });
      expect(storageGet('k')).toBe('');
      expect(storageSet('k', 'v')).toBe(false);
    } finally {
      if (real) Object.defineProperty(globalThis, 'localStorage', real);
    }
  });
});

describe('the app with a broken submission or screen', () => {
  let app;
  const subWatchers = {};
  beforeAll(async () => {
    app = await loadApp({
      books: [makeBook({ id: 'harbour' })],
      overrides: { _fbWatchSubmissions: (bookId, cb) => { subWatchers[bookId] = cb; return () => {}; } },
    });
  }, 30000);
  beforeEach(() => app.resetBook('harbour', { hist: [] }));

  it('still draws History when one artist sale in the cloud is unreadable', async () => {
    app.main.switchBook('harbour');
    subWatchers.harbour({
      sales: {
        bad: { data: '{this is not json', ts: 1 },
        good: { data: JSON.stringify({ num: 'A-1', qty: 2, price: 20, date: '2026-11-01', chan: 'Direct' }), ts: 2 },
      },
    });
    // Hidden, but the publisher is told so the artist's entry isn't lost silently.
    expect(app.toast()).toMatch(/One pending artist entry for Harbour Lights could not be read/);
    expect(() => app.main.switchTab('history')).not.toThrow();
    await app.settle();
    const body = app.window.document.getElementById('hist-body') || app.window.document.getElementById('tab-history');
    expect(body.textContent).toContain('A-1');
    expect(app.cloud.errorReports.some(r => r.kind === 'submission-unreadable')).toBe(true);
  });

  it('saves a manual sale even if the screen fails to repaint afterwards, with no "try again" message', async () => {
    app.main.switchBook('harbour');
    subWatchers.harbour(null);
    const doc = app.window.document;
    const spy = vi.spyOn(doc, 'getElementById');
    spy.mockImplementation(function (id) {
      if (id === 'hist-body') throw new Error('drawing failed');
      return Document.prototype.getElementById.call(this, id);
    });
    try {
      const set = (id, v) => { doc.getElementById(id).value = v; };
      set('m-num', 'R-9'); set('m-qty', '1'); set('m-price', '20'); set('m-chan', 'In Person');
      set('m-notes', ''); set('m-payment-type', 'Payment directly to publisher'); set('m-price-cur', 'BOOK');
      await app.window.submitManual();
      await app.settle();
    } finally {
      spy.mockRestore();
    }
    const rows = app.main.states.harbour.hist.filter(h => h.num === 'R-9');
    expect(rows).toHaveLength(1);
    expect(app.toast()).not.toMatch(/try again/i);
  });

  it('tells the user when a screen fails, and the rest of the switch still runs', async () => {
    app.main.switchBook('harbour');
    subWatchers.harbour(null);
    // A screen that throws while drawing (stands in for any bug in a tab).
    const spy = vi.spyOn(app.window.document, 'getElementById');
    spy.mockImplementation(function (id) {
      if (id === 'hist-body') throw new Error('drawing failed');
      return Document.prototype.getElementById.call(this, id);
    });
    try {
      expect(() => app.main.switchTab('history')).not.toThrow();
    } finally {
      spy.mockRestore();
    }
    expect(app.window.document.querySelector('.tab-panel.active').id).toBe('tab-history');
    expect(app.toast()).toMatch(/could not be shown/);
    expect(app.cloud.errorReports.some(r => r.kind === 'render' && /tab:history/.test(r.message))).toBe(true);
  });
});
