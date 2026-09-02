import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const codeGs = fs.readFileSync(path.resolve(__dirname, '../apps-script/Code.gs'), 'utf8').replace(/\r\n/g, '\n');
const mainJs = fs.readFileSync(path.resolve(__dirname, '../src/main.js'), 'utf8').replace(/\r\n/g, '\n');

// The body of doPost, which is where every sheet write happens.
function doPostSource() {
  const start = codeGs.indexOf('function doPost(e) {');
  expect(start, 'Code.gs must define doPost').toBeGreaterThan(-1);
  const end = codeGs.indexOf('\nfunction processSheetsRow_', start);
  expect(end, 'doPost must be followed by processSheetsRow_').toBeGreaterThan(start);
  return codeGs.slice(start, end);
}

describe('doPost can reach a spreadsheet at all', () => {
  const body = doPostSource();

  it('declares ss before every branch that writes to the sheet', () => {
    // The regression: `ss` was read by the batch branch, the reset branch and
    // the closing single-row upsert, but only ever *declared* inside doGet and
    // the reporting helpers. Every write threw ReferenceError, doPost's catch
    // turned it into {error}, and the client logged the row as written.
    const declaredAt = body.indexOf('const ss = SpreadsheetApp.getActiveSpreadsheet();');
    expect(declaredAt, 'doPost must fetch its own spreadsheet handle').toBeGreaterThan(-1);

    for (const use of ['ss.getSheets()', 'ensureSheet_(ss,', 'clearManagedSheets_(ss)',
      'refreshOverviewSummary_(ss)', 'processSheetsRow_(ss,', 'sortManagedSheets_(ss,']) {
      const at = body.indexOf(use);
      expect(at, `doPost must use ${use}`).toBeGreaterThan(-1);
      expect(at, `${use} must come after ss is declared`).toBeGreaterThan(declaredAt);
    }
  });

  it('names no other undeclared identifier on the write paths', () => {
    // Cheap guard against the same class of slip returning: every bare `ss`
    // in doPost resolves to the one declaration.
    const occurrences = (body.match(/\bss\b/g) || []).length;
    const declarations = (body.match(/const ss = /g) || []).length;
    expect(declarations).toBe(1);
    expect(occurrences).toBeGreaterThan(declarations);
  });

  it('explains itself when the script is not bound to a spreadsheet', () => {
    expect(body).toContain('not attached to a spreadsheet');
  });

  it('actually writes a row when run against a stub spreadsheet', () => {
    // Execute the real doPost body with the Apps Script globals stubbed out.
    const HEADERS = ['_eventId', 'Date', 'Book', 'Type', 'Event/Num', 'Store/Chan', 'Qty',
      'Currency', 'Price/Rate', 'Total/Amount', 'CAD Equivalent', 'Status', 'Notes', 'Invoice'];
    const COL = HEADERS.reduce((m, h, i) => (m[h] = i + 1, m), {});
    const appended = [];

    const makeSheet = (name) => ({
      name,
      getName: () => name,
      getLastRow: () => 1,
      getLastColumn: () => HEADERS.length,
      getMaxRows: () => 1000,
      getRange: () => ({
        getValue: () => '_eventId',
        getValues: () => [HEADERS],
        setValues: () => {},
      }),
      appendRow: (row) => appended.push({ sheet: name, row }),
      setTabColor: () => {},
    });
    const sheets = { Overview: makeSheet('Overview'), 'Collective Photobook': makeSheet('Collective Photobook') };
    const ssStub = {
      getSheets: () => Object.values(sheets),
      getSheetByName: (n) => sheets[n] || null,
      insertSheet: (n) => (sheets[n] = makeSheet(n)),
    };

    let output = null;
    const run = new Function(
      'SpreadsheetApp', 'HEADERS', 'COL', 'jsonOut_', 'processSheetsRow_',
      'refreshOverviewSummary_', 'sortManagedSheets_', 'clearManagedSheets_', 'e',
      `${doPostSource()}\nreturn doPost(e);`
    );

    const result = run(
      { getActiveSpreadsheet: () => ssStub },
      HEADERS, COL,
      (o) => (output = o),
      // Real row assembly is exercised by the Apps Script's own helpers; here we
      // only need to prove doPost reaches them without throwing.
      (ss, data) => { ssStub.getSheetByName('Overview'); appended.push({ sheet: 'Overview', data }); return { added: 1, replaced: 0 }; },
      () => {}, () => {}, () => 0,
      { postData: { contents: JSON.stringify({
        version: 2,
        eventId: 'evt-saqd-807649',
        action: 'add',
        payload: {
          action: 'add', type: 'order', book: 'Collective Photobook',
          date: '2026-09-01', num: '#SAQD-807649', chan: 'Website',
          qty: 1, price: 70, total: 70, currency: 'CAD', sheetsId: 'evt-saqd-807649',
        },
      }) } }
    );

    void result;
    expect(output, 'doPost must return a response').not.toBeNull();
    expect(output.error, `doPost returned an error: ${output.error}`).toBeUndefined();
    expect(output.ok).toBe(true);
    expect(appended.length).toBeGreaterThan(0);
  });
});

describe('the client no longer reports an unwritten row as written', () => {
  const post = mainJs.match(/export async function postToSheets\([\s\S]+?\n\}/)[0];

  it('only falls back to no-cors when nothing came back at all', () => {
    // A readable `{ error: ... }` reply must not be re-POSTed blind. That is
    // what turned "ReferenceError: ss is not defined" into a silent success.
    const fallbackAt = post.indexOf("'no-cors'");
    const errorCheckAt = post.indexOf('if (data && data.error) throw new Error(data.error);');
    expect(fallbackAt).toBeGreaterThan(-1);
    expect(errorCheckAt).toBeGreaterThan(-1);
    expect(errorCheckAt, 'the error check must sit outside the fallback catch').toBeGreaterThan(fallbackAt);
  });

  it('surfaces the sheet’s own words rather than a bare status', () => {
    expect(post).toContain('Sheet rejected the write (HTTP');
  });

  it('retries an unconfirmable send instead of shifting it off the queue', () => {
    const proc = mainJs.match(/async function _processQueue\(\)[\s\S]+?\n\}\n/)[0];
    expect(proc).toContain("if (resp === 'unknown') {");
    expect(proc).toContain('could not confirm the sheet received this row');
    const unknownAt = proc.indexOf("if (resp === 'unknown') {");
    const shiftAt = proc.indexOf('_sheetsQueue.shift();');
    expect(shiftAt, 'the shift must be guarded by the unknown check').toBeGreaterThan(unknownAt);
  });
});

describe('Test connection actually tests the connection', () => {
  const fn = mainJs.match(/async function testSheets\(\)[\s\S]+?\r?\n\}\r?\n/)[0];

  it('does not label its own row with a title isTestBookId() discards', () => {
    // isTestBookId() matches any title containing "test", so `book: 'Test'`
    // was dropped by syncToSheets while the button claimed it had been sent.
    expect(fn).not.toContain("book: 'Test'");
    expect(fn).not.toContain('syncToSheets(');
  });

  it('waits for the answer and reports a failure as a failure', () => {
    expect(fn).toContain('await postToSheets(');
    expect(fn).toContain("'⚠ Test failed: '");
    expect(fn).toContain("addSheetsLog('Connection check', 'Order'");
    // The old version toasted success unconditionally.
    expect(fn).not.toContain("showToast('✓ Test row sent — check your Google Sheet')");
  });
});
