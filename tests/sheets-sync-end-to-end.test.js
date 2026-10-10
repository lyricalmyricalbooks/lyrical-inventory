// @vitest-environment jsdom
//
// The app's real Sheets bridge talking to the real Apps Script.
//
// src/features/sheets-bridge.js is loaded as a module with the app shell
// (main.js) replaced by a small stand-in holding the books, and every request
// it makes is answered by apps-script/Code.gs running against an in-memory
// spreadsheet (tests/helpers/fake-spreadsheet.js). So "Sync all data", the
// tidy-up of rows the app no longer has, and the automatic expense rows are
// checked by what ends up in the sheet — not by what the code looks like.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { extractDecl } from './helpers/extract-decl.js';
import { loadAppsScript } from './helpers/fake-spreadsheet.js';

const SHEET_URL = 'https://script.google.com/macros/s/TESTDEPLOY/exec';

const app = vi.hoisted(() => ({ BOOKS: {}, states: {}, unsent: new Set() }));

vi.mock('../src/main.js', () => ({
  $: () => null,
  BOOKS: app.BOOKS,
  EXPECTED_SCRIPT_VERSION: 'v57',
  activeBook: 'zine',
  bookInSyncWithCloud: (id) => !app.unsent.has(id),
  checkSheetsVersion: () => {},
  getBook: () => app.BOOKS.zine,
  isAuthor: () => false,
  isTestBook: (b) => !!(b && (b.isTest || String(b.title).toLowerCase() === 'test')),
  isTestBookId: (id) => String(id).toLowerCase() === 'test',
  notifyUrl: '',
  saveState: async () => {},
  sheetsUrl: SHEET_URL,
  showToast: () => {},
  states: app.states,
  today: () => '2026-10-10',
}));

vi.mock('../src/features/shipping.js', async () => {
  const money = await import('../src/lib/money.js');
  const src = extractDecl('shippingPurchaseRowPayload');
  // The real builder, lifted from shipping.js (which itself needs the whole app).
  const shippingPurchaseRowPayload = new Function('cadEquivalentForSale', `${src}\nreturn shippingPurchaseRowPayload;`)(money.cadEquivalentForSale);
  return { shippingPurchaseRowPayload };
});

vi.mock('../src/features/sheets-simulator.js', () => ({ simulatePostToSheets: async () => ({ ok: true }) }));

// A fresh copy per test: the bridge remembers what the deployment can do for
// the rest of a session, and each test sets up its own deployment.
let bridge;

let gs;
let deployment; // what the fake deployment advertises

function routeFetchToAppsScript() {
  globalThis.fetch = vi.fn(async (url, init = {}) => {
    if (String(url).split('?')[0] !== SHEET_URL) throw new Error('unexpected fetch ' + url);
    let out;
    if ((init.method || 'GET').toUpperCase() === 'POST') {
      // The deployed script checks the caller's token; the harness treats the
      // caller as the publisher, so only the body matters here.
      out = JSON.parse(gs.ctx.doPost({ postData: { contents: init.body } }).getContent());
    } else {
      out = JSON.parse(gs.ctx.doGet({ parameter: {} }).getContent());
      out.capabilities = deployment(out.capabilities);
    }
    return { ok: true, status: 200, json: async () => out };
  });
}

// Deliver everything queued, the way the app's retry loop eventually would.
async function drainQueue() {
  for (let i = 0; i < 400 && bridge._sheetsQueue.length; i++) {
    const head = bridge._sheetsQueue[0];
    if (head) head.nextTryAt = 0;
    await bridge._processQueue();
    await new Promise(r => setTimeout(r, 0));
  }
  expect(bridge._sheetsQueue.length, 'queue should drain').toBe(0);
}

const ids = (tab) => gs.ss.dataRows(tab).map(r => r[0]).sort();

function sale(over = {}) {
  return { num: '#1001', chan: 'Website', qty: 1, price: 30, date: '2026-09-01', after: 99, sheetsId: 'evt-s1', ...over };
}

