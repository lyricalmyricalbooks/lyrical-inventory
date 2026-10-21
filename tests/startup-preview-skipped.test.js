import { beforeAll, describe, expect, it, vi } from 'vitest';
import { loadApp, makeBook } from './helpers/load-app.js';
import { createFakeCloud } from './helpers/fake-cloud.js';

// A book the device holds no copy of would read as an empty ledger, so no
// preview is shown at all and startup waits for the server as before.
describe('startup preview with a book missing from the device', () => {
  const books = [makeBook({ id: 'harbour' }), makeBook({ id: 'lanterns', title: 'Lanterns' })];
  const catalog = createFakeCloud(books).catalog;
  let release;
  const server = new Promise(r => { release = r; });
  let previewTried = false;
  let statesBeforeServer;
  let app;

  beforeAll(async () => {
    const booting = loadApp({
      books,
      storage: { fs_mode_global: 'true', fs_mode_harbour: 'true', fs_mode_lanterns: 'true' },
      overrides: {
        _fbLoadModeFlags: () => server,
        _fbPeekCachedCatalog: async () => JSON.parse(JSON.stringify(catalog)),
        _fbPeekCachedBook: async (id) => { previewTried = true; return id === 'harbour' ? { stock: 77 } : null; },
      },
    });
    const { states } = await import('../src/main.js');
    await vi.waitFor(() => { if (!previewTried) throw new Error('preview not tried'); }, { timeout: 10000, interval: 5 });
    await new Promise(r => setTimeout(r, 20));
    statesBeforeServer = Object.keys(states);
    release();
    app = await booting;
  }, 30000);

  it('shows nothing from the device and loads normally', () => {
    expect(statesBeforeServer).toEqual([]);
    expect(app.main.states.harbour._preview).toBeUndefined();
    expect(app.main.states.lanterns).toBeTruthy();
  });
});
