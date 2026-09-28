import { beforeAll, expect, test } from 'vitest';
import { loadApp, makeBook } from './helpers/load-app.js';

const bookId = 'harbour';
let app;

const visible = id => document.getElementById(id).style.display !== 'none';

beforeAll(async () => {
  app = await loadApp({ books: [makeBook({ id: bookId, currency: '€' })] });
  app.window.switchBook(bookId);
  app.window.switchTab('dashboard');
  await app.resetBook(bookId, {
    expenses: [{ id: 'proofs', date: '2026-07-04', desc: 'Printing proof copies', cat: 'Production', amount: 80, received: false }],
  });
}, 30000);

test('switching views shows only the reimbursement field for the current role', () => {
  app.main.updateDash();
  expect(visible('d-expenses-sect')).toBe(true);
  expect(visible('d-expenses-kpi')).toBe(true);
  expect(visible('artist-reimburse-banner')).toBe(false);

  app.window.toggleCurrentBookView();
  expect(visible('d-expenses-sect')).toBe(false);
  expect(visible('d-expenses-kpi')).toBe(false);
  expect(visible('artist-reimburse-banner')).toBe(true);
  expect(document.getElementById('arb-amount').textContent).toContain('80.00');

  app.window.toggleCurrentBookView();
  expect(visible('d-expenses-sect')).toBe(true);
  expect(visible('d-expenses-kpi')).toBe(true);
  expect(visible('artist-reimburse-banner')).toBe(false);
});
