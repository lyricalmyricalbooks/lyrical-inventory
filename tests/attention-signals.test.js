import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  buildAttentionSignals,
  SIGNAL_GROUPS,
  GROUP_LABELS,
  isUrgent,
} from '../src/lib/attention-signals.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * A book with nothing wrong with it. Every test below starts from this and
 * breaks exactly one thing, so a signal appearing can only be the thing broken.
 */
const healthyBook = {
  id: 'hound',
  title: 'The Hound',
  author: 'Ian Willms',
  currency: 'CA$',
  maxPrint: 100,
  threshold: 10,
  listPrice: 40,
  productionCost: 1200,
  isbn: '978-1-9999999-0-1',
  stripeLink: 'https://buy.stripe.com/test',
  profitTiers: [{ label: 'Post break-even', revenueUpTo: null, artistPct: 50 }],
};

const healthyState = {
  stock: 100, sold: 0, hist: [], ledger: [], stores: [], expenses: [],
  invoices: [], artistTransfers: [], artistPayouts: [], payoutRequests: [], stockTransfers: [],
};

const healthyContext = {
  sheets: { connected: true, deployedVersion: 'v42', expectedVersion: 'v42' },
  sync: { online: true, pending: 0, failed: false },
  integrations: [],
  submissions: [],
  today: '2026-03-10',
};

/** Build a scan from one book, overriding parts of the healthy fixture. */
function scan({ book = {}, state = {}, ctx = {} } = {}) {
  return buildAttentionSignals({
    books: [{ ...healthyBook, ...book }],
    states: { hound: { ...healthyState, ...state } },
    ...healthyContext,
    ...ctx,
  });
}

const ids = (result) => result.signals.map(s => s.id);

describe('a shop with nothing to do', () => {
  it('produces no signals at all', () => {
    const result = scan();
    expect(result.signals).toEqual([]);
    expect(result.total).toBe(0);
    expect(result.urgent).toBe(0);
  });

  it('still returns a bucket per group so the To-do tab can render its empty states', () => {
    const result = scan();
    expect(Object.keys(result.byGroup)).toEqual(SIGNAL_GROUPS);
    for (const group of SIGNAL_GROUPS) expect(result.byGroup[group]).toEqual([]);
  });

  it('survives an empty catalogue and junk input', () => {
    expect(buildAttentionSignals().total).toBeGreaterThanOrEqual(0);
    expect(buildAttentionSignals({ books: [], states: {} }).signals.every(s => s.group === 'setup')).toBe(true);
    expect(() => buildAttentionSignals({ books: [null, {}], states: null })).not.toThrow();
  });
});

describe('stock signals', () => {
  it('flags a book at or under its reorder level as urgent', () => {
    const result = scan({ book: { maxPrint: 100 }, state: { stock: 8, hist: [{ qty: 92, price: 25, date: '2026-01-01' }] } });
    const low = result.signals.find(s => s.id === 'stock-low:hound');
    expect(low).toBeTruthy();
    expect(low.status).toBe('blocked');
    expect(low.detail).toContain('8 copies');
    expect(isUrgent(low)).toBe(true);
  });

  it('warns before the reorder level is actually hit', () => {
    const result = scan({ state: { stock: 15, hist: [{ qty: 85, price: 25, date: '2026-01-01' }] } });
    expect(ids(result)).toContain('stock-getting-low:hound');
    expect(ids(result)).not.toContain('stock-low:hound');
  });

  it('says nothing about a healthy shelf', () => {
    expect(ids(scan())).not.toContain('stock-low:hound');
    expect(ids(scan())).not.toContain('stock-getting-low:hound');
  });

  it("flags a stored count that disagrees with the book's own records", () => {
    // 100 printed, 10 sold → the records say 90, but the stored count says 100.
    const result = scan({ state: { stock: 100, hist: [{ qty: 10, price: 25, date: '2026-01-01' }] } });
    const drift = result.signals.find(s => s.id === 'stock-drift:hound');
    expect(drift).toBeTruthy();
    expect(drift.detail).toContain('100');
    expect(drift.detail).toContain('90');
  });

  it('stays quiet when the count and the records agree', () => {
    const result = scan({ state: { stock: 90, hist: [{ qty: 10, price: 25, date: '2026-01-01' }] } });
    expect(ids(result)).not.toContain('stock-drift:hound');
  });
});

