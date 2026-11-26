import { beforeAll, describe, expect, it, vi } from 'vitest';
import { loadApp, makeBook } from './helpers/load-app.js';

// A new phone on a bad signal can't read the Tax Centre at start-up. That used
// to look like "no Tax Centre yet", and the next save (the daily exchange
// rates, or the first expense logged) wrote a near-empty one over every
// expense and subscription in the cloud.
const paper = { id: 'e1', desc: 'Paper', amount: 12, currency: 'CAD', date: '2026-10-01', cat: 'Office Supplies' };
const ink = { id: 'e2', desc: 'Ink', amount: 30, currency: 'CAD', date: '2026-10-20', cat: 'Office Supplies' };
const oldBackup = { id: 'sb-1', dayKey: '2026-10-01', type: 'auto', createdAt: 1, bookCount: 1 };

describe('a Tax Centre and backup list that could not be read at start-up', () => {
  const cloudTax = { businessExpenses: [paper], recurring: [], settings: { baseCurrency: 'CAD', geminiKey: '' } };
  let reachable = false;
  let backupsReachable = false;
  const saved = {};
  let app;
  let main;

  beforeAll(async () => {
    app = await loadApp({
      books: [makeBook({ id: 'harbour' })],
      overrides: {
        _fbLoadSettings: async (key, opts) => {
          if (key === 'taxCenter' || key === 'systemBackups') {
            if (!(key === 'taxCenter' ? reachable : backupsReachable)) { if (opts && opts.strict) throw new Error('offline'); return null; }
            return key === 'taxCenter' ? JSON.parse(JSON.stringify(cloudTax)) : [oldBackup];
          }
          return null;
        },
        _fbSaveBackupSnapshot: async () => true,
        _fbDeleteBackupSnapshot: async () => true,
        // As firebase.js does: a Tax Centre still marked unread is not saved.
        _fbSaveSettings: async (key, data) => {
          if (key === 'taxCenter' && data && data._preview) return false;
          saved[key] = JSON.parse(JSON.stringify(data));
          return true;
        },
      },
    });
    main = await import('../src/main.js');
  }, 30000);

  it('holds Tax Centre saves instead of writing an empty one', async () => {
    await vi.waitFor(() => { if (!main.TAX_CENTER._preview) throw new Error('not held'); }, { timeout: 5000, interval: 10 });
    main.TAX_CENTER.businessExpenses.unshift({ ...ink });
    await window._fbSaveSettings('taxCenter', main.TAX_CENTER);
    expect(saved.taxCenter).toBeUndefined();
  });

  it('loads the cloud copy when the connection is back, keeping what was logged meanwhile', async () => {
    reachable = true;
    app.setOnline(false);
    app.setOnline(true);
    await vi.waitFor(() => { if (main.TAX_CENTER._preview) throw new Error('still held'); }, { timeout: 5000, interval: 10 });
    expect(main.TAX_CENTER.businessExpenses.map(e => e.id).sort()).toEqual(['e1', 'e2']);
  });

  it('does not save the backup list over older backups it could not read', async () => {
    await window.loadSystemBackups();
    await window.createSystemBackup('manual');
    expect(saved.systemBackups).toBeUndefined();
    backupsReachable = true;
    await window.createSystemBackup('manual');
    expect(saved.systemBackups.map(b => b.id)).toContain('sb-1');
    expect(saved.systemBackups.length).toBe(3);
  });
});
