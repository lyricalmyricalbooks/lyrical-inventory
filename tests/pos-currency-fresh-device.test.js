import { beforeAll, expect, test } from 'vitest';
import { loadApp, makeBook } from './helpers/load-app.js';

// The register picks its charging currency once, when the app starts — before
// the catalogue has loaded — so a phone that had never charged anything fell
// back to euros and a first sale at a Canadian fair could be rung up in EUR.
// With no currency chosen on this device, it now follows the books.
let app;
beforeAll(async () => {
  app = await loadApp({ books: [makeBook({ id: 'bk', title: 'Harbour Lights', currency: 'CA$' })] });
}, 30000);

test('a device that never chose a currency charges in the books’ own currency', async () => {
  app.window.switchBook('bk');
  app.window.switchTab('pos');
  await app.settle();
  expect(document.getElementById('pos-currency').value).toBe('CAD');
});

test('a currency chosen on this device is kept', async () => {
  app.window.posSetCurrency('EUR');
  app.window.switchTab('today');
  app.window.switchTab('pos');
  await app.settle();
  expect(document.getElementById('pos-currency').value).toBe('EUR');
  expect(localStorage.getItem('lm-pos-currency')).toBe('EUR');
});
