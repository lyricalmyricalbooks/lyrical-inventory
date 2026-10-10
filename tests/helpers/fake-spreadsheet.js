// A small in-memory stand-in for the parts of Google Apps Script that the
// Sheets sync in apps-script/Code.gs touches, so the real script can be run
// end to end in a test: rows written, deleted, sorted and summarised exactly as
// the deployed web app would, without a Google account.
//
// It models the behaviour that matters for correctness — the grid size, frozen
// rows, appendRow growing the grid, setValues refusing to write past it, and
// deleteRows refusing to remove every non-frozen row (the real error text) —
// and treats every formatting call as a chainable no-op.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const CODE_GS_PATH = path.resolve(__dirname, '../../apps-script/Code.gs');

// Anything not modelled returns the same object, so `.setFontWeight().setBackground()`
// chains keep working.
function chainable(target) {
  const proxy = new Proxy(target, {
    get(obj, prop) {
      if (prop in obj) return obj[prop];
      if (typeof prop === 'symbol') return undefined;
      return () => proxy;
    },
  });
  return proxy;
}

const ISO_DAY = /^(\d{4})-(\d{2})-(\d{2})$/;

// Sheets turns a typed "2026-09-01" into a real date cell; so does setValues.
function cellValue(v) {
  if (typeof v === 'string') {
    const m = v.match(ISO_DAY);
    if (m) return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  }
  return v === undefined || v === null ? '' : v;
}

function isBlank(v) { return v === '' || v === null || v === undefined; }

function createSheet(name) {
  const sheet = {
    name,
    rows: [],          // rows[i] is spreadsheet row i + 1
    maxRows: 1000,
    frozenRows: 0,
    tabColor: null,
    getName: () => sheet.name,
    getLastRow() {
      for (let i = sheet.rows.length - 1; i >= 0; i--) {
        if ((sheet.rows[i] || []).some(v => !isBlank(v))) return i + 1;
      }
      return 0;
    },
    getLastColumn() {
      let last = 0;
      sheet.rows.forEach(r => (r || []).forEach((v, c) => { if (!isBlank(v)) last = Math.max(last, c + 1); }));
      return last;
    },
    getMaxRows: () => sheet.maxRows,
    getMaxColumns: () => 26,
    setFrozenRows(n) { sheet.frozenRows = n; return sheet.api; },
    getFrozenRows: () => sheet.frozenRows,
    setTabColor(c) { sheet.tabColor = c; return sheet.api; },
    getTabColor: () => sheet.tabColor,
    getRange(row, col, numRows = 1, numCols = 1) {
      if (typeof row !== 'number') throw new Error('fake sheet: A1 notation is not modelled');
      return makeRange(sheet, row, col, numRows, numCols);
    },
    deleteRows(start, count) {
      if (start < 1 || start + count - 1 > sheet.maxRows) throw new Error('Those rows are out of bounds.');
      if (count >= sheet.maxRows - sheet.frozenRows) {
        throw new Error('Sorry, it is not possible to delete all non-frozen rows.');
      }
      sheet.rows.splice(start - 1, count);
      sheet.maxRows -= count;
      sheet.deleteCalls = (sheet.deleteCalls || 0) + 1;
      return sheet.api;
    },
    deleteRow(r) { return sheet.deleteRows(r, 1); },
    insertRowBefore(r) {
      while (sheet.rows.length < r - 1) sheet.rows.push([]);
      sheet.rows.splice(r - 1, 0, []);
      sheet.maxRows += 1;
      return sheet.api;
    },
    insertRowAfter(r) { return sheet.insertRowsAfter(r, 1); },
    insertRowsAfter(r, n) {
      while (sheet.rows.length < r) sheet.rows.push([]);
      sheet.rows.splice(r, 0, ...Array.from({ length: n }, () => []));
      sheet.maxRows += n;
      return sheet.api;
    },
    appendRow(values) {
      const at = sheet.getLastRow();
      if (at >= sheet.maxRows) sheet.maxRows = at + 1;
      while (sheet.rows.length < at) sheet.rows.push([]);
      sheet.rows[at] = values.map(cellValue);
      return sheet.api;
    },
    clear() { sheet.rows = []; return sheet.api; },
    getProtections: () => [],
    getConditionalFormatRules: () => [],
  };
  sheet.api = chainable(sheet);
  return sheet;
}

function makeRange(sheet, row, col, numRows, numCols) {
  const range = {
    getValues() {
      const out = [];
      for (let r = 0; r < numRows; r++) {
        const src = sheet.rows[row - 1 + r] || [];
        const line = [];
        for (let c = 0; c < numCols; c++) {
          const v = src[col - 1 + c];
          line.push(isBlank(v) ? '' : v);
        }
        out.push(line);
      }
      return out;
    },
    getValue() { return range.getValues()[0][0]; },
    setValues(values) {
      if (values.length !== numRows || values.some(v => v.length !== numCols)) {
        throw new Error(`The number of rows or columns in the data does not match the range (${numRows}x${numCols}).`);
      }
      if (row - 1 + numRows > sheet.maxRows) throw new Error('Those rows are out of bounds.');
      for (let r = 0; r < numRows; r++) {
        const idx = row - 1 + r;
        while (sheet.rows.length <= idx) sheet.rows.push([]);
        const target = sheet.rows[idx] = (sheet.rows[idx] || []).slice();
        for (let c = 0; c < numCols; c++) target[col - 1 + c] = cellValue(values[r][c]);
      }
      return range.api;
    },
    // One value fills every cell of the range, as in Sheets.
    setValue(v) { return range.setValues(Array.from({ length: numRows }, () => Array(numCols).fill(v))); },
    setFormula(f) { return range.setValue(f); },
    clearContent() { return range.setValues(Array.from({ length: numRows }, () => Array(numCols).fill(''))); },
    getBandings: () => [],
    protect: () => chainable({}),
  };
  range.api = chainable(range);
  return range.api;
}

