// One to-do list across both apps, in the real app signed in as the
// publisher: the website's to-do items and the app's own website rows on the
// To-do list, the website's books not in this app yet on the Website orders
// card (Add to the app fills the Add new book form; saving asks the website to
// link them; cancelling sends nothing), and the app's to-do list sent to the website.
import { describe, it, expect, beforeAll, vi } from 'vitest';
import { loadApp, makeBook } from './helpers/load-app.js';

const BOOK = 'harbour';
const SITE = 'https://lyricalmyrical-web-v2.web.app';
const link = { ordersCb: null, statusCb: null, asks: [], dismissals: [], todos: [], askImpl: null };
const $ = (id) => document.getElementById(id);
const waitFor = (fn) => vi.waitFor(fn, { timeout: 4000, interval: 10 });

const status = (over = {}) => ({
  website: {
    at: new Date().toISOString(),
    todo: { at: new Date().toISOString(), items: [
      { id: 'stock-held', count: 2, title: 'Stock for 2 books waits for your OK on the website', href: `${SITE}/admin#inventory/link` },
      { id: 'sneaky', count: 1, title: 'Somewhere else', href: 'https://evil.example/admin' },
    ] },
    linkReplies: {},
    ...(over.website || {}),
  },
  app: { importConsentAt: '2026-10-01T00:00:00.000Z', ...(over.app || {}) },
  catalog: {
    v: 1, at: new Date().toISOString(),
    books: [
      { key: 'hound|signed', bookId: 'hound', variantId: 'signed', title: 'The Hound', edition: 'Signed', author: 'Ada Lovelace', isbn: '9781234567897', price: 45, cover: '', status: 'published' },
      { key: 'moth|', bookId: 'moth', variantId: null, title: 'Moth Season', edition: '', author: '', isbn: '', price: null, cover: '', status: 'draft' },
    ],
    ...(over.catalog || {}),
  },
});

const webRow = (orderId, statusWord) => ({
  id: `r-${orderId}`, uid: `web-${orderId}-${BOOK}`, sheetsId: `web-${orderId}-${BOOK}`,
  webOrderId: orderId, chan: 'Website', num: `#${orderId}`, date: '2026-10-11', qty: 1, price: 40, cur: 'CAD',
  fulfilledOnWebsite: true, webPaymentStatus: 'paid', webFulfillmentStatus: statusWord, webSourceUpdatedAt: '2026-10-11T15:00:00.000Z',
});

let app;

beforeAll(async () => {
  app = await loadApp({
    books: [makeBook({ id: BOOK, title: 'Harbour Lights' })],
    overrides: {
      _fbWatchWebsiteOrders: (cb) => { link.ordersCb = cb; return () => {}; },
      _fbWatchWebsiteLinkStatus: (cb) => { link.statusCb = cb; cb(status()); return () => {}; },
      _fbMarkLinkSwitchedOn: async (at) => at,
      _fbPublishWebsiteLink: async () => ({ ok: true, at: new Date().toISOString(), feeds: 0, accepted: [], refused: [], sent: [], current: [], blocked: [], unavailable: [] }),
      _fbWriteAppTodo: async (todo) => { link.todos.push(todo); return true; },
      _fbRequestWebsiteLink: async (key, value, drop) => {
        link.asks.push({ key, value, drop });
        if (link.askImpl) return link.askImpl();
        return true;
      },
      _fbSetShopBookDismissed: async (key, at) => { link.dismissals.push({ key, at }); return true; },
    },
  });
  await app.resetBook(BOOK, { hist: [webRow('WEB-1', 'paid')] });
  link.ordersCb([]);
  await app.settle(10);
}, 30000);

describe('the To-do list for the publisher', () => {
  it('lists the website’s own items, with a button that opens the website', async () => {
    app.window.switchTab('todo');
    await waitFor(() => expect($('todo-groups').textContent).toContain('Stock for 2 books waits for your OK on the website'));
    expect($('todo-groups').textContent).toContain('Waiting on your website');
    expect($('todo-groups').textContent).not.toContain('Somewhere else');
    const open = [...$('todo-groups').querySelectorAll('a[data-open-website]')]
      .find(a => a.getAttribute('href') === `${SITE}/admin#inventory/link`);
    expect(open).toBeTruthy();
    expect(open.textContent).toContain('Open on the website');
  });

  it('counts the website orders not sent yet, opening the website’s orders', async () => {
    app.window.switchTab('todo');
    await waitFor(() => expect($('todo-groups').textContent).toContain('1 website order not sent yet'));
    const hrefs = [...$('todo-groups').querySelectorAll('a[data-open-website]')].map(a => a.getAttribute('href'));
    expect(hrefs).toContain(`${SITE}/admin#orders`);
  });

  it('says how many website books aren’t in this app, and opens them', async () => {
    app.window.switchTab('todo');
    await waitFor(() => expect($('todo-groups').textContent).toContain('2 books on your website aren’t in this app yet'));
    const btn = [...$('todo-groups').querySelectorAll('[data-fix="action"]')].find(b => b.dataset.fixTab === 'website-shop-books');
    btn.click();
    await waitFor(() => expect($('tab-website').classList.contains('active')).toBe(true));
    expect($('wl-shop-books')).not.toBeNull();
  });

  it('the website’s items count on the To-do badge; the others are plain to-dos', () => {
    const badge = document.querySelector('.todo-nav-badge');
    expect(Number(badge.textContent)).toBeGreaterThanOrEqual(1);
  });
});