beforeEach(async () => {
  localStorage.clear();
  app.unsent.clear();
  vi.resetModules();
  bridge = await import('../src/features/sheets-bridge.js');
  for (const k of Object.keys(app.BOOKS)) delete app.BOOKS[k];
  for (const k of Object.keys(app.states)) delete app.states[k];
  app.BOOKS.zine = { id: 'zine', title: 'Night Zine', currency: 'CA$', accent: '#aa3344', maxPrint: 100 };
  app.states.zine = { stock: 99, hist: [], ledger: [], stores: [], expenses: [], artistPayouts: [], artistTransfers: [] };
  gs = loadAppsScript();
  deployment = (caps) => caps; // the v56 script as written
  routeFetchToAppsScript();
});

describe('Sync all data makes the sheet match the app', () => {
  it('sends sales, postage, consignment, expenses and artist payments to the book tab', async () => {
    const s = app.states.zine;
    s.hist.push(sale({ shippingPaid: 8 }));
    s.ledger.push({ id: 1, storeId: 9, storeName: 'Rooneys', type: 'Sale', date: '2026-09-03', qty: 2, rate: 40, amountDue: 36, status: 'pending', sheetsId: 'evt-c1' });
    s.expenses.push({ id: 501, desc: 'Risograph master', cat: 'Printing', amount: 120, currency: 'CAD', date: '2026-08-20', ref: 'INV-77' });
    s.artistPayouts.push({ id: 'p1', date: '2026-09-15', amount: 50, method: 'E-transfer', notes: 'September', cur: 'CAD' });

    await bridge.pushAllToSheets({ skipConfirm: true });
    await drainQueue();

    expect(ids('Night Zine')).toEqual(['evt-c1', 'evt-s1', 'evt-s1-shipping', 'exp-zine-501', 'payout-zine-p1']);
    expect(ids('Overview')).toEqual(ids('Night Zine'));
    const rows = gs.ss.dataRows('Night Zine');
    const byId = Object.fromEntries(rows.map(r => [r[0], r]));
    const C = gs.COL;
    expect(byId['exp-zine-501'][C.Type - 1]).toBe('expense');
    expect(byId['exp-zine-501'][C['Store/Chan'] - 1]).toBe('Printing');
    expect(byId['exp-zine-501'][C['CAD Equivalent'] - 1]).toBe(120);
    expect(byId['payout-zine-p1'][C.Type - 1]).toBe('payout');
    // The rows are in date order on the sheet.
    expect(rows.map(r => r[C.Date - 1].toISOString().slice(0, 10)))
      .toEqual(['2026-08-20', '2026-09-01', '2026-09-01', '2026-09-03', '2026-09-15']);
  });

  it('keeps money going out out of revenue in the key numbers', async () => {
    const s = app.states.zine;
    s.hist.push(sale({ shippingPaid: 8 }));
    s.expenses.push({ id: 501, desc: 'Paper', cat: 'Printing', amount: 120, currency: 'CAD', date: '2026-08-20' });
    s.artistPayouts.push({ id: 'p1', date: '2026-09-15', amount: 50, cur: 'CAD' });
    await bridge.pushAllToSheets({ skipConfirm: true });
    await drainQueue();

    const kpi = gs.ctx.computeOverviewKpis_(gs.ss.getSheetByName('Overview'), 'UTC');
    expect(kpi.revenueCAD).toBe(38);
    expect(kpi.bookCAD).toBe(30);
    expect(kpi.shippingCAD).toBe(8);
    expect(kpi.expenseCAD).toBe(120);
    expect(kpi.payoutCAD).toBe(50);
  });

  it('gives a record without an id one, so pressing Sync all data twice does not duplicate it', async () => {
    // A CSV-imported order from before this fix: no id.
    app.states.zine.hist.push(sale({ sheetsId: undefined, num: '#CSV-1' }));
    await bridge.pushAllToSheets({ skipConfirm: true });
    await drainQueue();
    await bridge.pushAllToSheets({ skipConfirm: true });
    await drainQueue();

    expect(gs.ss.dataRows('Night Zine')).toHaveLength(1);
    expect(app.states.zine.hist[0].sheetsId).toMatch(/^evt-/);
  });

  it('removes rows of records that left the app, and nothing else', async () => {
    const s = app.states.zine;
    s.hist.push(sale(), sale({ num: '#1002', sheetsId: 'evt-s2' }));
    await bridge.pushAllToSheets({ skipConfirm: true });
    await drainQueue();

    // Rows the sync must not touch: one the publisher typed into the sheet by
    // hand (no id), a book this device does not have, and a connection check.
    gs.ss.raw('Night Zine').appendRow(['', '2026-09-02', 'Night Zine', 'order', 'HAND-1', 'Fair', 1, 'CAD', 5, 5, 5, 'OK', 'typed in', '']);
    gs.post({ eventId: 'evt-other', action: 'add', payload: { action: 'add', type: 'order', book: 'Other Book', date: '2026-09-01', num: '#9', qty: 1, price: 1, total: 1, currency: 'CAD', sheetsId: 'evt-other' } });
    gs.post({ eventId: 'conn-test-1', action: 'add', payload: { action: 'add', type: 'order', book: 'Night Zine', date: '2026-09-01', num: 'TEST-1', qty: 0, price: 0, total: 0, currency: 'CAD', sheetsId: 'conn-test-1' } });

    // #1002 leaves the app without being voided (say, cleaned up as a duplicate).
    s.hist = s.hist.filter(h => h.sheetsId !== 'evt-s2');
    await bridge.pushAllToSheets({ skipConfirm: true });
    await drainQueue();

    const tab = gs.ss.dataRows('Night Zine').map(r => r[0] || r[4]).sort();
    expect(tab).toEqual(['HAND-1', 'conn-test-1', 'evt-s1']);
    expect(ids('Other Book')).toEqual(['evt-other']);
    expect(ids('Overview')).not.toContain('evt-s2');
  });

  it('keeps a sale recorded while the sync was still sending', async () => {
    app.states.zine.hist.push(sale());
    await bridge.pushAllToSheets({ skipConfirm: true });
    // Before the queue drains, a new sale is recorded and written live.
    app.states.zine.hist.push(sale({ num: '#1003', sheetsId: 'evt-s3' }));
    bridge.syncToSheets({ type: 'order', book: 'Night Zine', date: '2026-09-04', num: '#1003', chan: 'Fair', qty: 1, price: 30, total: 30, currency: 'CAD', sheetsId: 'evt-s3' });
    await drainQueue();
    expect(ids('Night Zine')).toEqual(['evt-s1', 'evt-s3']);
  });

  it('skips the tidy-up if it waited too long to send', async () => {
    app.states.zine.hist.push(sale());
    gs.post({ eventId: 'evt-gone', action: 'add', payload: { action: 'add', type: 'order', book: 'Night Zine', date: '2026-09-01', num: '#0', qty: 1, price: 1, total: 1, currency: 'CAD', sheetsId: 'evt-gone' } });
    await bridge.pushAllToSheets({ skipConfirm: true });
    const prune = bridge._sheetsQueue.find(i => i.payload && i.payload.action === 'prune');
    expect(prune).toBeTruthy();
    prune.queuedAt = Date.now() - 16 * 60 * 1000;
    await drainQueue();
    expect(ids('Night Zine')).toContain('evt-gone');
  });

  it('never tidies a book this device could not load', async () => {
    app.states.zine.hist.push(sale());
    await bridge.pushAllToSheets({ skipConfirm: true });
    await drainQueue();
    Object.defineProperty(app.states.zine, '_loadFailed', { value: true, configurable: true });
    await bridge.pushAllToSheets({ skipConfirm: true });
    await drainQueue();
    expect(ids('Night Zine')).toEqual(['evt-s1']);
  });

  it('leaves alone a book that still has a change waiting to upload', async () => {
    app.states.zine.hist.push(sale());
    gs.post({ eventId: 'evt-b', action: 'add', payload: { action: 'add', type: 'order', book: 'Night Zine', date: '2026-09-02', num: '#B', qty: 1, price: 1, total: 1, currency: 'CAD', sheetsId: 'evt-b' } });
    // That row came from another device, whose sale this device has not received:
    // its own unsent change makes it ignore the cloud copy until it uploads.
    app.unsent.add('zine');
    await bridge.pushAllToSheets({ skipConfirm: true });
    await drainQueue();
    expect(ids('Night Zine')).toEqual(['evt-b', 'evt-s1']);
  });

  it('sends only sales rows to a deployment older than v56, and asks it to tidy nothing', async () => {
    deployment = (caps) => { const c = { ...caps }; delete c.expenseRows; delete c.pruneOrphans; return c; };
    app.states.zine.hist.push(sale());
    app.states.zine.expenses.push({ id: 501, desc: 'Paper', cat: 'Printing', amount: 120, currency: 'CAD', date: '2026-08-20' });
    await bridge.pushAllToSheets({ skipConfirm: true });
    expect(bridge._sheetsQueue.some(i => i.payload && i.payload.action === 'prune')).toBe(false);
    await drainQueue();
    expect(ids('Night Zine')).toEqual(['evt-s1']);
  });
});

