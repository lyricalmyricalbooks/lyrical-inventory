import { describe, it, expect, beforeEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const mainJs = fs.readFileSync(path.join(root, 'src/main.js'), 'utf8');
const rules = fs.readFileSync(path.join(root, 'firestore.rules'), 'utf8');

// The reporter runs on the failure path, so its own failure modes matter more
// than usual: it must not throw, must not recurse, and must not flood. Those
// are behaviours, not text, so they're exercised rather than grepped.
//
// main.js can't be imported (top-level Firebase side effects), so the reporting
// block is lifted from source and run against a stub _fbLogClientError.
function loadReporter({ logImpl, doc } = {}) {
  const start = mainJs.indexOf('const ERR_MAX_PER_SESSION');
  const end = mainJs.indexOf('let updateSWFunc = null;');
  if (start === -1 || end === -1 || end <= start) {
    throw new Error('client error reporting block not found in src/main.js');
  }
  // `export` is illegal inside new Function and is not part of what is under
  // test — main.js exports some of these helpers now that feature modules
  // import them. Stripped the same way tests/helpers/extract-decl.js does.
  const block = mainJs.slice(start, end).replace(/^export\s+/gm, '');

  const calls = [];
  const win = {
    IS_PUBLISHER: true,
    _fbLogClientError: logImpl || (async (e) => { calls.push(e); }),
    addEventListener: () => {},
  };

  // eslint-disable-next-line no-new-func
  const factory = new Function(
    'window', 'document', 'navigator', 'IS_AUTHOR_MODE', 'activeBook', '__GIT_COMMIT_DATE__',
    `${block}\n return { reportClientError, flush: _flushClientErrors };`
  );
  const api = factory(
    win,
    doc || { querySelector: () => null, addEventListener: () => {} },
    { onLine: true, userAgent: 'test-agent' },
    false, 'book-1', '2026-07-25',
  );
  return { ...api, calls, win };
}

const flushAsync = () => new Promise(r => setTimeout(r, 0));

describe('client error reporting', () => {
  let r;
  beforeEach(() => { r = loadReporter(); });

  it('reports an error with actionable context', async () => {
    r.reportClientError('unhandledrejection', 'promptDialog is not defined', {
      stack: 'at relinkEditExpenseReceipt',
    });
    await flushAsync();

    expect(r.calls).toHaveLength(1);
    expect(r.calls[0]).toMatchObject({
      kind: 'unhandledrejection',
      message: 'promptDialog is not defined',
      role: 'publisher',
      book: 'book-1',
      build: '2026-07-25',
    });
    expect(r.calls[0].ts).toBeGreaterThan(0);
  });

  it('de-duplicates the same fault so a render loop cannot flood the collection', async () => {
    for (let i = 0; i < 50; i++) {
      r.reportClientError('error', 'same failure', { source: 'main.js', line: 10 });
    }
    await flushAsync();
    expect(r.calls).toHaveLength(1);
  });

  it('caps distinct reports per session', async () => {
    for (let i = 0; i < 100; i++) {
      r.reportClientError('error', `distinct failure ${i}`);
    }
    await flushAsync();
    expect(r.calls.length).toBeLessThanOrEqual(25);
    expect(r.calls.length).toBeGreaterThan(0);
  });

  it('truncates long messages and stacks rather than storing unbounded data', async () => {
    r.reportClientError('error', 'x'.repeat(5000), { stack: 'y'.repeat(9000) });
    await flushAsync();
    expect(r.calls[0].message.length).toBeLessThanOrEqual(500);
    expect(r.calls[0].stack.length).toBeLessThanOrEqual(2000);
  });

  it('does not throw when the Firestore write rejects', async () => {
    const failing = loadReporter({ logImpl: async () => { throw new Error('offline'); } });
    expect(() => failing.reportClientError('error', 'boom')).not.toThrow();
    await flushAsync();
    // And a later report still works rather than the reporter wedging itself.
    expect(() => failing.reportClientError('error', 'second')).not.toThrow();
  });

  it('does not throw when no Firestore sink is installed yet', async () => {
    const early = loadReporter();
    delete early.win._fbLogClientError;
    expect(() => early.reportClientError('error', 'during startup')).not.toThrow();
    await flushAsync();

    // Buffered, not dropped: once the sink appears the report goes out.
    const sent = [];
    early.win._fbLogClientError = async (e) => { sent.push(e); };
    early.flush();
    await flushAsync();
    expect(sent).toHaveLength(1);
    expect(sent[0].message).toBe('during startup');
  });

  it('still reports when gathering context throws', async () => {
    // Stands in for the real hazard: reportClientError runs before main.js has
    // finished evaluating, so reading IS_AUTHOR_MODE or activeBook can raise a
    // temporal-dead-zone ReferenceError. The field should degrade, not the
    // report — a start-up error is the one most worth keeping.
    const hostile = loadReporter({
      doc: {
        querySelector: () => { throw new ReferenceError("Cannot access 'x' before initialization"); },
        addEventListener: () => {},
      },
    });
    hostile.reportClientError('error', 'failed during startup');
    await flushAsync();

    expect(hostile.calls).toHaveLength(1);
    expect(hostile.calls[0].message).toBe('failed during startup');
    expect(hostile.calls[0].tab).toBe('');
  });

  it('never lets a malformed reason reach the sink as a throw', async () => {
    expect(() => r.reportClientError('unhandledrejection', undefined)).not.toThrow();
    expect(() => r.reportClientError('unhandledrejection', null)).not.toThrow();
    await flushAsync();
    expect(r.calls.every(c => typeof c.message === 'string')).toBe(true);
  });
});

describe('clientErrors security rule', () => {
  it('is publisher-read, append-only, and size-capped', () => {
    const block = rules.match(/match \/clientErrors\/\{id\} \{([\s\S]*?)\n {4}\}/);
    expect(block).not.toBeNull();
    const body = block[1];
    expect(body).toContain('allow read, delete: if isPublisher();');
    expect(body).toContain('allow update: if false;');
    expect(body).toContain('allow create: if request.auth != null');
    // A create rule without a size cap would make this collection free storage.
    expect(body).toMatch(/message\.size\(\) <= 500/);
    expect(body).toMatch(/stack\.size\(\) <= 2000/);
  });
});
