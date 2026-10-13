import { beforeAll, expect, test } from 'vitest';
import { loadApp, makeBook } from './helpers/load-app.js';

// The QR card's buttons get their handlers in code (not inline onclick strings
// with the link spliced in). These clicks prove the wiring still works.
let app;
beforeAll(async () => {
  app = await loadApp({ books: [
    makeBook({ id: 'nolink', title: 'No Link Yet' }),
    makeBook({ id: 'linked', title: 'Has a Link', stripeLink: "https://buy.stripe.com/ab'c\\d" }),
  ] });
}, 30000);

test('"Set payment link" opens that book in the editor', async () => {
  let opened = null;
  const original = app.window.openEditBookModal;
  app.window.openEditBookModal = (id) => { opened = id; };
  try {
    app.window.switchTab('qrcodes');
    await app.settle();
    const btn = [...document.querySelectorAll('.qr-card-setlink')].find(b => b.closest('.qr-card')?.textContent.includes('No Link Yet'));
    expect(btn).toBeTruthy();
    btn.click();
    expect(opened).toBe('nolink');
  } finally {
    app.window.openEditBookModal = original;
  }
});

test('"Copy link" hands the exact link over, quote and backslash included', async () => {
  let copied = null;
  const original = app.window.copyBookQR;
  app.window.copyBookQR = (id, url) => { copied = { id, url }; };
  try {
    app.window.switchTab('qrcodes');
    await app.settle();
    const card = [...document.querySelectorAll('.qr-card')].find(c => c.textContent.includes('Has a Link'));
    expect(card?.querySelector('[data-qr-action="copy"]'), 'a linked book shows Copy link').toBeTruthy();
    card.querySelector('[data-qr-action="copy"]').click();
    expect(copied).toEqual({ id: 'linked', url: "https://buy.stripe.com/ab'c\\d" });
  } finally {
    app.window.copyBookQR = original;
  }
});