describe('expenses and artist payments reach the sheet on their own', () => {
  it('adds, updates and removes rows as the book changes, sending only the difference', async () => {
    const s = app.states.zine;
    s.expenses.push({ id: 501, desc: 'Paper', cat: 'Printing', amount: 120, currency: 'CAD', date: '2026-08-20' });
    s.artistPayouts.push({ id: 'p1', date: '2026-09-15', amount: 50, cur: 'CAD' });
    await bridge.syncMoneyOutRows('zine');
    await drainQueue();
    expect(ids('Night Zine')).toEqual(['exp-zine-501', 'payout-zine-p1']);

    // Nothing changed: nothing is sent.
    const posts = () => globalThis.fetch.mock.calls.filter(([, init]) => init && init.method === 'POST').length;
    const before = posts();
    await bridge.syncMoneyOutRows('zine');
    await drainQueue();
    expect(posts()).toBe(before);

    // The expense is corrected, the payout deleted.
    s.expenses[0].amount = 135;
    s.artistPayouts = [];
    await bridge.syncMoneyOutRows('zine');
    await drainQueue();
    expect(ids('Night Zine')).toEqual(['exp-zine-501']);
    expect(gs.ss.dataRows('Night Zine')[0][gs.COL['Total/Amount'] - 1]).toBe(135);
  });

  it('a foreign-currency expense carries the CAD value the app holds, or none', async () => {
    const s = app.states.zine;
    s.expenses.push({ id: 1, desc: 'Ink', cat: 'Printing', amount: 100, currency: 'EUR', baseAmount: 151.2, date: '2026-08-01' });
    s.expenses.push({ id: 2, desc: 'Fair fee', cat: 'Fairs', amount: 40, currency: 'USD', fxRate: 1.37, date: '2026-08-02' });
    await bridge.syncMoneyOutRows('zine');
    await drainQueue();
    const cad = Object.fromEntries(gs.ss.dataRows('Night Zine').map(r => [r[0], r[gs.COL['CAD Equivalent'] - 1]]));
    expect(cad['exp-zine-1']).toBe(151.2);
    expect(cad['exp-zine-2']).toBe(54.8);
  });

  it('stays quiet for an older deployment, then catches up once it is redeployed', async () => {
    deployment = (caps) => { const c = { ...caps }; delete c.expenseRows; return c; };
    app.states.zine.expenses.push({ id: 501, desc: 'Paper', cat: 'Printing', amount: 120, currency: 'CAD', date: '2026-08-20' });
    await bridge.syncMoneyOutRows('zine');
    await drainQueue();
    expect(ids('Night Zine')).toEqual([]);
  });

  it('never sends the practice book', async () => {
    app.BOOKS.test = { id: 'test', title: 'Test', isTest: true };
    app.states.test = { hist: [], ledger: [], expenses: [{ id: 1, amount: 5, currency: 'CAD', date: '2026-01-01' }], artistPayouts: [] };
    await bridge.syncMoneyOutRows('test');
    await drainQueue();
    expect(gs.ss.raw('Test')).toBeNull();
  });
});

