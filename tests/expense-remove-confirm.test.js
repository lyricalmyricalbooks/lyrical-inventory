import { beforeAll, beforeEach, expect, test } from 'vitest';
import { loadApp, makeBook } from './helpers/load-app.js';

// One tap on an expense's small ✕ used to delete it straight away — easy to
// hit by accident on a phone, and a receipt needed at tax time was simply
// gone. Removing now asks first, naming the expense and its amount.
let app;
const expense = { id: 101, desc: 'Fair table fee', cat: 'Events & Exhibitions', amount: 45, currency: 'CAD', baseAmount: 45, date: '2026-10-01', received: false, gratuity: false };
beforeAll(async () => {
  app = await loadApp({ books: [makeBook({ id: 'bk', title: 'Harbour Lights' })] });
}, 30000);
beforeEach(async () => {
  await app.resetBook('bk', { expenses: [{ ...expense }] });
  app.window.switchBook('bk');
});

test('cancelling keeps the expense and saves nothing', async () => {
  const done = app.window.voidExpense(101);
  const body = document.getElementById('m-confirm-body').textContent;
  expect(body).toContain('Fair table fee');
  expect(body).toMatch(/45/);
  await app.answerConfirm(false);
  await done;
  await app.settle();
  expect(app.main.states.bk.expenses.map(e => e.id)).toEqual([101]);
  expect(app.cloud.savesFor('bk')).toHaveLength(0);
});

test('confirming removes it and saves', async () => {
  const done = app.window.voidExpense(101);
  await app.answerConfirm(true);
  await done;
  await app.settle();
  expect(app.main.states.bk.expenses).toEqual([]);
  expect(app.cloud.lastSave('bk').state.expenses).toEqual([]);
});
