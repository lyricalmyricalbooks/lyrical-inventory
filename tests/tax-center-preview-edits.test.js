import { beforeAll, describe, expect, it, vi } from 'vitest';
import { keepPreviewEdits } from '../src/lib/tax-center-preview.js';
import { loadApp, makeBook } from './helpers/load-app.js';
import { createFakeCloud } from './helpers/fake-cloud.js';

const paper = { id: 'e1', desc: 'Paper', amount: 12, currency: 'CAD', date: '2026-10-01', cat: 'Office Supplies' };
const ink = { id: 'e2', desc: 'Ink', amount: 30, currency: 'CAD', date: '2026-10-20', cat: 'Office Supplies' };
const stamps = { id: 'e3', desc: 'Stamps', amount: 9, currency: 'CAD', date: '2026-10-21', cat: 'Postage' };
const tc = (expenses) => ({ businessExpenses: expenses, recurring: [], settings: { baseCurrency: 'CAD', geminiKey: '' } });

describe('keepPreviewEdits', () => {
  it('takes the cloud copy when nothing was added while the device\'s copy showed', () => {
    const base = tc([paper]);
    const res = keepPreviewEdits(JSON.stringify(base), tc([]), JSON.parse(JSON.stringify(base)));
    expect(res.kept).toBe(false);
    expect(res.value.businessExpenses).toEqual([]);
  });

  it('keeps an expense added during the preview alongside one another device added', () => {
    const base = tc([paper]);
    const res = keepPreviewEdits(JSON.stringify(base), tc([stamps, paper]), tc([ink, paper]));
    expect(res.kept).toBe(true);
    expect(res.value.businessExpenses.map(e => e.id).sort()).toEqual(['e1', 'e2', 'e3']);
  });

  it('keeps the edit when the cloud copy did not change at all', () => {
    const base = tc([paper]);
    const res = keepPreviewEdits(JSON.stringify(base), JSON.parse(JSON.stringify(base)), tc([ink, paper]));
    expect(res.kept).toBe(true);
    expect(res.value.businessExpenses.map(e => e.id)).toEqual(['e2', 'e1']);
  });

  it('drops the still-loading mark when the cloud copy equals the device copy', () => {
    const base = tc([paper]);
    const current = tc([ink, paper]);
    Object.defineProperty(current, '_preview', { value: true, enumerable: false, configurable: true });
    const res = keepPreviewEdits(JSON.stringify(base), JSON.parse(JSON.stringify(base)), current);
    expect(res.kept).toBe(true);
    expect(res.value._preview).toBeUndefined();
  });

  it('takes the cloud copy when there was no preview', () => {
    const res = keepPreviewEdits(null, tc([stamps]), tc([ink]));
    expect(res.kept).toBe(false);
    expect(res.value.businessExpenses).toEqual([stamps]);
  });
});

// The publisher logs an expense in the first moments after opening the app,
// while the Tax Centre is still this device's copy. When the cloud copy lands,
// the expense must still be there, and be saved.
describe('an expense logged while the Tax Centre is still loading', () => {
  const book = makeBook({ id: 'harbour' });
  const catalog = createFakeCloud([book]).catalog;
  let release;
  const server = new Promise(r => { release = r; });
  let app;
  let main;

  beforeAll(async () => {
    const booting = loadApp({
      books: [book],
      storage: { fs_mode_global: 'true', fs_mode_harbour: 'true' },
      overrides: {
        _fbLoadModeFlags: () => server,
        _fbLoadCatalog: async () => { await server; return JSON.parse(JSON.stringify(catalog)); },
        _fbLoadSettings: async (key) => (key === 'taxCenter' ? { businessExpenses: [stamps, paper] } : null),
        _fbPeekCachedCatalog: async () => JSON.parse(JSON.stringify(catalog)),
        _fbPeekCachedBook: async (id) => (id === 'harbour' ? { hist: [] } : null),
        _fbPeekCachedSetting: async (key) => (key === 'taxCenter' ? { businessExpenses: [paper] } : null),
      },
    });
    main = await import('../src/main.js');
    await vi.waitFor(() => { if (!main.TAX_CENTER._preview) throw new Error('no preview yet'); }, { timeout: 10000, interval: 5 });
    // What logging an expense does before its (refused) save.
    main.TAX_CENTER.businessExpenses.unshift({ ...ink });
    release();
    app = await booting;
    await vi.waitFor(() => { if (main.TAX_CENTER._preview) throw new Error('still the preview'); }, { timeout: 10000, interval: 10 });
  }, 30000);

  it('keeps it next to what the cloud copy holds', () => {
    expect(main.TAX_CENTER.businessExpenses.map(e => e.id).sort()).toEqual(['e1', 'e2', 'e3']);
  });

  it('saves it once the cloud copy is in', async () => {
    await vi.waitFor(() => {
      const saved = app.cloud.settings.taxCenter;
      if (!saved || !saved.businessExpenses.some(e => e.id === 'e2')) throw new Error('not saved yet');
    }, { timeout: 5000, interval: 10 });
  });
});
