import { describe, it, expect } from 'vitest';
import fs from 'fs';
// Receipt import moved to src/features/receipts.js. These assertions are about
// the behaviour, not which file holds it, so they read the whole app source.
import { appSource } from './helpers/extract-decl.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// This suite covers the "Import Receipts from Email" performance/correctness
// fixes: the retired-model bug in _callGeminiForReceipts, the UTC date-shift
// bug in normalizeReceiptDate that broke duplicate detection, the
// never-rejects extraction pool that gives per-email failure isolation, and
// the new batched Apps Script endpoints.
describe('Receipt import performance & correctness fixes', () => {
  const gasPath = path.resolve(__dirname, '../apps-script/Code.gs');
  const gasCopyPath = path.resolve(__dirname, '../public/gas-code.txt');

  const mainContent = appSource.replace(/^export\s+/gm, '');
  const gasContent = fs.readFileSync(gasPath, 'utf8');

  function extractFn(name, isAsync = false) {
    const marker = `${isAsync ? 'async ' : ''}function ${name}(`;
    const start = mainContent.indexOf(marker);
    expect(start, `${name} should be defined`).toBeGreaterThanOrEqual(0);

    // Find the parameter list's closing paren first — a default value like
    // `opts = {}` contains its own brace pair, so naively looking for the
    // first `{` after `start` finds that instead of the function body.
    let parenDepth = 0;
    let pi = mainContent.indexOf('(', start);
    for (; pi < mainContent.length; pi++) {
      if (mainContent[pi] === '(') parenDepth++;
      else if (mainContent[pi] === ')') { parenDepth--; if (parenDepth === 0) break; }
    }

    let depth = 0;
    let i = mainContent.indexOf('{', pi);
    for (; i < mainContent.length; i++) {
      if (mainContent[i] === '{') depth++;
      else if (mainContent[i] === '}') { depth--; if (depth === 0) break; }
    }
    return mainContent.slice(start, i + 1);
  }

  describe('normalizeReceiptDate — local time, not UTC', () => {
    const fnSrc = extractFn('normalizeReceiptDate');
    const normalizeReceiptDate = new Function(`${fnSrc}\nreturn normalizeReceiptDate;`)();

    it('does not roll an evening timestamp forward a day', () => {
      // toISOString() would shift this to the next UTC day in any zone west
      // of Greenwich, which broke exact-string duplicate matching.
      const d = new Date(2026, 2, 5, 22, 30, 0); // local March 5, 10:30pm
      const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}T${String(d.getHours()).padStart(2, '0')}:30:00`;
      expect(normalizeReceiptDate(iso)).toBe('2026-03-05');
    });

    it('passes through an already-clean YYYY-MM-DD unchanged', () => {
      expect(normalizeReceiptDate('2026-01-15')).toBe('2026-01-15');
    });

    it('returns empty string for unparseable input', () => {
      expect(normalizeReceiptDate('not a date')).toBe('');
      expect(normalizeReceiptDate('')).toBe('');
    });
  });

  describe('_parseReceiptAmount — coerces what the schema still lets through', () => {
    const fnSrc = extractFn('_parseReceiptAmount');
    const _parseReceiptAmount = new Function(`${fnSrc}\nreturn _parseReceiptAmount;`)();

    it('strips thousands separators and currency symbols', () => {
      expect(_parseReceiptAmount('1,234.56')).toBeCloseTo(1234.56);
      expect(_parseReceiptAmount('$45.00')).toBeCloseTo(45);
    });

    it('passes a real number through unchanged', () => {
      expect(_parseReceiptAmount(45.5)).toBe(45.5);
    });

    it('returns 0 for garbage instead of NaN', () => {
      expect(_parseReceiptAmount('free')).toBe(0);
      expect(_parseReceiptAmount(null)).toBe(0);
      expect(Number.isNaN(_parseReceiptAmount('free'))).toBe(false);
    });
  });

  describe('_parseReceiptJson — salvages truncated/fenced output without throwing', () => {
    const fnSrc = extractFn('_parseReceiptJson');
    const _parseReceiptJson = new Function(`${fnSrc}\nreturn _parseReceiptJson;`)();

    it('parses clean JSON', () => {
      expect(_parseReceiptJson('{"receipts":[{"vendor":"Acme"}]}').receipts[0].vendor).toBe('Acme');
    });

    it('salvages a markdown-fenced object', () => {
      const text = '```json\n{"receipts":[{"vendor":"Acme"}]}\n```';
      expect(_parseReceiptJson(text).receipts[0].vendor).toBe('Acme');
    });

    it('returns an empty receipts array instead of throwing on garbage', () => {
      expect(_parseReceiptJson('not json at all').receipts).toEqual([]);
      expect(_parseReceiptJson('').receipts).toEqual([]);
    });
  });

  describe('_draftsFromReceiptRows — reports drops instead of silently discarding', () => {
    // Depends on EXPENSE_CATEGORIES, inferReceiptCategory, normalizeReceiptDate,
    // today, _parseReceiptAmount, _selectedFileParts, _emailContentCache.
    const catMatch = mainContent.match(/const EXPENSE_CATEGORIES = \[[\s\S]+?\];/);
    const inferMatch = mainContent.match(/function inferReceiptCategory\([^)]*\)\s*\{[\s\S]+?\n\}/);
    const normDateSrc = extractFn('normalizeReceiptDate');
    const amountSrc = extractFn('_parseReceiptAmount');
    const fnSrc = extractFn('_draftsFromReceiptRows');

    expect(catMatch).not.toBeNull();
    expect(inferMatch).not.toBeNull();

    const harness = `
      ${catMatch[0]}
      ${inferMatch[0]}
      ${normDateSrc}
      ${amountSrc}
      let TAX_CATEGORIES = null;
      function today() { return '2026-07-25'; }
      const _emailContentCache = {};
      function _selectedFileParts() { return []; }
      ${fnSrc}
      return _draftsFromReceiptRows;
    `;
    const _draftsFromReceiptRows = new Function(harness)();

    it('keeps a well-formed row', () => {
      const { drafts, dropped } = _draftsFromReceiptRows(
        [{ vendor: 'Acme', date: '2026-01-01', amount: 42, currency: 'CAD', category: 'Other' }], ''
      );
      expect(drafts).toHaveLength(1);
      expect(dropped).toBe(0);
      expect(drafts[0].amount).toBe(42);
    });

    it('drops a row with an unusable amount and reports the count — never silently', () => {
      const { drafts, dropped } = _draftsFromReceiptRows(
        [
          { vendor: 'Good', date: '2026-01-01', amount: 10, currency: 'CAD' },
          { vendor: 'Bad', date: '2026-01-01', amount: 'free lunch', currency: 'CAD' }
        ], ''
      );
      expect(drafts).toHaveLength(1);
      expect(dropped).toBe(1);
    });

    it('reroutes a category outside EXPENSE_CATEGORIES instead of accepting it silently', () => {
      const { drafts } = _draftsFromReceiptRows(
        [{ vendor: 'Zzz Unknown Vendor', date: '2026-01-01', amount: 10, currency: 'CAD', category: 'Not A Real Category' }], ''
      );
      expect(drafts[0].category).not.toBe('Not A Real Category');
    });
  });

  describe('_runExtractionPool — never rejects; one failure isolates to one item', () => {
    const fnSrc = extractFn('_runExtractionPool', true);
    const _runExtractionPool = new Function(`return (async () => { ${fnSrc}; return _runExtractionPool; })()`)();

    it('resolves ok:true for every item that succeeds', async () => {
      const pool = await _runExtractionPool;
      const out = await pool([1, 2, 3], 2, async (n) => n * 10);
      expect(out.every(r => r.ok)).toBe(true);
      expect(out.map(r => r.value)).toEqual([10, 20, 30]);
    });

    it('isolates one failing item — the batch as a whole never rejects', async () => {
      const pool = await _runExtractionPool;
      const out = await pool([1, 2, 3], 2, async (n) => {
        if (n === 2) throw new Error('boom');
        return n;
      });
      expect(out[0]).toEqual({ ok: true, value: 1 });
      expect(out[1].ok).toBe(false);
      expect(out[1].error.message).toBe('boom');
      expect(out[2]).toEqual({ ok: true, value: 3 });
    });

    it('still throws on an AbortError — cancel must actually stop the batch', async () => {
      const pool = await _runExtractionPool;
      const abortErr = Object.assign(new Error('aborted'), { name: 'AbortError' });
      await expect(pool([1, 2], 2, async () => { throw abortErr; })).rejects.toThrow('aborted');
    });
  });

  describe('_callGeminiForReceipts — retired models removed, single upload per attempt', () => {
    it('no longer probes gemini-2.0-flash or gemini-2.0-flash-lite (retired 2026-06-01)', () => {
      const modelsMatch = mainContent.match(/const GEMINI_RECEIPT_MODELS = \[[^\]]+\];/);
      expect(modelsMatch).not.toBeNull();
      expect(modelsMatch[0]).not.toContain('gemini-2.0-flash');
    });

    it('serializes the request body once, outside the per-model/per-retry loop', () => {
      const fnSrc = extractFn('_callGeminiForReceipts', true);
      // The body must be built before the `for (const model of models)` loop,
      // not inside the `send` closure — otherwise every model + retry
      // re-uploads the full multi-megabyte payload.
      const forLoopIdx = fnSrc.indexOf('for (const model of models)');
      const bodyIdx = fnSrc.indexOf('const body = JSON.stringify');
      expect(bodyIdx).toBeGreaterThanOrEqual(0);
      expect(bodyIdx).toBeLessThan(forLoopIdx);
    });

    it('reads all non-thought text parts, not just parts[0]', () => {
      const fnSrc = extractFn('_callGeminiForReceipts', true);
      expect(fnSrc).toContain("filter(p => p && p.text && !p.thought)");
    });

    it('never falls through to another model on an AbortError', () => {
      const fnSrc = extractFn('_callGeminiForReceipts', true);
      expect(fnSrc).toMatch(/if \(e && e\.name === 'AbortError'\) throw e;/);
    });
  });

  describe('extraction wiring: selection, cancel, pre-filter, offline guard', () => {
    it('selection lives in a Set, not only in `:checked` DOM nodes', () => {
      expect(mainContent).toContain('let _gmailSelectedIds = new Set();');
      expect(mainContent).toContain('_gmailSelectedIds.add(msgId)');
      expect(mainContent).toContain('_gmailSelectedIds.delete(msgId)');
    });

    it('skips emails already imported (by emailMsgId) before spending any tokens', () => {
      expect(mainContent).toContain('.map(e => e.emailMsgId).filter(Boolean)');
      expect(mainContent).toMatch(/const todo = msgIds\.filter\(id => !importedMsgIds\.has\(id\)\)/);
    });

    it('gates extraction and search on navigator.onLine', () => {
      expect(mainContent).toMatch(/extractReceiptsFromEmailText[\s\S]{0,300}navigator\.onLine/);
      expect(mainContent).toMatch(/searchGmailEmails[\s\S]{0,600}navigator\.onLine/);
    });

    it('wires an AbortController that closing the modal actually triggers', () => {
      expect(mainContent).toContain('let _emailExtractAbort = null;');
      expect(mainContent).toContain('_emailExtractAbort = new AbortController();');
      expect(mainContent).toMatch(/function closeEmailReceiptImportModal\(\)\s*\{\s*\/\/[\s\S]*?if \(_emailExtractAbort\) _emailExtractAbort\.abort\(\);/);
    });

    it('caches per-email extraction output so re-running a selection is free', () => {
      expect(mainContent).toContain('let _emailExtractCache = {};');
      expect(mainContent).toContain('_emailExtractCache[msgId] = rows;');
    });
  });

  describe('Apps Script: batched search + batched content endpoint', () => {
    it('listReceiptEmails_ batches thread message fetches instead of one call per thread', () => {
      expect(gasContent).toContain('GmailApp.getMessagesForThreads(threads)');
    });

    it('adds a getEmailContents batch action routed before the spreadsheet-bound health check', () => {
      const routeIdx = gasContent.indexOf("action === 'getEmailContents'");
      const healthCheckIdx = gasContent.indexOf('SpreadsheetApp.getActiveSpreadsheet()');
      expect(routeIdx).toBeGreaterThanOrEqual(0);
      expect(routeIdx).toBeLessThan(healthCheckIdx);
    });

    it('caps a batch request at 12 message ids', () => {
      const fnStart = gasContent.indexOf('function getEmailContents_(e)');
      const fnBody = gasContent.slice(fnStart, gasContent.indexOf('\nfunction ', fnStart + 1));
      expect(fnBody).toMatch(/\.split\(','\)[\s\S]{0,100}\.slice\(0, 12\)/);
    });

    it('advertises the new capability so the client can feature-detect it', () => {
      expect(gasContent).toContain('batchEmailContent: true');
    });

    it('getAttachment_ accepts a positional idx to avoid same-name collisions', () => {
      const fnStart = gasContent.indexOf('function getAttachment_(e)');
      const fnBody = gasContent.slice(fnStart, gasContent.indexOf('\n}', fnStart));
      expect(fnBody).toContain('idxParam');
    });

    it('keeps public/gas-code.txt byte-for-byte in sync with apps-script/Code.gs', () => {
      const gasCopyContent = fs.readFileSync(gasCopyPath, 'utf8');
      expect(gasCopyContent).toBe(gasContent);
    });
  });
});