describe('money signals', () => {
  it('flags a store that owes money, in the book’s own currency', () => {
    const result = scan({ state: { stores: [{ id: 1, name: 'Ink & Wonder', amountOwed: 420 }] } });
    const owed = result.signals.find(s => s.id === 'money-consignment:hound');
    expect(owed.detail).toContain('CA$420.00');
    expect(owed.detail).toContain('1 store owes');
  });

  it('counts several owing stores as one signal, not one each', () => {
    const result = scan({
      state: { stores: [{ amountOwed: 100 }, { amountOwed: 50 }, { amountOwed: 0 }] },
    });
    const owed = result.signals.filter(s => s.group === 'money' && s.id.startsWith('money-consignment'));
    expect(owed).toHaveLength(1);
    expect(owed[0].detail).toContain('2 stores owe');
    expect(owed[0].detail).toContain('CA$150.00');
  });

  it('says nothing when every store is settled', () => {
    const result = scan({ state: { stores: [{ amountOwed: 0 }, { name: 'x' }] } });
    expect(ids(result)).not.toContain('money-consignment:hound');
  });

  it('flags an invoice past its due date as urgent', () => {
    const result = scan({ state: { invoices: [{ id: 1, status: 'sent', dueDate: '2026-03-01' }] } });
    const od = result.signals.find(s => s.id === 'money-invoice-overdue:hound');
    expect(od.status).toBe('blocked');
  });

  it('does not call an invoice overdue before its due date', () => {
    const result = scan({ state: { invoices: [{ id: 1, status: 'sent', dueDate: '2026-03-20' }] } });
    expect(ids(result)).not.toContain('money-invoice-overdue:hound');
  });

  it('mentions a draft invoice that was never sent, but only as a to-do', () => {
    const result = scan({ state: { invoices: [{ id: 1, status: 'draft' }] } });
    const draft = result.signals.find(s => s.id === 'money-invoice-draft:hound');
    expect(draft.status).toBe('info');
    expect(isUrgent(draft)).toBe(false);
  });

  it('flags expenses the artist has not been paid back for', () => {
    const result = scan({
      state: { expenses: [{ id: 1, amount: 49, received: false, ref: 'https://r' }, { id: 2, amount: 10, received: true, ref: 'https://r' }] },
    });
    const owed = result.signals.find(s => s.id === 'money-expenses:hound');
    expect(owed.detail).toContain('1 expense');
    expect(owed.detail).toContain('CA$49.00');
  });

  it('ignores gifted copies when totalling what is owed', () => {
    const result = scan({ state: { expenses: [{ id: 1, amount: 20, received: false, gratuity: true }] } });
    expect(ids(result)).not.toContain('money-expenses:hound');
  });

  it('flags an artist asking to be paid', () => {
    const result = scan({ state: { payoutRequests: [{ id: 1, amount: 200, currency: 'CAD' }] } });
    const req = result.signals.find(s => s.id === 'money-payout-request:hound');
    expect(req.status).toBe('blocked');
    expect(req.detail).toContain('Ian Willms');
    expect(req.detail).toContain('CA$200.00');
  });

  it('drops a payout request once it is settled', () => {
    const result = scan({ state: { payoutRequests: [{ id: 1, amount: 200, settled: true }] } });
    expect(ids(result)).not.toContain('money-payout-request:hound');
  });
});

