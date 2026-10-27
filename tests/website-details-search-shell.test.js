// Book details in step, and one search (docs/website-link.md), in the real app
// signed in as the publisher: the Website orders card lists the details that
// differ from the website, "Use the website's" changes this app's book through
// its own catalogue save, "Leave as is" holds until a value changes, the To-do
// list counts them (and nothing reaches the website's to-do list), and the one
// search box finds this app's books, the website's books and orders, and opens
// the #book= / #search= links.
import { describe, it, expect, beforeAll, vi } from 'vitest';
import { loadApp, makeBook } from './helpers/load-app.js';

const BOOK = 'harbour';
const SITE = 'https://lyricalmyrical-web-v2.web.app';
const link = { statusCb: null, todos: [] };
const $ = (id) => document.getElementById(id);
const waitFor = (fn) => vi.waitFor(fn, { timeout: 4000, interval: 10 });

const linked = (over = {}) => ({
  key: 'hb|', bookId: 'hb', variantId: null, inventoryBookId: BOOK, title: 'Harbour Lights', edition: '',
  author: 'Ada Example', isbn: '978-1-23456-789-7', price: 45, sharedWith: 1, ...over,
});
const status = (rows = [linked()]) => ({
  website: { at: new Date().toISOString(), linkReplies: {} },
  app: { importConsentAt: '2026-10-01T00:00:00.000Z' },
  catalog: { v: 1, at: new Date().toISOString(), books: [
    { key: 'moth|', bookId: 'moth', variantId: null, title: 'Moth Season', edition: '', author: 'Rae Ink', isbn: '', price: 20, cover: '', status: 'published' },
  ], linked: rows },
});
const webRow = {
  id: 'r-WEB-1', uid: 'web-WEB-1-harbour', sheetsId: 'web-WEB-1-harbour', webOrderId: 'ABCD-123456-WXYZ', chan: 'Website',
  num: '#ABCD-123456-WXYZ', date: '2026-10-11', qty: 1, price: 40, cur: 'CAD', fulfilledOnWebsite: true,
  webPaymentStatus: 'paid', webFulfillmentStatus: 'shipped', webSourceUpdatedAt: '2026-10-11T15:00:00.000Z',
};

let app;
beforeAll(async () => {
  app = await loadApp({
    books: [makeBook({ id: BOOK, title: 'Harbour Lights', author: 'Ada Example', isbn: '—', listPrice: 40, currency: 'CA$' })],
    overrides: {
      _fbWatchWebsiteOrders: (cb) => { cb([]); return () => {}; },
      _fbWatchWebsiteLinkStatus: (cb) => { link.statusCb = cb; cb(status()); return () => {}; },
      _fbMarkLinkSwitchedOn: async (at) => at,
      _fbPublishWebsiteLink: async () => ({ ok: true, at: new Date().toISOString(), feeds: 0, accepted: [], refused: [], sent: [], current: [], blocked: [], unavailable: [] }),
      _fbWriteAppTodo: async (todo) => { link.todos.push(todo); return true; },
    },
  });
  await app.resetBook(BOOK, { hist: [webRow] });
  await app.settle(10);
}, 30000);

const section = () => $('wl-detail-diffs');
const openCard = async () => {
  app.window.switchBook(BOOK);
  app.window.switchTab('website');
  await waitFor(() => expect(section()).not.toBeNull());
};

