// A change made offline must be merged against the cloud copy it was made on,
// not the newest one. When the merge base moved under a queued change, another
// device's sale looked like our own starting point and the flush erased it.
import { describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildHarness } from './helpers/extract-decl.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const firebaseJs = fs.readFileSync(path.resolve(__dirname, '../src/firebase.js'), 'utf8');

describe('queueSync keeps the base a queued change was made on', () => {
  function harness(baseNow) {
    const deps = {
      syncQueue: [],
      _syncInFlightItem: null,
      SYNC_TAB_ID: 'tab-test',
      window: { _fbBaseFor: vi.fn(() => ({ ...baseNow })) },
      saveSyncQueueToDevice: vi.fn(),
      updatePendingIndicator: vi.fn(),
      processSyncQueue: vi.fn(),
    };
    const api = buildHarness({ names: ['queueSync'], deps, returns: '{ queueSync, q: () => syncQueue }' });
    return { ...api, deps };
  }

  it('records the current base on a first queued change', () => {
    const h = harness({ hist: 'v1' });
    h.queueSync('b1', { n: 1 });
    expect(h.q()[0].base).toEqual({ hist: 'v1' });
  });

  it('keeps the older base when a newer edit supersedes the queued one', () => {
    const base = { hist: 'v1' };
    const h = harness(base);
    h.queueSync('b1', { n: 1 });
    base.hist = 'v2-from-other-device';
    h.queueSync('b1', { n: 2 });
    expect(h.q()).toHaveLength(1);
    expect(h.q()[0]).toMatchObject({ state: { n: 2 }, base: { hist: 'v1' } });
  });
});

describe('_fbSave fixes its merge base before reading the server', () => {
  const start = firebaseJs.indexOf('window._fbSave = async (');
  const body = firebaseJs.slice(start, firebaseJs.indexOf('\n};', start));

  it('takes the caller\'s base, or a copy of the current one, before the await', () => {
    const baseAt = body.indexOf('const base = opts.base || { ...hashes }');
    expect(baseAt).toBeGreaterThan(-1);
    expect(baseAt).toBeLessThan(body.indexOf('await Promise.all'));
  });

  it('compares the server against that base, not the live one', () => {
    expect(body).toContain('hasOwnProperty.call(base, p) ? base[p] : null');
  });
});