describe('catalogue signals', () => {
  it('flags a book with no production cost, because it breaks the maths', () => {
    const result = scan({ book: { productionCost: 0 } });
    const cost = result.signals.find(s => s.id === 'catalogue-cost:hound');
    expect(cost.status).toBe('warn');
    expect(cost.detail).toContain('paid for itself');
  });

  it("flags the app's own em-dash placeholder as a missing ISBN", () => {
    expect(ids(scan({ book: { isbn: '—' } }))).toContain('catalogue-isbn:hound');
    expect(ids(scan({ book: { isbn: '' } }))).toContain('catalogue-isbn:hound');
    expect(ids(scan())).not.toContain('catalogue-isbn:hound');
  });

  it('flags a missing payment link', () => {
    expect(ids(scan({ book: { stripeLink: '' } }))).toContain('catalogue-paylink:hound');
  });

  it("flags a book whose artist split was never configured", () => {
    expect(ids(scan({ book: { profitTiers: [] } }))).toContain('catalogue-split:hound');
    expect(ids(scan())).not.toContain('catalogue-split:hound');
  });

  it('flags expenses with nothing backing them up', () => {
    const result = scan({ state: { expenses: [{ id: 1, amount: 20, received: true, ref: '' }] } });
    expect(ids(result)).toContain('catalogue-receipts:hound');
  });

  it('accepts an expense whose proof is a link', () => {
    const result = scan({ state: { expenses: [{ id: 1, amount: 20, received: true, ref: 'https://receipts/1' }] } });
    expect(ids(result)).not.toContain('catalogue-receipts:hound');
  });

  it('NEVER flags list price or reorder level — their blank values are indistinguishable from real ones', () => {
    // 40 and 10 are what the app silently writes when the fields are left empty.
    const result = scan({ book: { listPrice: 40, threshold: 10 } });
    const text = JSON.stringify(result.signals).toLowerCase();
    expect(text).not.toContain('list price');
    expect(text).not.toContain('reorder level');
  });
});

describe('setup signals', () => {
  it('flags a spreadsheet running an out-of-date script', () => {
    const result = scan({ ctx: { sheets: { connected: true, deployedVersion: 'v39', expectedVersion: 'v42' } } });
    const v = result.signals.find(s => s.id === 'setup-sheets-version');
    expect(v.status).toBe('blocked');
    expect(v.detail).toContain('v39');
    expect(v.detail).toContain('v42');
  });

  it('mentions a spreadsheet that was never connected, gently', () => {
    const result = scan({ ctx: { sheets: { connected: false } } });
    expect(result.signals.find(s => s.id === 'setup-sheets-missing').status).toBe('info');
  });

  it('flags changes that failed to save', () => {
    const result = scan({ ctx: { sync: { online: true, pending: 3, failed: true } } });
    const s = result.signals.find(s => s.id === 'setup-sync-failed');
    expect(s.status).toBe('blocked');
    expect(s.fix.action).toBe('retrySyncNow()');
  });

  it('mentions being offline only when something is actually waiting', () => {
    expect(ids(scan({ ctx: { sync: { online: false, pending: 2 } } }))).toContain('setup-sync-offline');
    expect(ids(scan({ ctx: { sync: { online: false, pending: 0 } } }))).not.toContain('setup-sync-offline');
  });

  it('flags an integration that stopped answering', () => {
    const result = scan({ ctx: { integrations: [{ id: 'shippo', label: 'Shippo', failing: true }] } });
    expect(ids(result)).toContain('setup-integration:shippo');
    expect(ids(scan({ ctx: { integrations: [{ id: 'shippo', label: 'Shippo', failing: false }] } })))
      .not.toContain('setup-integration:shippo');
  });

  it('flags author submissions waiting for approval', () => {
    const result = scan({ ctx: { submissions: [{ bookId: 'hound', bookTitle: 'The Hound', sales: 2, expenses: 1 }] } });
    const sub = result.signals.find(s => s.id === 'setup-submissions:hound');
    expect(sub.status).toBe('blocked');
    expect(sub.detail).toContain('3 entries');
  });

  it('ignores a book whose submission queue is empty', () => {
    const result = scan({ ctx: { submissions: [{ bookId: 'hound', sales: 0, expenses: 0 }] } });
    expect(ids(result)).not.toContain('setup-submissions:hound');
  });
});