export function createFakeSpreadsheet({ name = 'Lyricalmyrical Inventory' } = {}) {
  const sheets = [];
  const ss = {
    sheets,
    getName: () => name,
    getSheets: () => sheets.map(s => s.api),
    getSheetByName: (n) => { const s = sheets.find(x => x.name === n); return s ? s.api : null; },
    insertSheet(n) {
      if (sheets.some(x => x.name === n)) throw new Error(`A sheet with the name "${n}" already exists.`);
      const s = createSheet(n);
      sheets.push(s);
      return s.api;
    },
    deleteSheet(api) { const i = sheets.findIndex(s => s.api === api); if (i >= 0) sheets.splice(i, 1); },
    getSpreadsheetTimeZone: () => 'UTC',
    // Test helpers (not Apps Script API).
    raw: (n) => sheets.find(x => x.name === n) || null,
    dataRows(n) {
      const s = sheets.find(x => x.name === n);
      if (!s) return [];
      return s.rows.slice(1, s.getLastRow()).filter(r => (r || []).some(v => !isBlank(v)));
    },
  };
  return ss;
}

function formatDate(date, tz, pattern) {
  const d = date instanceof Date ? date : new Date(date);
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz || 'UTC', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(d).reduce((m, p) => (m[p.type] = p.value, m), {});
  return pattern.replace('yyyy', parts.year).replace('MM', parts.month).replace('dd', parts.day);
}

function store() {
  const map = new Map();
  return {
    get: (k) => (map.has(k) ? map.get(k) : null),
    put: (k, v) => { map.set(k, String(v)); },
    getProperty: (k) => (map.has(k) ? map.get(k) : null),
    setProperty: (k, v) => { map.set(k, String(v)); },
    deleteProperty: (k) => { map.delete(k); },
    getProperties: () => Object.fromEntries(map),
  };
}

/**
 * Load the real apps-script/Code.gs against a fake spreadsheet.
 *
 * Returns `post(body)` / `get(params)` that call doPost / doGet and hand back
 * the parsed JSON reply. Callers are treated as the publisher (the Firebase
 * token check is stubbed), and outbound HTTP (FX lookups) answers with nothing
 * so conversions fall back the way an offline deployment's would.
 */
export function loadAppsScript({ ss = createFakeSpreadsheet(), source } = {}) {
  const code = source || fs.readFileSync(CODE_GS_PATH, 'utf8');
  const cache = store();
  const props = store();
  const ctx = {
    console: { log() {}, warn() {}, error() {} },
    SpreadsheetApp: {
      getActiveSpreadsheet: () => ss,
      newConditionalFormatRule: () => chainable({}),
      newDataValidation: () => chainable({}),
      BorderStyle: {}, BandingTheme: {}, ProtectionType: {},
      getUi: () => chainable({}),
    },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    Session: { getScriptTimeZone: () => 'UTC' },
    Utilities: {
      formatDate,
      base64EncodeWebSafe: (s) => Buffer.from(String(s)).toString('base64'),
      base64Encode: (s) => Buffer.from(String(s)).toString('base64'),
      computeDigest: (_a, s) => String(s),
      DigestAlgorithm: {},
    },
    CacheService: { getScriptCache: () => cache },
    PropertiesService: { getScriptProperties: () => props },
    UrlFetchApp: { fetch: () => ({ getResponseCode: () => 503, getContentText: () => '' }) },
    ContentService: {
      createTextOutput: (s) => ({ content: s, setMimeType() { return this; }, getContent() { return s; } }),
      MimeType: { JSON: 'json' },
    },
  };
  vm.createContext(ctx);
  vm.runInContext(`${code}\n;this.__gs = { HEADERS, COL };`, ctx, { filename: 'Code.gs' });
  ctx.requirePublisher_ = () => ({ uid: 'publisher', email: 'lyricalmyricalbooks@gmail.com' });
  ctx.verifyFirebaseCaller_ = ctx.requirePublisher_;

  const parse = (out) => JSON.parse(out.getContent());
  return {
    ctx,
    ss,
    HEADERS: ctx.__gs.HEADERS,
    COL: ctx.__gs.COL,
    post(body) {
      return parse(ctx.doPost({ postData: { contents: JSON.stringify({ version: 2, idToken: 't', ...body }) } }));
    },
    get(params = {}) {
      return parse(ctx.doGet({ parameter: { idToken: 't', ...params } }));
    },
  };
}
