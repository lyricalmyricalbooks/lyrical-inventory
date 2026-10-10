// A blank or zero list price / print run in the book form must never be quietly
// replaced by 40 / 100. Zero price is a legitimate free title; a bad print run is refused.
import { describe, it, expect, beforeAll } from 'vitest';
import { loadApp, makeBook } from './helpers/load-app.js';

const $ = (id) => document.getElementById(id);
let app;
beforeAll(async () => { app = await loadApp({ books: [makeBook({ id: 'harbour', listPrice: 25, maxPrint: 300 })] }); }, 30000);

async function edit(price, max) {
  app.window.openEditBookModal('harbour');
  $('nb-price').value = price;
  $('nb-max').value = max;
  await app.window.saveBookFromModal();
  return app.main.BOOKS.harbour;
}

describe('book form price and print run', () => {
  it('keeps a typed 0 list price (free title)', async () => {
    const b = await edit('0', '300');
    expect(b.listPrice).toBe(0);
    expect(b.maxPrint).toBe(300);
  });

  it('refuses a blank price and leaves the stored book untouched', async () => {
    await edit('12.5', '300');
    const b = await edit('', '300');
    expect(b.listPrice).toBe(12.5);
    expect($('nb-price').closest('.form-group').classList.contains('invalid')).toBe(true);
  });

  it('refuses a print run of 0 or blank instead of saving 100', async () => {
    await edit('12.5', '300');
    expect((await edit('12.5', '0')).maxPrint).toBe(300);
    expect($('nb-max').closest('.form-group').classList.contains('invalid')).toBe(true);
    expect((await edit('12.5', '')).maxPrint).toBe(300);
  });
});