describe('the result as a whole', () => {
  it('sorts the most urgent first', () => {
    const result = scan({
      book: { isbn: '—' },                                  // info
      state: { stock: 2, payoutRequests: [{ id: 1, amount: 5 }] }, // blocked ×2 (+ drift warn)
    });
    const rank = { blocked: 0, warn: 1, info: 2 };
    const seen = result.signals.map(s => rank[s.status]);
    expect(seen).toEqual([...seen].sort((a, b) => a - b));
  });

  it('counts urgent signals separately from the full list', () => {
    const result = scan({ book: { isbn: '—', stripeLink: '' }, state: { stock: 2 } });
    expect(result.urgent).toBeLessThan(result.total);
    expect(result.total).toBe(result.signals.length);
  });

  it('gives every signal a stable id that does not change between scans', () => {
    const first = ids(scan({ book: { isbn: '—' }, state: { stock: 2 } }));
    const second = ids(scan({ book: { isbn: '—' }, state: { stock: 2 } }));
    expect(second).toEqual(first);
    expect(new Set(first).size).toBe(first.length);
  });

  it('files every signal under one of the four groups', () => {
    const result = scan({
      book: { isbn: '—', productionCost: 0, stripeLink: '', profitTiers: [] },
      state: { stock: 2, stores: [{ amountOwed: 10 }], invoices: [{ status: 'draft' }] },
      ctx: { sheets: { connected: false } },
    });
    for (const signal of result.signals) expect(SIGNAL_GROUPS).toContain(signal.group);
    const grouped = SIGNAL_GROUPS.reduce((n, g) => n + result.byGroup[g].length, 0);
    expect(grouped).toBe(result.total);
  });

  it('writes for the shop owner, not for a developer', () => {
    const result = scan({
      book: { isbn: '—', productionCost: 0, profitTiers: [] },
      state: { stock: 2 },
      ctx: { sheets: { connected: false }, sync: { failed: true, pending: 1 } },
    });
    const prose = result.signals.map(s => `${s.label} ${s.detail}`).join(' ').toLowerCase();
    for (const jargon of ['firestore', 'queue', 'null', 'undefined', 'nan', 'json', 'array']) {
      expect(prose).not.toContain(jargon);
    }
  });

  it('gives each group a plain-language heading', () => {
    for (const group of SIGNAL_GROUPS) {
      expect(GROUP_LABELS[group]).toBeTruthy();
      expect(GROUP_LABELS[group]).not.toMatch(/[_{}]/);
    }
  });
});

describe('wiring', () => {
  const mainJs = readFileSync(join(root, 'src/main.js'), 'utf8');
  const indexHtml = readFileSync(join(root, 'index.html'), 'utf8');

  it('is imported and used by main.js', () => {
    expect(mainJs).toContain("from './lib/attention-signals.js'");
    expect(mainJs).toContain('buildAttentionSignals');
  });

  it('paints a notifications panel on the landing page', () => {
    expect(indexHtml).toContain('id="all-notifications"');
  });

  it('has a To-do tab panel and a sidebar way to reach it', () => {
    expect(indexHtml).toContain('id="tab-todo"');
    expect(indexHtml).toContain("switchTab('todo')");
  });

  it('keeps the To-do tab away from authors', () => {
    // Both halves matter: the redirect, and hiding the button that would bounce them.
    expect(mainJs).toMatch(/name === 'todo'|'todo'/);
    expect(mainJs).toContain('todo-tab-btn');
  });

  it('renders the tab when it is opened', () => {
    expect(mainJs).toContain('renderTodoTab');
  });
});

describe('styling', () => {
  const css = readFileSync(join(root, 'src/style.css'), 'utf8');

  it('styles the notification and activity panels', () => {
    expect(css).toContain('.notif-item');
    expect(css).toContain('.activity-item');
  });

  it('uses canonical surface tokens rather than inventing new ones', () => {
    const block = css.slice(css.indexOf('.notif-item'));
    expect(block).not.toMatch(/var\(--surface\d\)/);
    expect(block).not.toMatch(/var\(--card\)/);
  });
});
