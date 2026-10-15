import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readOldCopyCached } from '../src/lib/old-copy-cache.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

function memoryCache() {
  const map = new Map();
  return { map, get: async id => map.get(id) || null, put: async (id, v) => { map.set(id, v); } };
}

function server(record) {
  const calls = { ts: 0, full: 0 };
  return {
    calls,
    set(next) { record = next; },
    readTs: async () => { calls.ts++; return record ? record.ts : null; },
    readFull: async () => { calls.full++; return record ? { json: record.data, ts: record.ts } : null; },
  };
}

describe('old-storage copy cache (Storage check)', () => {
  it('downloads the whole record once, then only its stamp while it is unchanged', async () => {
    const cache = memoryCache();
    const s = server({ data: '{"hist":[1]}', ts: 100 });
    expect(await readOldCopyCached('b1', { ...s, cache })).toBe('{"hist":[1]}');
    expect(await readOldCopyCached('b1', { ...s, cache })).toBe('{"hist":[1]}');
    expect(s.calls).toEqual({ ts: 2, full: 1 });
  });

  it('downloads again as soon as the old copy is written to', async () => {
    const cache = memoryCache();
    const s = server({ data: '{"hist":[1]}', ts: 100 });
    await readOldCopyCached('b1', { ...s, cache });
    s.set({ data: '{"hist":[1,2]}', ts: 200 });
    expect(await readOldCopyCached('b1', { ...s, cache })).toBe('{"hist":[1,2]}');
    expect(cache.map.get('b1')).toEqual({ ts: 200, json: '{"hist":[1,2]}' });
  });

  it('answers null for a book with no old copy, even if one was cached', async () => {
    const cache = memoryCache();
    cache.map.set('b1', { ts: 100, json: '{"hist":[1]}' });
    const s = server(null);
    expect(await readOldCopyCached('b1', { ...s, cache })).toBe(null);
  });

  it('works without a cache and survives a broken one', async () => {
    const s = server({ data: '{"a":1}', ts: 5 });
    expect(await readOldCopyCached('b1', { ...s })).toBe('{"a":1}');
    const broken = { get: async () => { throw new Error('x'); }, put: async () => { throw new Error('y'); } };
    expect(await readOldCopyCached('b1', { ...s, cache: broken })).toBe('{"a":1}');
  });

  it('lets a failed read escape, as the uncached read did', async () => {
    const readTs = async () => { throw new Error('offline'); };
    await expect(readOldCopyCached('b1', { readTs, readFull: async () => null, cache: memoryCache() })).rejects.toThrow('offline');
  });

  it('is what _fbReadOldBookCopy uses', () => {
    const src = read('src/firebase.js');
    const start = src.indexOf('window._fbReadOldBookCopy = async');
    const body = src.slice(start, src.indexOf('\n};', start));
    expect(body).toMatch(/readOldCopyCached\(/);
    expect(body).toMatch(/\/ts`/);
  });
});

describe('writes skipped when nothing changed', () => {
  const src = read('src/firebase.js');

  it('a merged setting unchanged since it was loaded or saved is not re-sent', () => {
    const start = src.indexOf('async function writeMergedSetting(');
    const body = src.slice(start, src.indexOf('\n}', start));
    const skip = body.indexOf("if (_settingsBase[key] === localJson) return data;");
    expect(skip).toBeGreaterThan(-1);
    expect(skip).toBeLessThan(body.indexOf('getDocFromServer'));
  });

  it('the book-owner map is only written when the server copy differs', () => {
    const start = src.indexOf('window._fbSaveBookOwners = async');
    const body = src.slice(start, src.indexOf('\n};', start));
    expect(body).toMatch(/getDocFromServer\(doc\(fs, 'settings', 'bookOwners'\)\)/);
    expect(body).toMatch(/if \(!same\) await setDoc\(doc\(fs, 'settings', 'bookOwners'\), clean\)/);
  });
});

describe('legacy open-call migration reads nothing of its own', () => {
  it('works from the loaded books instead of re-reading every book', () => {
    const oc = read('src/features/opencall.js');
    const start = oc.indexOf('async function migrateLegacyOpenCalls(');
    const body = oc.slice(start, oc.indexOf('\n}\n', start));
    expect(body).not.toMatch(/_fbLoad\(/);
    expect(body).not.toMatch(/_fbSave\(/);
    const load = oc.slice(oc.indexOf('async function loadOpenCalls('), oc.indexOf('async function _persistOpenCalls('));
    expect(load).not.toMatch(/migrateLegacyOpenCalls\(/);
    const main = read('src/main.js');
    const all = main.slice(main.indexOf('async function loadAllBooks('), main.indexOf('async function forceSync('));
    expect(all).toMatch(/migrateLegacyOpenCalls\(states, saveState\)/);
  });
});
