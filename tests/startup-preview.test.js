import { beforeAll, describe, expect, it, vi } from 'vitest';
import { loadApp, makeBook } from './helpers/load-app.js';
import { createFakeCloud } from './helpers/fake-cloud.js';

const deferred = () => {
  let resolve;
  const promise = new Promise(r => { resolve = r; });
  return { promise, resolve };
};

// The publisher opens the app on a device that has opened it before. The
// server is slow; the device's own copy should be on screen meanwhile, and the
// server's copy should replace it once it arrives.
describe('startup preview from the device\'s copy', () => {
  const book = makeBook({ id: 'harbour' });
  const catalog = createFakeCloud([book]).catalog;
  const server = deferred();
  const seen = {};
  let app;

  beforeAll(async () => {
    const booting = loadApp({
      books: [book],
      states: { harbour: { invoiceSeq: 2 } },
      storage: { fs_mode_global: 'true', fs_mode_harbour: 'true' },
      overrides: {
        _fbLoadModeFlags: () => server.promise,
        _fbLoadCatalog: async () => { await server.promise; return JSON.parse(JSON.stringify(catalog)); },
        _fbPeekCachedCatalog: async () => JSON.parse(JSON.stringify(catalog)),
        _fbPeekCachedBook: async (id) => (id === 'harbour' ? { invoiceSeq: 7, hist: [] } : null),
      },
    });
    const { states } = await import('../src/main.js');
    await vi.waitFor(() => { if (!states.harbour) throw new Error('no preview yet'); }, { timeout: 10000, interval: 5 });
    seen.seq = states.harbour.invoiceSeq;
    seen.preview = !!states.harbour._preview;
    seen.overviewDrawn = document.getElementById('all-books-list')?.dataset.loaded === '1';
    seen.label = document.getElementById('sync-label')?.textContent || '';
    seen.splash = document.getElementById('splash-screen')?.style.opacity;
    server.resolve();
    app = await booting;
    await vi.waitFor(() => { if (app.main.states.harbour._preview) throw new Error('still the preview'); }, { timeout: 10000, interval: 10 });
  }, 30000);

  it('paints the overview from the device\'s copy before the server answers', () => {
    expect(seen.seq).toBe(7);
    expect(seen.preview).toBe(true);
    expect(seen.overviewDrawn).toBe(true);
    expect(seen.label).toMatch(/updating/);
    expect(seen.splash).toBe('0');
  });

  it('replaces it with the server\'s copy, and saved nothing from the preview', () => {
    expect(app.main.states.harbour.invoiceSeq).toBe(2);
    expect(app.cloud.saves).toEqual([]);
  });
});
