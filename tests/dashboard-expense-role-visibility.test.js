import { beforeAll, expect, test } from 'vitest';
import { loadApp, makeBook } from './helpers/load-app.js';

const bookId = 'harbour';
let app, dash;

const visible = id => document.getElementById(id).style.display !== 'none';

beforeAll(async () => {
  app = await loadApp({ books: [makeBook({ id: bookId, currency: '€' })] });
  dash = await import('../src/features/dashboard.js');
  app.window.switchBook(bookId);
  app.window.switchTab('dashboard');
  await app.resetBook(bookId, {
    expenses: [{ id: 'proofs', date: '2026-07-04', desc: 'Printing proof copies', cat: 'Production', amount: 80, received: false }],
  });
}, 30000);

// The publisher's expenses owed to the artist now live in the Settle up card
// at the top (#d-settle-desk); the old red banner stays hidden in both views.
const deskShown = () => !document.getElementById('d-settle-desk').hidden;

test('switching views shows only the reimbursement field for the current role', () => {
  dash.updateDash();
  expect(deskShown()).toBe(true);
  expect(document.getElementById('sd-owe-amt').textContent).toContain('80.00');
  expect(visible('d-expenses-sect')).toBe(false);
  expect(visible('d-expenses-kpi')).toBe(true);
  expect(visible('artist-reimburse-banner')).toBe(false);

  app.window.toggleCurrentBookView();
  expect(deskShown()).toBe(false);
  expect(visible('d-expenses-sect')).toBe(false);
  expect(visible('d-expenses-kpi')).toBe(false);
  expect(visible('artist-reimburse-banner')).toBe(true);
  expect(document.getElementById('arb-amount').textContent).toContain('80.00');

  app.window.toggleCurrentBookView();
  expect(deskShown()).toBe(true);
  expect(visible('d-expenses-sect')).toBe(false);
  expect(visible('d-expenses-kpi')).toBe(true);
  expect(visible('artist-reimburse-banner')).toBe(false);
});