describe('the sheet itself', () => {
  it('advertises v57 and the sync abilities', () => {
    const caps = gs.get({});
    expect(caps.scriptVersion).toBe('v57');
    expect(caps.capabilities.pruneOrphans).toBe(true);
    expect(caps.capabilities.expenseRows).toBe(true);
  });

  it('applies a bulk batch as if its rows arrived one by one', () => {
    const row = (over) => ({ action: 'add', type: 'order', book: 'Night Zine', date: '2026-09-01', num: '#1', qty: 1, price: 30, total: 30, currency: 'CAD', sheetsId: 'evt-1', ...over });
    gs.post({ eventId: 'evt-old', action: 'add', payload: row({ sheetsId: 'evt-old' }) });
    const res = gs.post({ eventId: 'b1', action: 'batch', payload: { action: 'batch', rows: [
      row(), row({ total: 45 }),                                   // same id twice: one row, the later one
      row({ sheetsId: 'evt-2' }), { action: 'delete', sheetsId: 'evt-2' }, // added then deleted: gone
      row({ sheetsId: 'evt-old', total: 12 }), row({ sheetsId: 'evt-old', total: 13 }), // existing row replaced once
    ] } });
    expect(res.ok).toBe(true);
    const tab = gs.ss.dataRows('Night Zine').map(r => [r[0], r[gs.COL['Total/Amount'] - 1]]).sort();
    expect(tab).toEqual([['evt-1', 45], ['evt-old', 13]]);
    expect(gs.ss.dataRows('Overview')).toHaveLength(2);
  });

  it('can clear a tab that has grown past its first 1000 rows', () => {
    for (let b = 0; b < 1050; b += 60) {
      const rows = [];
      for (let i = b; i < Math.min(1050, b + 60); i++) {
        rows.push({ action: 'add', type: 'order', book: 'Night Zine', date: '2026-09-01', num: '#' + i, qty: 1, price: 1, total: 1, currency: 'CAD', sheetsId: 'evt-' + i });
      }
      expect(gs.post({ eventId: 'b' + b, action: 'batch', payload: { action: 'batch', rows } }).ok).toBe(true);
    }
    const overview = gs.ss.raw('Overview');
    expect(overview.getMaxRows()).toBe(overview.getLastRow()); // the grid fits the data exactly

    const res = gs.post({ eventId: 'reset', action: 'reset', payload: { action: 'reset' } });
    expect(res.error).toBeUndefined();
    expect(res.cleared).toBe(2100);
    expect(gs.ss.dataRows('Overview')).toHaveLength(0);
    expect(gs.ss.dataRows('Night Zine')).toHaveLength(0);
  });

  it('can replace the only row of a tab whose grid is full', () => {
    const row = { action: 'add', type: 'order', book: 'Night Zine', date: '2026-09-01', num: '#1', qty: 1, price: 30, total: 30, currency: 'CAD', sheetsId: 'evt-1' };
    gs.post({ eventId: 'evt-1', action: 'add', payload: row });
    const tab = gs.ss.raw('Night Zine');
    tab.maxRows = tab.getLastRow(); // header + one row, nothing spare
    const res = gs.post({ eventId: 'evt-1', action: 'add', payload: { ...row, total: 31 } });
    expect(res.error).toBeUndefined();
    expect(gs.ss.dataRows('Night Zine').map(r => r[gs.COL['Total/Amount'] - 1])).toEqual([31]);
  });

  it('keeps Overview its own colour and colours tabs a bulk sync creates', () => {
    gs.post({ eventId: 'evt-1', action: 'add', payload: { action: 'add', type: 'order', book: 'Night Zine', date: '2026-09-01', qty: 1, price: 1, total: 1, currency: 'CAD', sheetsId: 'evt-1', bookColor: '#aa3344' } });
    gs.post({ eventId: 'b', action: 'batch', payload: { action: 'batch', rows: [
      { action: 'add', type: 'order', book: 'Blue Book', date: '2026-09-01', qty: 1, price: 1, total: 1, currency: 'CAD', sheetsId: 'evt-2', bookColor: '#2244aa' },
    ] } });
    expect(gs.ss.raw('Night Zine').tabColor).toBe('#aa3344');
    expect(gs.ss.raw('Blue Book').tabColor).toBe('#2244aa');
    expect(gs.ss.raw('Overview').tabColor).toBeNull();
  });

  it('refuses a malformed tidy-up instead of deleting rows', () => {
    gs.post({ eventId: 'evt-1', action: 'add', payload: { action: 'add', type: 'order', book: 'Night Zine', date: '2026-09-01', qty: 1, price: 1, total: 1, currency: 'CAD', sheetsId: 'evt-1' } });
    const res = gs.post({ eventId: 'p', action: 'prune', payload: { action: 'prune', books: ['Night Zine'] } });
    expect(res.error).toMatch(/list of ids/);
    expect(ids('Night Zine')).toEqual(['evt-1']);
  });

  it('counts only income on the summary currency table', () => {
    gs.post({ eventId: 'evt-1', action: 'add', payload: { action: 'add', type: 'order', book: 'Night Zine', date: '2026-09-01', qty: 1, price: 1, total: 1, currency: 'CAD', sheetsId: 'evt-1' } });
    const summary = gs.ss.raw('__Summary');
    const cadRow = summary.rows.find(r => r && r[0] === 'CAD');
    for (const formula of cadRow.slice(1, 4)) {
      expect(formula).toContain('"order"');
      expect(formula).toContain('"shipping"');
      expect(formula).toContain('"consignment"');
      expect(formula).toContain('"Sale"');
      expect(formula).not.toContain('"expense"');
    }
  });
});

