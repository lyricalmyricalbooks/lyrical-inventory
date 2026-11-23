// @vitest-environment jsdom
// The Tax Centre's business expenses, driven through the real app: fill the
// "Log an expense" form, press Log, and check the entry that is filed, the
// copy sent to the cloud, and the Expenses / Net figures the screen shows.
// Then edit one, and delete one, and check the figures follow.
//
// The exchange-rate services are faked the way fx-rates-behaviour does: only
// the rates a test lists exist; anything else fails like no network.
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { loadApp, makeBook } from './helpers/load-app.js';

let app;
let win;
// Every copy of the Tax Centre the app sent to the cloud, frozen at the time
// (the fake cloud keeps the live object, which would hide a missed save).
let settingsSaves = [];

function fakeRates({ byDate = {} } = {}) {
  const calls = [];
  vi.stubGlobal('fetch', vi.fn(async (url) => {
    calls.push(String(url));
    const u = new URL(String(url));
    if (u.hostname === 'api.frankfurter.dev' && u.pathname.startsWith('/v1/')) {
      const from = u.searchParams.get('from');
      const day = u.pathname.slice('/v1/'.length);
      const rate = byDate[`${from}@${day}`];
      if (rate) return { ok: true, status: 200, json: async () => ({ date: day, rates: { CAD: rate } }) };
      return { ok: false, status: 404, json: async () => ({}) };
    }
    throw new Error('network disabled in tests');
  }));
  return calls;
}

const tc = () => app.main.TAX_CENTER;
const shown = (id) => document.getElementById(id).textContent;
const lastSavedExpenses = () => settingsSaves.filter(s => s.key === 'taxCenter').at(-1)?.data.businessExpenses;

async function logExpense({ desc, cat = 'Office Supplies', currency = 'CAD', amount, date }) {
  document.getElementById('tc-exp-desc').value = desc;
  document.getElementById('tc-exp-cat').value = cat;
  document.getElementById('tc-exp-cur').value = currency;
  document.getElementById('tc-exp-amount').value = String(amount);
  document.getElementById('tc-exp-date').value = date;
  await win.submitTaxExpense();
  await app.settle();
}

beforeAll(async () => {
  app = await loadApp({ books: [makeBook({ id: 'harbour', title: 'Harbour Lights' })] });
  win = app.window;
  const realSave = win._fbSaveSettings;
  win._fbSaveSettings = async (key, data) => {
    settingsSaves.push({ key, data: JSON.parse(JSON.stringify(data)) });
    return realSave(key, data);
  };
  win.switchTab('taxcenter');
}, 30000);

beforeEach(async () => {
  await app.resetBook('harbour', { hist: [], expenses: [] });
  tc().businessExpenses = [];
  settingsSaves = [];
  win.tcYearChange('all');
});

afterEach(() => {
  vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('network disabled in tests'))));
});

describe('logging a business expense in Canadian dollars', () => {
  it('files it at face value and adds it to Expenses', async () => {
    fakeRates();
    await logExpense({ desc: 'Mailers', amount: 42.5, date: '2026-03-04' });

    expect(tc().businessExpenses).toHaveLength(1);
    expect(tc().businessExpenses[0]).toMatchObject({
      desc: 'Mailers', cat: 'Office Supplies', currency: 'CAD', amount: 42.5,
      fxRate: 1, baseAmount: 42.5, date: '2026-03-04',
    });
    expect(tc().businessExpenses[0].fxMissing).toBeUndefined();
    expect(lastSavedExpenses()).toEqual([expect.objectContaining({ desc: 'Mailers', baseAmount: 42.5 })]);

    expect(shown('tc-expenses')).toBe('CA$42.50');
    expect(shown('tc-net')).toBe('-CA$42.50');
    expect(app.toast()).toMatch(/Business Expense logged/);
    // The form is cleared for the next one.
    expect(document.getElementById('tc-exp-desc').value).toBe('');
    expect(document.getElementById('tc-exp-amount').value).toBe('');
  });

  it('refuses an expense with no amount, and files nothing', async () => {
    await logExpense({ desc: 'Stamps', amount: '', date: '2026-03-04' });
    expect(tc().businessExpenses).toEqual([]);
    expect(settingsSaves).toHaveLength(0);
    expect(app.toast()).toMatch(/enter an amount/i);
  });
});

