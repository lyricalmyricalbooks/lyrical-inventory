import { beforeAll, describe, expect, it, vi } from 'vitest';
import { loadApp, makeBook } from './helpers/load-app.js';
import { createFakeCloud } from './helpers/fake-cloud.js';

const DAY = 24 * 60 * 60 * 1000;

const deferred = () => {
  let resolve;
  const promise = new Promise(r => { resolve = r; });
  return { promise, resolve };
};

// The publisher opens the app on a device last used three days ago. The
// server is slow; the device's own copy should be on screen meanwhile, say how
// old it is, refuse to be written back, and give way to the server's copy.
describe('startup preview from the device\'s copy', () => {
  const book = makeBook({ id: 'harbour' });
  const catalog = createFakeCloud([book]).catalog;
  const server = deferred();
  const seen = {};
  let app;
  let main;

  beforeAll(async () => {
    const booting = loadApp({
      books: [book],
      states: { harbour: { invoiceSeq: 2 } },
      storage: {
        fs_mode_global: 'true',
        fs_mode_harbour: 'true',
        'lm-device-copy-at': String(Date.now() - 3 * DAY - 60 * 1000),
      },
      overrides: {
        _fbLoadModeFlags: () => server.promise,
        _fbLoadCatalog: async () => { await server.promise; return JSON.parse(JSON.stringify(catalog)); },
        _fbLoadSettings: async (key) => (key === 'taxCenter' ? { businessExpenses: [] } : null),
        _fbPeekCachedCatalog: async () => JSON.parse(JSON.stringify(catalog)),
        _fbPeekCachedBook: async (id) => (id === 'harbour' ? { invoiceSeq: 7, hist: [] } : null),
        _fbPeekCachedSetting: async (key) => (key === 'taxCenter'
          ? { businessExpenses: [{ id: 'e1', desc: 'Paper', amount: 12, currency: 'CAD', date: '2026-10-01', cat: 'Office Supplies' }] }
          : null),
      },
    });
    main = await import('../src/main.js');
    await vi.waitFor(() => { if (!main.states.harbour) throw new Error('no preview yet'); }, { timeout: 10000, interval: 5 });
    seen.seq = main.states.harbour.invoiceSeq;
    seen.preview = !!main.states.harbour._preview;
    seen.overviewDrawn = document.getElementById('all-books-list')?.dataset.loaded === '1';
    seen.label = document.getElementById('sync-label')?.textContent || '';
    seen.splash = document.getElementById('splash-screen')?.style.opacity;
    seen.taxPreview = !!main.TAX_CENTER._preview;
    seen.taxExpenses = main.TAX_CENTER.businessExpenses.length;

    // Ring up a sale at the register while the device's copy is showing.
    window.posCheckout();
    seen.registerToast = document.getElementById('toast')?.textContent || '';
    seen.confirmOpen = document.getElementById('m-pos-sale-confirm')?.style.display === 'flex';
    // And save the catalogue.
    seen.catalogSaved = await main.saveCatalogWithDeletions();

    server.resolve();
    app = await booting;
    await vi.waitFor(() => { if (main.states.harbour._preview) throw new Error('still the preview'); }, { timeout: 10000, interval: 10 });
  }, 30000);

  it('paints the overview from the device\'s copy before the server answers, saying how old it is', () => {
    expect(seen.seq).toBe(7);
    expect(seen.preview).toBe(true);
    expect(seen.overviewDrawn).toBe(true);
    expect(seen.label).toMatch(/from 3 days ago · updating/);
    expect(seen.splash).toBe('0');
  });

  it('shows the device\'s Tax Centre too, marked so it is never saved', () => {
    expect(seen.taxPreview).toBe(true);
    expect(seen.taxExpenses).toBe(1);
    // The server's copy replaced it.
    expect(main.TAX_CENTER._preview).toBeUndefined();
    expect(main.TAX_CENTER.businessExpenses).toEqual([]);
  });

  it('holds the register and the catalogue until the latest copy is in', () => {
    expect(seen.registerToast).toMatch(/Getting the latest figures/);
    expect(seen.confirmOpen).toBe(false);
    expect(seen.catalogSaved).toBe(false);
  });

  it('replaces it with the server\'s copy, saved nothing from the preview, and dates the new copy', () => {
    expect(main.states.harbour.invoiceSeq).toBe(2);
    expect(app.cloud.saves).toEqual([]);
    expect(Date.now() - Number(localStorage.getItem('lm-device-copy-at'))).toBeLessThan(60 * 1000);
  });
});
