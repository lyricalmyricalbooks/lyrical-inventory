import { describe, it, expect } from 'vitest';
import { buildHarness, appSource } from './helpers/extract-decl.js';
import { parseGeminiModel, rankFreeGeminiModels, GEMINI_FREE_TIER_MODEL } from '../src/lib/gemini-models.js';

// Covers picking up a newly released Flash reader on its own, instead of
// leaving a faster one unused until somebody edits a constant and ships.

const entry = (name, methods = ['generateContent']) => ({ name: `models/${name}`, supportedGenerationMethods: methods });

describe('Ranking the readers Google offers', () => {
  it('puts the newest version first', () => {
    const out = rankFreeGeminiModels([
      entry('gemini-3.6-flash'), entry('gemini-3.9-flash'), entry('gemini-2.5-flash')
    ]);
    expect(out).toEqual(['gemini-3.9-flash', 'gemini-3.6-flash', 'gemini-2.5-flash']);
  });

  it('sorts by number, not by text', () => {
    // The whole point of this feature is the day 3.10 ships. Sorted as text,
    // "3.10" lands below "3.9" and the newest reader is never used.
    const out = rankFreeGeminiModels([entry('gemini-3.9-flash'), entry('gemini-3.10-flash')]);
    expect(out[0]).toBe('gemini-3.10-flash');
  });

  it('handles a whole-number version, so a future gemini-4 is not dropped', () => {
    const out = rankFreeGeminiModels([entry('gemini-3.9-flash'), entry('gemini-4-flash')]);
    expect(out[0]).toBe('gemini-4-flash');
  });

  it('prefers full Flash over Lite at the same version', () => {
    // Lite is quicker and cheaper but reads a creased, faded till receipt
    // noticeably worse, and a misread total costs more than a slower scan.
    const out = rankFreeGeminiModels([entry('gemini-3.8-flash-lite'), entry('gemini-3.8-flash')]);
    expect(out).toEqual(['gemini-3.8-flash', 'gemini-3.8-flash-lite']);
  });

  it('never lets a billed model through, however new it is', () => {
    const out = rankFreeGeminiModels([
      entry('gemini-9.9-pro'), entry('gemini-9.9-ultra'), entry('gemini-3.6-flash')
    ]);
    expect(out).toEqual(['gemini-3.6-flash']);
  });

  it('leaves preview and experimental builds out of a business ledger', () => {
    // These carry tighter free limits, change behaviour without notice and get
    // retired abruptly. A shop's bookkeeping is the wrong place to find out.
    const out = rankFreeGeminiModels([
      entry('gemini-4.0-flash-preview-09-2026'),
      entry('gemini-4.0-flash-exp'),
      entry('gemini-3.8-flash')
    ]);
    expect(out).toEqual(['gemini-3.8-flash']);
  });

  it('skips models that cannot answer a scan at all', () => {
    // Embedding and token-counting models come back in the same list.
    const out = rankFreeGeminiModels([
      entry('gemini-4.0-flash', ['embedContent']), entry('gemini-3.8-flash')
    ]);
    expect(out).toEqual(['gemini-3.8-flash']);
  });

  it('does not list the same reader twice', () => {
    const out = rankFreeGeminiModels([entry('gemini-3.8-flash'), entry('gemini-3.8-flash')]);
    expect(out).toEqual(['gemini-3.8-flash']);
  });

  it('survives whatever shape the answer arrives in', () => {
    expect(rankFreeGeminiModels(null)).toEqual([]);
    expect(rankFreeGeminiModels(undefined)).toEqual([]);
    expect(rankFreeGeminiModels([null, {}, { name: '' }, 'nonsense'])).toEqual([]);
    // A bare list of ids, with no metadata, still ranks.
    expect(rankFreeGeminiModels(['gemini-3.8-flash'])).toEqual(['gemini-3.8-flash']);
  });

  it('reads a version off a name', () => {
    expect(parseGeminiModel('models/gemini-3.8-flash')).toMatchObject({ major: 3, minor: 8, lite: false });
    expect(parseGeminiModel('gemini-3.8-flash-lite')).toMatchObject({ lite: true });
    expect(parseGeminiModel('gemini-3.8-pro')).toBeNull();
  });

  it('agrees with the gate the transport enforces', () => {
    expect(GEMINI_FREE_TIER_MODEL.test('gemini-3.8-flash')).toBe(true);
    expect(GEMINI_FREE_TIER_MODEL.test('gemini-3.8-pro')).toBe(false);
  });
});

