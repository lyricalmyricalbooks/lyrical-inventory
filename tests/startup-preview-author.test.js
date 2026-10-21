import { beforeAll, describe, expect, it, vi } from 'vitest';
import { loadApp, makeBook } from './helpers/load-app.js';
import { createFakeCloud } from './helpers/fake-cloud.js';

// An artist opens the app on their phone: their own book appears from the
// device's copy, and only theirs.
describe('startup preview for an artist', () => {
  const mine = makeBook({ id: 'harbour', authorEmail: 'ada@example.com' });
  const other = makeBook({ id: 'lanterns', title: 'Lanterns', authorEmail: 'bo@example.com' });
  const catalog = createFakeCloud([mine, other]).catalog;
  let release;
  const server = new Promise(r => { release = r; });
  const peeked = [];
  const seen = {};
  let main;

  beforeAll(async () => {
    const booting = loadApp({
      books: [mine],
      states: { harbour: { invoiceSeq: 2 } },
      user: { email: 'Ada@Example.com', uid: 'ada', emailVerified: true },
      storage: { fs_mode_global: 'true', fs_mode_harbour: 'true' },
      overrides: {
        _fbLoadModeFlags: () => server,
        _fbLoadCatalog: async () => { await server; return JSON.parse(JSON.stringify(catalog)); },
        _fbPeekCachedCatalog: async () => JSON.parse(JSON.stringify(catalog)),
        _fbPeekCachedBook: async (id) => { peeked.push(id); return { invoiceSeq: 7 }; },
      },
    });
    main = await import('../src/main.js');
    await vi.waitFor(() => { if (!main.states.harbour) throw new Error('no preview yet'); }, { timeout: 10000, interval: 5 });
    seen.seq = main.states.harbour.invoiceSeq;
    seen.otherLoaded = !!main.states.lanterns;
    seen.dashboardShown = document.getElementById('tab-dashboard')?.style.display === 'block';
    seen.label = document.getElementById('sync-label')?.textContent || '';
    release();
    await booting;
    await vi.waitFor(() => { if (main.states.harbour._preview) throw new Error('still the preview'); }, { timeout: 10000, interval: 10 });
  }, 30000);

  it('shows their own book from the device, and reads no one else\'s', () => {
    expect(seen.seq).toBe(7);
    expect(seen.otherLoaded).toBe(false);
    expect(peeked).toEqual(['harbour']);
    expect(seen.dashboardShown).toBe(true);
    expect(seen.label).toMatch(/updating/);
  });

  it('then shows the server\'s copy', () => {
    expect(main.states.harbour.invoiceSeq).toBe(2);
  });
});
