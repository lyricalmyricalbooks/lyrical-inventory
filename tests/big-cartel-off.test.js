// @vitest-environment jsdom
// A shop that has left Big Cartel can switch it off: the saved store is
// forgotten and Big Cartel leaves the menus, while past orders stay put.
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { loadApp, makeBook } from './helpers/load-app.js';

let app, bc;
beforeAll(async () => {
  app = await loadApp({ books: [makeBook({ id: 'bk' })] });
  bc = await import('../src/features/bigcartel.js');
}, 30000);

describe('switching Big Cartel off', () => {
  it('hides it when no store is saved', async () => {
    await bc.refreshBigCartelVisibility();
    expect(document.body.classList.contains('bc-off')).toBe(true);
  });

  it('shows it again once a store is saved', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 503, json: async () => ({}), text: async () => '' })));
    document.getElementById('bc-subdomain').value = 'my-shop';
    document.getElementById('bc-username').value = 'me';
    document.getElementById('bc-password').value = 'token';
    await bc.saveBigCartelSettings();
    expect(document.body.classList.contains('bc-off')).toBe(false);
    expect((await app.window._fbLoadSettings('bigCartelConfig')).subdomain).toBe('my-shop');
  });

  it('forgets the store and hides it after "Stop using Big Cartel"', async () => {
    app.window.localStorage.setItem('lm-bigcartel-orders-cache', '{"orders":[]}');
    const stopping = bc.stopUsingBigCartel();
    await app.answerConfirm(true);
    await stopping;
    expect(document.body.classList.contains('bc-off')).toBe(true);
    expect((await app.window._fbLoadSettings('bigCartelConfig')).subdomain).toBe('');
    expect(app.window.localStorage.getItem('lm-bigcartel-orders-cache')).toBeNull();
    vi.unstubAllGlobals();
  });
});