describe('Remembering what Google offers', () => {
  function cacheHarness({ now = 1_000_000, fetchImpl, online = true } = {}) {
    const store = new Map();
    const localStorage = {
      getItem: k => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, String(v)),
    };
    const h = buildHarness({
      names: [
        '_warmGeminiModelCache', '_readGeminiModelCache', '_geminiModelChain',
        'GEMINI_MODEL_CACHE_KEY', 'GEMINI_MODEL_CACHE_MS', 'GEMINI_CHAIN_MAX',
        'GEMINI_RECEIPT_MODELS', 'GEMINI_FREE_TIER_MODEL', '_geminiDiscovery'
      ],
      deps: {
        localStorage,
        fetch: fetchImpl || (async () => ({ ok: true, json: async () => ({ models: [] }) })),
        navigator: { onLine: online },
        Date: { now: () => now },
        rankFreeGeminiModels
      },
      returns: '({ warm: _warmGeminiModelCache, chain: _geminiModelChain, read: _readGeminiModelCache })'
    });
    return { ...h, store };
  }

  it('falls back to the built-in readers before it has ever asked', () => {
    const h = cacheHarness();
    expect(h.chain()).toEqual(['gemini-3.8-flash', 'gemini-3.7-flash', 'gemini-3.6-flash']);
  });

  it('picks up a newly released reader without anyone editing the code', async () => {
    const h = cacheHarness({
      fetchImpl: async () => ({
        ok: true,
        json: async () => ({ models: [entry('gemini-3.6-flash'), entry('gemini-4.2-flash')] })
      })
    });

    await h.warm('key');
    expect(h.chain()[0]).toBe('gemini-4.2-flash');
  });

  it('asks once a day, not once a scan', async () => {
    let calls = 0;
    const h = cacheHarness({
      fetchImpl: async () => { calls++; return { ok: true, json: async () => ({ models: [entry('gemini-4.2-flash')] }) }; }
    });

    await h.warm('key');
    await h.warm('key');
    await h.warm('key');
    expect(calls).toBe(1);
  });

  it('asks again once the day is up', async () => {
    let calls = 0;
    const fetchImpl = async () => { calls++; return { ok: true, json: async () => ({ models: [entry('gemini-4.2-flash')] }) }; };
    const first = cacheHarness({ now: 1_000_000, fetchImpl });
    await first.warm('key');
    const saved = first.store.get('lm_gemini_models');

    const later = cacheHarness({ now: 1_000_000 + 25 * 60 * 60 * 1000, fetchImpl });
    later.store.set('lm_gemini_models', saved);
    await later.warm('key');
    expect(calls).toBe(2);
  });

  it('never asks while offline', async () => {
    let calls = 0;
    const h = cacheHarness({ online: false, fetchImpl: async () => { calls++; return { ok: true, json: async () => ({}) }; } });
    await h.warm('key');
    expect(calls).toBe(0);
    // And the scanner still has readers to work with.
    expect(h.chain().length).toBeGreaterThan(0);
  });

  it('keeps working when the lookup fails', async () => {
    const h = cacheHarness({ fetchImpl: async () => { throw new Error('network down'); } });
    await h.warm('key');
    expect(h.chain()).toEqual(['gemini-3.8-flash', 'gemini-3.7-flash', 'gemini-3.6-flash']);
  });

  it('keeps yesterday\'s list rather than replacing it with nothing', async () => {
    const good = cacheHarness({
      fetchImpl: async () => ({ ok: true, json: async () => ({ models: [entry('gemini-4.2-flash')] }) })
    });
    await good.warm('key');
    const saved = good.store.get('lm_gemini_models');

    // A day later the answer comes back unusable — all preview builds.
    const later = cacheHarness({
      now: 1_000_000 + 25 * 60 * 60 * 1000,
      fetchImpl: async () => ({ ok: true, json: async () => ({ models: [entry('gemini-9-flash-preview')] }) })
    });
    later.store.set('lm_gemini_models', saved);
    await later.warm('key');
    expect(later.chain()[0]).toBe('gemini-4.2-flash');
  });

  it('ignores a corrupt cache instead of failing a scan', () => {
    const h = cacheHarness();
    h.store.set('lm_gemini_models', 'not json at all');
    expect(h.read()).toBeNull();
    expect(h.chain().length).toBeGreaterThan(0);
  });

  it('caps how many readers one receipt can be uploaded to', async () => {
    // Discovery can list a dozen. Without a cap a receipt that fails
    // everywhere gets uploaded a dozen times, which on a free allowance is a
    // whole day's worth spent on one bad photo.
    const many = Array.from({ length: 12 }, (_, i) => entry(`gemini-${20 - i}.0-flash`));
    const h = cacheHarness({ fetchImpl: async () => ({ ok: true, json: async () => ({ models: many }) }) });
    await h.warm('key');
    expect(h.chain()).toHaveLength(4);
  });

  it('still refuses a billed model even if one reaches the cache', () => {
    const h = cacheHarness();
    h.store.set('lm_gemini_models', JSON.stringify({ at: 1_000_000, models: ['gemini-9.9-pro', 'gemini-3.8-flash'] }));
    expect(h.chain()).not.toContain('gemini-9.9-pro');
    expect(h.chain()).toContain('gemini-3.8-flash');
  });

  it('does nothing without a key', async () => {
    let calls = 0;
    const h = cacheHarness({ fetchImpl: async () => { calls++; return { ok: true, json: async () => ({}) }; } });
    await h.warm('');
    expect(calls).toBe(0);
  });
});

describe('Where the lookup is triggered', () => {
  it('runs on the screens, never inside a scan', () => {
    // A housekeeping call must never sit between the owner pressing the button
    // and the receipt being read.
    const scan = appSource.slice(appSource.indexOf('async function _extractReceiptFromFile'));
    expect(scan.slice(0, scan.indexOf('\n}'))).not.toContain('_warmGeminiModelCache');

    expect(appSource).toMatch(/function renderExpenses\(\)[\s\S]{0,400}_warmGeminiModelCache/);
    expect(appSource).toMatch(/function renderTaxCenter\(\)[\s\S]{0,400}_warmGeminiModelCache/);
  });
});