describe('Details that differ from the website', () => {
  it('lists the ISBN and the price (a Canadian-dollar book) with both values', async () => {
    await openCard();
    expect(section().textContent).toContain('Details that differ from the website');
    const rows = [...section().querySelectorAll('.wl-detail-item')].map(li => li.textContent.replace(/\s+/g, ' '));
    expect(rows).toHaveLength(2);
    expect(rows[0]).toContain('ISBN');
    expect(rows[0]).toContain('Website: 9781234567897 · This app: nothing');
    expect(rows[1]).toContain('Price');
    expect(rows[1]).toContain('Website: CA$45.00 · This app: CA$40.00');
  });

  it('counts on the To-do list, and never on the to-do list sent to the website', async () => {
    app.window.switchTab('todo');
    await waitFor(() => expect($('todo-groups').textContent).toContain('2 book details differ from the website'));
    for (const t of link.todos) expect(JSON.stringify(t)).not.toMatch(/detail/i);
  });

  it('Use the website’s changes this app’s book through its catalogue save', async () => {
    await openCard();
    section().querySelector('[data-wl-action="detail-use"][data-id="harbour|price"]').click();
    await waitFor(() => expect(app.main.BOOKS[BOOK].listPrice).toBe(45));
    expect(app.cloud.catalog[BOOK].listPrice).toBe(45);
    expect(app.cloud.catalog[BOOK].currency).toBe('CA$');
    await waitFor(() => expect(section().querySelector('[data-id="harbour|price"]')).toBeNull());
  });

  it('Leave as is holds until either value changes', async () => {
    section().querySelector('[data-wl-action="detail-keep"][data-id="harbour|isbn"]').click();
    await app.settle();
    expect(section()).toBeNull();
    await waitFor(() => expect(app.cloud.settings.websiteKeptDetails).toEqual({ 'harbour|isbn': JSON.stringify(['9781234567897', '']) }));
    link.statusCb(status([linked({ isbn: '9780000000002', price: 45 })]));
    await waitFor(() => expect(section()).not.toBeNull());
    expect(section().textContent).toContain('Website: 9780000000002');
  });

  it('a website with nothing to copy offers only Leave as is', async () => {
    link.statusCb(status([linked({ author: '', isbn: '', price: 45 })]));
    await waitFor(() => expect(section().querySelector('[data-id="harbour|author"]')).not.toBeNull());
    expect(section().querySelector('[data-wl-action="detail-use"][data-id="harbour|author"]')).toBeNull();
    expect(section().querySelector('[data-wl-action="detail-keep"][data-id="harbour|author"]')).not.toBeNull();
  });
});

describe('one search box', () => {
  it('opens from the top bar and finds this app’s books, the website’s books and orders, then the website search', async () => {
    link.statusCb(status());
    await app.settle();
    $('app-search-header-btn').click();
    await waitFor(() => expect($('m-app-search').style.display).toBe('flex'));
    const input = $('as-input');
    input.value = 'harbour';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    const text = $('as-results').textContent;
    expect(text).toContain('Books in this app');
    expect(text).toContain('Books on the website');
    expect(text).toContain('Search the website for “harbour”');
    const hrefs = [...$('as-results').querySelectorAll('a[data-open-website]')].map(a => a.getAttribute('href'));
    expect(hrefs).toContain(`${SITE}/admin#catalog/book/hb`);
    expect(hrefs).toContain(`${SITE}/admin#search=harbour`);

    input.value = 'abcd-1234';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    expect([...$('as-results').querySelectorAll('a[data-open-website]')].map(a => a.getAttribute('href')))
      .toContain(`${SITE}/admin#orders/ABCD-123456-WXYZ`);
    app.window.attemptCloseModal('app-search');
    await app.settle();
  });

  it('a book in this app opens here', async () => {
    app.window.switchBook('all');
    $('app-search-header-btn').click();
    await app.settle();
    const input = $('as-input');
    input.value = 'Harbour';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    $('as-results').querySelector('[data-as-book="harbour"]').click();
    await waitFor(() => expect(app.main.activeBook).toBe(BOOK));
  });

  it('#search=<text> opens the search with the text, and tidies the address', async () => {
    window.location.hash = '#search=Moth%20Season';
    window.dispatchEvent(new window.HashChangeEvent('hashchange'));
    await waitFor(() => expect($('m-app-search').style.display).toBe('flex'));
    expect($('as-input').value).toBe('Moth Season');
    expect($('as-results').textContent).toContain('Moth Season');
    expect(window.location.hash).toBe('');
    app.window.attemptCloseModal('app-search');
    await app.settle();
  });

  it('#book=<id> opens that book', async () => {
    app.window.switchBook('all');
    window.location.hash = '#book=harbour';
    window.dispatchEvent(new window.HashChangeEvent('hashchange'));
    await waitFor(() => expect(app.main.activeBook).toBe(BOOK));
    expect(window.location.hash).toBe('');
  });
});
