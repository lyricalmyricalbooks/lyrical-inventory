// Quick log end to end in the real app: say it, check the card, log it, undo.
// Nothing reaches the ledger before Log it, and what it saves is the same row
// the regular form saves.
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { loadApp, makeBook } from './helpers/load-app.js';

const HOUND = 'hound';
let app;
let ql;
const state = () => app.main.states[HOUND];
let start = 0; // copies on hand at the start of each test (the print run decides it)
const $ = id => document.getElementById(id);

beforeAll(async () => {
  app = await loadApp({ books: [makeBook({ id: HOUND, title: 'The Hound of Heaven', currency: 'CA$', listPrice: 30, maxPrint: 100, productionCost: 500, pubGratuity: 10 })] });
  ql = await import('../src/features/quick-log.js');
}, 30000);

beforeEach(async () => {
  await app.resetBook(HOUND, { expenses: [], hist: [], stock: 20 });
  app.main.TAX_CENTER.businessExpenses = [];
  ql.closeQuickLog();
  ql.openQuickLog({ listen: false });
  start = state().stock;
});

async function say(text) {
  $('ql-text').value = text;
  await ql.readSentence(text);
  await app.settle();
}

const logButton = () => [...$('ql-foot').querySelectorAll('button')].find(b => b.dataset.action === 'ql.log');

describe('a spoken gratuity', () => {
  it('shows a card first and saves nothing until Log it', async () => {
    await say('log a gratuity for the hound');
    expect($('ql-body').textContent).toContain('Gratuity · The Hound of Heaven · 1 copy');
    expect(state().hist).toHaveLength(0);
    expect(state().stock).toBe(start);
    expect(logButton().disabled).toBe(false);
  });

  it('logs the same row the Log Gratuity form makes, then undoes it', async () => {
    await say("gave two copies of the hound to Sarah from the publisher's pile and expense it");
    await ql.logAll();
    await app.settle();
    const row = state().hist[0];
    expect(row).toMatchObject({ chan: 'Gratuity', qty: 2, price: 0, gratuity: true, gratSource: 'publisher' });
    expect(row.notes).toContain('Sarah');
    expect(state().stock).toBe(start - 2);
    expect(state().revenue).toBe(0);
    expect(state().expenses[0]).toMatchObject({ gratuity: true, ref: row.num, amount: 10, cat: 'Marketing & Advertising' });
    expect(app.cloud.lastSave(HOUND).state.hist[0].num).toBe(row.num);
    expect($('ql-body').textContent).toContain('Logged 1 entry');

    await ql.undoAll();
    await app.settle();
    expect(state().hist[0].voided).toBe(true);
    expect(state().stock).toBe(start);
    expect(state().expenses).toHaveLength(0);
    // Back on the card, ready to fix and log again.
    expect(logButton()).toBeTruthy();
  });

  it('blocks a gift larger than the stock on hand', async () => {
    await say(`gratuity of ${start + 1} hound`);
    expect($('ql-body').textContent).toContain(`Only ${start} copies on hand`);
    expect(logButton().disabled).toBe(true);
    await ql.logAll();
    expect(state().hist).toHaveLength(0);
  });
});

describe('a spoken sale and expense together', () => {
  it('logs both from one sentence through the normal save paths', async () => {
    await say('sold two hound at the fair for 25 each cash, then spent 12 dollars on stamps');
    expect($('ql-body').querySelectorAll('.ql-entry')).toHaveLength(2);
    expect(logButton().textContent).toContain('Log 2');
    await ql.logAll();
    await app.settle();
    expect(state().hist[0]).toMatchObject({ chan: 'Book Fair', qty: 2, price: 25, enteredBy: 'Publisher' });
    expect(state().revenue).toBe(50);
    expect(state().stock).toBe(start - 2);
    const exp = app.main.TAX_CENTER.businessExpenses[0];
    expect(exp).toMatchObject({ amount: 12, cat: 'Shipping & Postage' });

    await ql.undoAll();
    await app.settle();
    expect(state().revenue).toBe(0);
    expect(state().stock).toBe(start);
    expect(app.main.TAX_CENTER.businessExpenses).toHaveLength(0);
  });

  it('lets one row be unticked so only the other is logged', async () => {
    await say('gratuity for the hound and sold one hound');
    const boxes = $('ql-body').querySelectorAll('input[data-on-change="ql.include"]');
    boxes[1].checked = false;
    boxes[1].dispatchEvent(new Event('change', { bubbles: true }));
    expect(logButton().textContent).toContain('Log it');
    await ql.logAll();
    await app.settle();
    expect(state().hist).toHaveLength(1);
    expect(state().hist[0].gratuity).toBe(true);
  });
});

it('the header button is in the page for the publisher', () => {
  expect($('quick-log-header-btn')?.dataset.action).toBe('quickLog.open');
});
