import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { loadApp, makeBook } from './helpers/load-app.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const mainContent = fs.readFileSync(path.join(__dirname, '..', 'src', 'main.js'), 'utf8');

const deferred = () => {
  let resolve;
  const promise = new Promise(r => { resolve = r; });
  return { promise, resolve };
};

// One real boot, held at each step so the test can see which reads are
// already running while an earlier one is still waiting on the network.
describe('startup does not wait on one read before starting the next', () => {
  const flags = deferred();
  const paymentLinks = deferred();
  const calls = { catalog: [], book: [] };
  const seen = {};
  let app;

  beforeAll(async () => {
    let flagsDone = false;
    let paymentLinksDone = false;
    const booting = loadApp({
      books: [makeBook({ id: 'harbour' }), makeBook({ id: 'lanterns', title: 'Lanterns' })],
      // This device loaded the mode flags before and kept a copy.
      storage: { fs_mode_global: 'true' },
      overrides: {
        _fbLoadModeFlags: () => flags.promise.then(() => { flagsDone = true; }),
        _fbLoadCatalog: async (opts) => {
          calls.catalog.push({ opts, flagsDone });
          const { createFakeCloud } = await import('./helpers/fake-cloud.js');
          return createFakeCloud([makeBook({ id: 'harbour' }), makeBook({ id: 'lanterns', title: 'Lanterns' })]).catalog;
        },
        _fbLoadSettings: async (key) => {
          if (key === 'paymentLinks') { await paymentLinks.promise; paymentLinksDone = true; }
          return null;
        },
        _fbLoad: async (bookId) => { calls.book.push({ bookId, paymentLinksDone }); return null; },
      },
    });
    // The exchange-rate service never answers.
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})));

    await vi.waitFor(() => { if (!calls.catalog.length) throw new Error('catalog not read yet'); }, { timeout: 10000, interval: 5 });
    seen.catalogBeforeFlags = calls.catalog[0];
    flags.resolve();

    await vi.waitFor(() => { if (calls.book.length < 2) throw new Error('books not read yet'); }, { timeout: 10000, interval: 5 });
    seen.booksBeforeSettings = calls.book.slice();
    paymentLinks.resolve();

    app = await booting;
    await vi.waitFor(() => {
      if (document.getElementById('all-books-list')?.dataset.loaded !== '1') throw new Error('overview not drawn');
    }, { timeout: 10000, interval: 10 });
  }, 30000);

  afterAll(() => vi.unstubAllGlobals());

  it('reads the catalog from the remembered store while the mode flags are still loading', () => {
    expect(seen.catalogBeforeFlags.flagsDone).toBe(false);
    expect(seen.catalogBeforeFlags.opts).toEqual({ global: true });
    // The flags agreed, so the early read was used, not repeated.
    expect(calls.catalog).toHaveLength(1);
  });

  it('starts reading the books while the shared settings are still loading', () => {
    expect(seen.booksBeforeSettings.map(c => c.bookId).sort()).toEqual(['harbour', 'lanterns']);
    expect(seen.booksBeforeSettings.every(c => c.paymentLinksDone === false)).toBe(true);
  });

  it('draws the dashboard without waiting for the day\'s exchange rates', () => {
    expect(app.main.states.harbour).toBeTruthy();
    expect(document.getElementById('all-books-list').dataset.loaded).toBe('1');
  });

  it('says the exchange rates are still updating while they download', () => {
    expect(document.getElementById('tc-rates-note').hidden).toBe(false);
  });

  it('records how long the start took and shows it in the account menu', () => {
    const line = document.getElementById('acct-startup');
    expect(line.hidden).toBe(false);
    expect(line.textContent).toMatch(/^Opened in \d+(\.\d)? s$/);
    expect(JSON.parse(localStorage.getItem('lm-startup-times'))).toHaveLength(1);
  });
});

describe('startup wiring', () => {
  it('still reads every shared setting before the first full render', () => {
    const bootStart = mainContent.indexOf('async function boot(forcedBook)');
    const boot = mainContent.slice(bootStart, bootStart + 5000);
    expect(boot).toContain('const bootLoads = [loadPaymentLinks(), loadProductionCosts(), loadWebsitePaymentMethods()]');
    expect(boot).toContain('const settingsLoaded = Promise.all(bootLoads)');
    expect(boot).toContain('loadAllBooks({ settingsLoaded })');
    expect(boot).toContain('Promise.all([loadBook(forcedBook), settingsLoaded])');
  });

  it('recounts the Open Call badge once suppressions and open calls have both loaded', () => {
    const bootStart = mainContent.indexOf('async function boot(forcedBook)');
    const boot = mainContent.slice(bootStart, bootStart + 5000);
    const loaded = boot.indexOf('await settingsLoaded');
    const recount = boot.indexOf("openCallScreen.call('updateOpenCallBadges')");
    expect(boot).toContain('loadCustomerSuppression()');
    expect(recount).toBeGreaterThan(loaded);
  });

  it('only uses an early startup read when the loaded flags name the same store', () => {
    const startup = mainContent.match(/async function initStartup\(\)[\s\S]*?function setupGate/)?.[0] || '';
    expect(startup).toContain('window._useFirestoreGlobal() === early.global');
    expect(startup.indexOf('await flagsLoaded')).toBeLessThan(startup.indexOf('await Promise.all([loadCatalog('));
  });
});
