import { beforeAll, describe, expect, it, vi } from 'vitest';
import { loadApp, makeBook } from './helpers/load-app.js';

// A held Tax Centre (its first read failed) must not stay held for good when
// the retry finds the cloud has none yet, or nothing logged that day is saved.
const ink = { id: 'e2', desc: 'Ink', amount: 30, currency: 'CAD', date: '2026-10-20', cat: 'Office Supplies' };

describe('a Tax Centre held after a failed read, when the cloud has none yet', () => {
  let reads = 0;
  const saved = {};
  let app;
  let main;

  beforeAll(async () => {
    app = await loadApp({
      books: [makeBook({ id: 'harbour' })],
      overrides: {
        _fbLoadSettings: async (key, opts) => {
          if (key === 'taxCenter' && reads++ === 0 && opts && opts.strict) throw new Error('offline');
          return null;
        },
        _fbSaveSettings: async (key, data) => {
          if (key === 'taxCenter' && data && data._preview) return false;
          saved[key] = JSON.parse(JSON.stringify(data));
          return true;
        },
      },
    });
    main = await import('../src/main.js');
  }, 30000);

  it('stops holding once the read works, and saves what was logged meanwhile', async () => {
    await vi.waitFor(() => { if (!main.TAX_CENTER._preview) throw new Error('not held'); }, { timeout: 5000, interval: 10 });
    main.TAX_CENTER.businessExpenses.unshift({ ...ink });
    app.setOnline(false);
    app.setOnline(true);
    await vi.waitFor(() => { if (!saved.taxCenter) throw new Error('not saved'); }, { timeout: 5000, interval: 10 });
    expect(main.TAX_CENTER._preview).toBeUndefined();
    expect(saved.taxCenter.businessExpenses.map(e => e.id)).toEqual(['e2']);
  });
});