describe('logging a business expense in US dollars', () => {
  it('converts it at the rate for its own date and counts the CAD value', async () => {
    const calls = fakeRates({ byDate: { 'USD@2025-05-06': 1.38 } });
    await logExpense({ desc: 'Hotel for the fair', cat: 'Travel', currency: 'USD', amount: 100, date: '2025-05-06' });

    expect(calls.some(c => c.includes('/v1/2025-05-06') && c.includes('from=USD'))).toBe(true);
    expect(tc().businessExpenses[0]).toMatchObject({
      desc: 'Hotel for the fair', cat: 'Travel', currency: 'USD', amount: 100, fxRate: 1.38, baseAmount: 138,
    });
    expect(lastSavedExpenses()[0]).toMatchObject({ amount: 100, currency: 'USD', baseAmount: 138 });
    expect(shown('tc-expenses')).toBe('CA$138.00');
  });

  it('adds up a CAD and a USD expense in Canadian dollars', async () => {
    fakeRates({ byDate: { 'USD@2025-05-07': 1.4 } });
    await logExpense({ desc: 'Printer ink', amount: 20, date: '2026-01-15' });
    await logExpense({ desc: 'Domain renewal', cat: 'Software & Subscriptions', currency: 'USD', amount: 15, date: '2025-05-07' });

    expect(tc().businessExpenses.map(e => [e.desc, e.baseAmount])).toEqual([['Domain renewal', 21], ['Printer ink', 20]]);
    expect(shown('tc-expenses')).toBe('CA$41.00');
    // The year filter narrows the total to that year's expenses.
    win.tcYearChange('2025');
    expect(shown('tc-expenses')).toBe('CA$21.00');
  });

  it('with no rate to be had, files it without a CAD value instead of 1:1, and says so', async () => {
    fakeRates();
    await logExpense({ desc: 'Conference badge', cat: 'Events & Exhibitions', currency: 'USD', amount: 50, date: '2025-05-08' });

    expect(tc().businessExpenses[0]).toMatchObject({ amount: 50, currency: 'USD', fxRate: null, baseAmount: null, fxMissing: true });
    expect(app.toast()).toMatch(/no USD exchange rate is available/);
    // Counted as nothing until the rate arrives — never as CA$50.
    expect(shown('tc-expenses')).toBe('CA$0.00');
  });
});

describe('editing an expense', () => {
  it('re-values it at the new date\'s rate when the amount and date change', async () => {
    fakeRates({ byDate: { 'USD@2025-06-02': 1.35, 'USD@2025-06-09': 1.5 } });
    await logExpense({ desc: 'Ad spend', cat: 'Marketing & Advertising', currency: 'USD', amount: 40, date: '2025-06-02' });
    const id = tc().businessExpenses[0].id;
    expect(tc().businessExpenses[0].baseAmount).toBe(54);

    win.openEditExpense('businessExpense', null, id);
    expect(document.getElementById('edit-exp-amount').value).toBe('40');
    document.getElementById('edit-exp-amount').value = '60';
    document.getElementById('edit-exp-date').value = '2025-06-09';
    await win.saveExpenseEdit();
    await app.settle();

    expect(tc().businessExpenses[0]).toMatchObject({ amount: 60, currency: 'USD', fxRate: 1.5, baseAmount: 90, date: '2025-06-09' });
    expect(lastSavedExpenses()[0]).toMatchObject({ amount: 60, baseAmount: 90 });
    expect(shown('tc-expenses')).toBe('CA$90.00');
  });
});

describe('deleting an expense', () => {
  it('takes it off the books and the totals go back', async () => {
    fakeRates();
    await logExpense({ desc: 'Bubble wrap', cat: 'Packaging Materials', amount: 12, date: '2026-02-01' });
    await logExpense({ desc: 'Courier', cat: 'Shipping & Postage', amount: 30, date: '2026-02-02' });
    expect(shown('tc-expenses')).toBe('CA$42.00');
    const courier = tc().businessExpenses.find(e => e.desc === 'Courier');

    const done = win.removeLedgerEntry('businessExpense', null, courier.id);
    await app.answerConfirm(true);
    await done;

    expect(tc().businessExpenses.map(e => e.desc)).toEqual(['Bubble wrap']);
    expect(lastSavedExpenses().map(e => e.desc)).toEqual(['Bubble wrap']);
    expect(shown('tc-expenses')).toBe('CA$12.00');
    expect(shown('tc-net')).toBe('-CA$12.00');
  });

  it('keeps it when the delete is cancelled', async () => {
    fakeRates();
    await logExpense({ desc: 'Courier', cat: 'Shipping & Postage', amount: 30, date: '2026-02-02' });
    const saves = settingsSaves.length;
    const done = win.removeLedgerEntry('businessExpense', null, tc().businessExpenses[0].id);
    await app.answerConfirm(false);
    await done;
    expect(tc().businessExpenses).toHaveLength(1);
    expect(settingsSaves).toHaveLength(saves);
    expect(shown('tc-expenses')).toBe('CA$30.00');
  });
});

describe('the net figure', () => {
  it('is sales less every kind of expense: business and book', async () => {
    await app.resetBook('harbour', {
      hist: [{ num: 'S-1', chan: 'Website', qty: 5, price: 40, date: '2026-04-01', cur: 'CAD', after: 95, sheetsId: 's1' }],
      stock: 95, sold: 5, revenue: 200,
      expenses: [{ id: 501, desc: 'Cover design', cat: 'Design', amount: 75, currency: 'CAD', baseAmount: 75, date: '2026-04-02' }],
    });
    fakeRates();
    await logExpense({ desc: 'Accountant', cat: 'Professional Services', amount: 25, date: '2026-04-03' });

    expect(shown('tc-sales')).toBe('CA$200.00');
    expect(shown('tc-expenses')).toBe('CA$100.00');
    expect(shown('tc-net')).toBe('CA$100.00');
  });
});