describe('restore from the sheet', () => {
  it('reads the book tab back, expense rows included, for the app to filter', () => {
    gs.post({ eventId: 'b', action: 'batch', payload: { action: 'batch', rows: [
      { action: 'add', type: 'order', book: 'Night Zine', date: '2026-09-01', num: '#1', qty: 1, price: 30, total: 30, currency: 'CAD', sheetsId: 'evt-1' },
      { action: 'add', type: 'shipping', book: 'Night Zine', date: '2026-09-01', num: '#1', total: 8, currency: 'CAD', sheetsId: 'evt-1-shipping' },
      { action: 'add', type: 'expense', book: 'Night Zine', date: '2026-08-01', num: '', chan: 'Printing', total: 5, currency: 'CAD', sheetsId: 'exp-zine-1' },
    ] } });
    const back = gs.get({ action: 'getBookData', book: 'Night Zine' });
    expect(back.rows.map(r => r.Type)).toEqual(['expense', 'order', 'shipping']);
  });
});


describe('v57: duplicates, renames, speed and the last-sync line', () => {
  const order = (over = {}) => ({ action: 'add', type: 'order', book: 'Night Zine', date: '2026-09-01', num: '#1001', chan: 'Website', qty: 1, price: 30, total: 30, currency: 'CAD', sheetsId: 'evt-s1', ...over });

  it('Sync all data removes id-less copies an older sync left behind, and keeps hand-typed rows', async () => {
    app.states.zine.hist.push(sale());
    await bridge.pushAllToSheets({ skipConfirm: true });
    await drainQueue();
    // Two copies of #1001 written before ids existed, plus a hand-typed row.
    const tab = gs.ss.raw('Night Zine');
    const copy = [...tab.rows[1]];
    copy[0] = '';
    tab.appendRow(copy);
    tab.appendRow(copy);
    gs.ss.raw('Overview').appendRow(copy);
    tab.appendRow(['', '2026-09-01', 'Night Zine', 'order', 'HAND-1', 'Fair', 1, 'CAD', 30, 30, 30, 'OK', '', '']);

    await bridge.pushAllToSheets({ skipConfirm: true });
    await drainQueue();
    expect(gs.ss.dataRows('Night Zine').map(r => r[0] || r[4]).sort()).toEqual(['HAND-1', 'evt-s1']);
    expect(gs.ss.dataRows('Overview').map(r => r[0] || r[4]).sort()).toEqual(['evt-s1']);
  });

  it('renaming a book moves its tab and relabels its rows', async () => {
    gs.post({ eventId: 'b', action: 'batch', payload: { action: 'batch', rows: [order(), order({ sheetsId: 'evt-s2', num: '#1002' })] } });
    await bridge.queueSheetsRename('Night Zine', 'Night Zine (2nd ed.)', '#aa3344');
    await drainQueue();
    expect(gs.ss.raw('Night Zine')).toBeNull();
    const renamed = gs.ss.dataRows('Night Zine (2nd ed.)');
    expect(renamed.map(r => r[gs.COL.Book - 1])).toEqual(['Night Zine (2nd ed.)', 'Night Zine (2nd ed.)']);
    expect(gs.ss.dataRows('Overview').every(r => r[gs.COL.Book - 1] === 'Night Zine (2nd ed.)')).toBe(true);
    expect(gs.ss.raw('Night Zine (2nd ed.)').tabColor).toBe('#aa3344');
    // A restore under the new title finds the whole history.
    expect(gs.get({ action: 'getBookData', book: 'Night Zine (2nd ed.)' }).rows).toHaveLength(2);
  });

  it('a rename onto a title that already has a tab joins the two', () => {
    gs.post({ eventId: 'a', action: 'add', payload: order() });
    gs.post({ eventId: 'b', action: 'add', payload: order({ book: 'Day Zine', sheetsId: 'evt-d1', date: '2026-08-01' }) });
    const res = gs.post({ eventId: 'r', action: 'renamebook', payload: { action: 'renamebook', from: 'Night Zine', to: 'Day Zine' } });
    expect(res).toMatchObject({ ok: true, rows: 2, tab: true });
    expect(gs.ss.raw('Night Zine')).toBeNull();
    expect(ids('Day Zine')).toEqual(['evt-d1', 'evt-s1']);
  });

  it('an older script is not sent a rename it would mistake for a sale', async () => {
    deployment = (caps) => { const c = { ...caps }; delete c.renameBook; return c; };
    gs.post({ eventId: 'a', action: 'add', payload: order() });
    await bridge.queueSheetsRename('Night Zine', 'New Title');
    expect(bridge._sheetsQueue).toHaveLength(0);
  });

  it('lays out the summary once, then only updates its numbers', () => {
    gs.post({ eventId: 'a', action: 'add', payload: order() });
    const summary = gs.ss.raw('__Summary');
    const clearsAfterFirst = summary.clearCalls || 0;
    gs.post({ eventId: 'b', action: 'add', payload: order({ sheetsId: 'evt-s2', num: '#1002', total: 20, price: 20 }) });
    gs.post({ eventId: 'c', action: 'add', payload: order({ sheetsId: 'evt-s3', num: '#1003', total: 5, price: 5 }) });
    expect(summary.clearCalls || 0).toBe(clearsAfterFirst);
    const revenue = summary.rows.find(r => r && r[5] === 'Revenue (CAD)');
    expect(revenue[6]).toBe(55);
    const monthly = gs.ss.raw('Monthly (CAD)');
    expect(monthly.rows[1][0]).toBe('2026-09');
    expect(monthly.rows[1][1]).toBe(55);
  });

  it('a write sent with more queued behind it leaves the totals to the last one', () => {
    gs.post({ eventId: 'a', action: 'add', payload: order() });
    const revenue = () => gs.ss.raw('__Summary').rows.find(r => r && r[5] === 'Revenue (CAD)')[6];
    const res = gs.post({ eventId: 'b', action: 'add', deferSummary: true, payload: order({ sheetsId: 'evt-s2', num: '#1002' }) });
    expect(res.summaryDeferred).toBe(true);
    expect(revenue()).toBe(30);
    gs.post({ eventId: 'c', action: 'add', payload: order({ sheetsId: 'evt-s3', num: '#1003' }) });
    expect(revenue()).toBe(90);
  });

  it('the app marks a write as deferrable only while another waits behind it', async () => {
    for (const n of [1, 2, 3]) bridge.syncToSheets(order({ sheetsId: 'evt-q' + n, num: '#' + n }));
    await drainQueue();
    const posts = globalThis.fetch.mock.calls
      .filter(([, init]) => init && init.method === 'POST')
      .map(([, init]) => JSON.parse(init.body));
    // The first sale goes out alone, before the next two are queued; the second
    // has the third behind it; the third is last and refreshes the totals.
    expect(posts.map(p => !!p.deferSummary)).toEqual([false, true, false]);
    expect(gs.ss.raw('__Summary').rows.find(r => r && r[5] === 'Revenue (CAD)')[6]).toBe(90);
  });

  it('remembers when a Sync all data finished and whether everything arrived', async () => {
    app.states.zine.hist.push(sale());
    expect(bridge.lastFullSyncText(null, 0)).toMatch(/hasn't run Sync all data/);
    await bridge.pushAllToSheets({ skipConfirm: true });
    await drainQueue();
    const saved = JSON.parse(localStorage.getItem('lm-sheets-last-full-sync-v1'));
    expect(saved).toMatchObject({ url: SHEET_URL, total: 1, failed: 0 });
    expect(bridge.lastFullSyncText(saved, 0)).toMatch(/every record reached the sheet\.$/);
    expect(bridge.lastFullSyncText({ ...saved, failed: 2 }, 3))
      .toMatch(/2 records didn't reach the sheet\. Tap Sync all data to send them again\. 3 changes are still waiting to send\.$/);
  });
});
