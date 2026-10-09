// Catalog safety: a failed read never overwrites the real catalog, Edit Book
// can clear fields and keeps the ones it doesn't show, a taken id is never
// overwritten, and only the real test profile is treated as a test book.
import { describe, it, expect, beforeAll } from 'vitest';
import { loadApp, makeBook } from './helpers/load-app.js';

let app;
const $ = id => document.getElementById(id);

beforeAll(async () => {
  app = await loadApp({ books: [
    makeBook({ id: 'harbour', authorEmail: 'ada@example.com', stripeLink: 'https://buy.stripe.com/x', customNote: 'keep me' }),
    makeBook({ id: 'other', title: 'Other Book' }),
  ] });
}, 30000);

describe('isTestBook', () => {
  it('matches only the real test ids or an explicit flag', () => {
    const t = app.window.isTestBook;
    expect(t({ id: 'test1', title: 'x' })).toBe(true);
    expect(t({ id: 'abc', title: 'testpage' })).toBe(true);
    expect(t({ id: 'abc', title: 'x', isTest: true })).toBe(true);
    expect(t({ id: 'greatest-hits', title: 'Greatest Hits' })).toBe(false);
    expect(t({ id: 'contest', title: 'The Contest' })).toBe(false);
    expect(app.window.isTestBookId('latest-news')).toBe(false);
    expect(app.window.isTestBookId('test1')).toBe(true);
  });
});

describe('a failed catalog read', () => {
  it('keeps the loaded catalog and refuses to save over the real one', async () => {
    const before = JSON.stringify(app.cloud.catalog);
    const realLoad = app.window._fbLoadCatalog;
    const realSave = app.window._fbSaveCatalog;
    let saved = 0;
    app.window._fbSaveCatalog = async (c) => { saved++; return realSave(c); };
    app.window._fbLoadCatalog = async () => { throw new Error('offline'); };
    try {
      await app.window.syncCatalog();
      await app.window.saveCatalogWithDeletions();
    } finally {
      app.window._fbLoadCatalog = realLoad;
      app.window._fbSaveCatalog = realSave;
    }
    expect(saved).toBe(0);
    expect(JSON.stringify(app.cloud.catalog)).toBe(before);
    expect(app.main.BOOKS.harbour).toBeTruthy();
    // a later successful load re-enables saving
    await app.window.syncCatalog();
    await app.window.saveCatalogWithDeletions();
    expect(app.cloud.catalog.harbour).toBeTruthy();
  });
});

describe('Edit Book form', () => {
  it('clears author email and Stripe link, and keeps fields it does not list', async () => {
    app.window.openEditBookModal('harbour');
    $('nb-pw').value = '';
    $('nb-paylink').value = '';
    await app.window.saveBookFromModal();
    const b = app.main.BOOKS.harbour;
    expect(b.authorEmail).toBe('');
    expect(b.stripeLink).toBe('');
    expect(b.customNote).toBe('keep me');
  });

  it('refuses to overwrite a different book that owns the id', async () => {
    app.window.openAddBookModal();
    $('nb-id').value = 'other';
    $('nb-title').value = 'Imposter';
    await app.window.saveBookFromModal();
    expect(app.main.BOOKS.other.title).toBe('Other Book');
  });
});