describe('books on the website, not in this app yet', () => {
  it('are listed on the Website orders card with both choices', async () => {
    app.window.switchBook(BOOK);
    app.window.switchTab('website');
    await waitFor(() => expect($('wl-shop-books')).not.toBeNull());
    const section = $('wl-shop-books');
    expect(section.textContent).toContain('On the website, not in this app yet');
    expect(section.textContent).toContain('The Hound — Signed');
    expect(section.textContent).toContain('Ada Lovelace · ISBN 9781234567897');
    expect(section.textContent).toContain('Draft on the website');
    expect(section.querySelectorAll('[data-wl-action="shop-add"]').length).toBe(2);
  });

  it('Add to the app fills the form; cancelling it sends nothing', async () => {
    $('wl-shop-books').querySelector('[data-wl-action="shop-add"][data-key="hound|signed"]').click();
    await app.settle();
    expect($('nb-title').value).toBe('The Hound — Signed');
    expect($('nb-author').value).toBe('Ada Lovelace');
    expect($('nb-isbn').value).toBe('9781234567897');
    expect($('nb-price').value).toBe('45');
    expect($('nb-cur').value).toBe('CA$');
    expect($('nb-max').value).toBe(''); // the print run is the owner's to fill in
    expect($('book-modal-badge').textContent).toContain('From your website');
    await app.window.closeAddBookModal();
    await app.settle();
    // Saving another book afterwards is not linked to the website's.
    app.window.openAddBookModal();
    $('nb-id').value = 'plain-book';
    $('nb-title').value = 'A Plain Book';
    await app.window.saveBookFromModal();
    await app.settle();
    expect(app.main.BOOKS['plain-book']).toBeTruthy();
    expect(link.asks).toEqual([]);
  });

  it('saving the filled form asks the website to link the new book', async () => {
    $('wl-shop-books').querySelector('[data-wl-action="shop-add"][data-key="hound|signed"]').click();
    await app.settle();
    $('nb-max').value = '150';
    await app.window.saveBookFromModal();
    await app.settle(5);
    expect(app.main.BOOKS['the-hound-signed']).toBeTruthy();
    expect(link.asks).toHaveLength(1);
    expect(link.asks[0].key).toBe('hound|signed');
    expect(link.asks[0].value.inventoryBookId).toBe('the-hound-signed');
    // It leaves the list and shows where it stands.
    app.window.switchBook(BOOK);
    app.window.switchTab('website');
    await waitFor(() => expect($('wl-shop-books').textContent).toContain('Added from the website'));
    expect($('wl-shop-books').querySelector('[data-key="hound|signed"]')).toBeNull();
  });

  it('shows the website’s answer', async () => {
    link.statusCb(status({
      app: { linkRequests: { 'hound|signed': { inventoryBookId: 'the-hound-signed', at: new Date().toISOString() } } },
      website: { linkReplies: { 'hound|signed': { inventoryBookId: 'the-hound-signed', result: 'refused', reason: 'That edition is already matched.', at: new Date().toISOString() } } },
    }));
    await waitFor(() => expect($('wl-shop-books').textContent).toContain('That edition is already matched. The website’s Inventory app link page can match it by hand.'));
  });

  it('Not a book for the app sets it aside, with an Undo', async () => {
    $('wl-shop-books').querySelector('[data-wl-action="shop-dismiss"][data-key="moth|"]').click();
    await app.settle();
    expect(link.dismissals.at(-1).key).toBe('moth|');
    expect(typeof link.dismissals.at(-1).at).toBe('string');
    expect($('wl-shop-books').querySelector('[data-wl-action="shop-add"][data-key="moth|"]')).toBeNull();
    $('wl-shop-books').querySelector('[data-wl-action="shop-undo"][data-key="moth|"]').click();
    await app.settle();
    expect(link.dismissals.at(-1)).toEqual({ key: 'moth|', at: null });
    expect($('wl-shop-books').querySelector('[data-wl-action="shop-add"][data-key="moth|"]')).not.toBeNull();
  });

  it('old rules: says the website will offer the match itself', async () => {
    link.askImpl = async () => { const e = new Error('denied'); e.code = 'permission-denied'; throw e; };
    link.statusCb(status({ catalog: { books: [{ key: 'fern|', bookId: 'fern', title: 'Fern', price: 20, status: 'published' }] } }));
    await waitFor(() => expect($('wl-shop-books').querySelector('[data-key="fern|"]')).not.toBeNull());
    $('wl-shop-books').querySelector('[data-wl-action="shop-add"][data-key="fern|"]').click();
    await app.settle();
    $('nb-max').value = '50';
    await app.window.saveBookFromModal();
    await app.settle(5);
    await waitFor(() => expect(app.toast()).toBe('Saved in this app. The website will offer to match it under New books to match.'));
    link.askImpl = null;
  });
});

describe('this app’s to-do list for the website', () => {
  it('is written when it changes, not on every render', async () => {
    const before = link.todos.length;
    app.window.switchTab('todo');
    app.window.switchTab('todo');
    await app.settle();
    expect(link.todos.length).toBe(before);
    expect(link.todos.length).toBeGreaterThanOrEqual(1);
    expect(link.todos.at(-1).items).toEqual([]);
  });
});

describe('links from the website into this app', () => {
  it('#todo opens the To-do list and tidies the address', async () => {
    app.window.switchBook(BOOK);
    app.window.switchTab('expenses');
    window.location.hash = '#todo';
    window.dispatchEvent(new window.HashChangeEvent('hashchange'));
    await waitFor(() => expect($('tab-todo').classList.contains('active')).toBe(true));
    expect(window.location.hash).toBe('');
  });

  it('#website-orders opens the Website orders tab', async () => {
    app.window.switchTab('expenses');
    window.location.hash = '#website-orders';
    window.dispatchEvent(new window.HashChangeEvent('hashchange'));
    await waitFor(() => expect($('tab-website').classList.contains('active')).toBe(true));
    expect(window.location.hash).toBe('');
  });
});
