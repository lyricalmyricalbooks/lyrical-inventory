// An artist signed in to their own book never sees the Website · Inventory
// switcher, and a link meant for the publisher opens nothing for them.
import { describe, it, expect, beforeAll } from 'vitest';
import { loadApp, makeBook } from './helpers/load-app.js';

describe('the app switcher for an artist', () => {
  let app;
  let hashAfterBoot;

  beforeAll(async () => {
    // The old admin forward leaves ?mode=admin behind; a website link adds the hash.
    window.history.replaceState(null, '', '/?mode=admin&keep=1#website-order=WEB-1');
    app = await loadApp({
      books: [makeBook({ id: 'harbour', authorEmail: 'ada@example.com' })],
      user: { email: 'ada@example.com', uid: 'ada', emailVerified: true },
    });
    await app.settle(10);
    hashAfterBoot = window.location.hash;
  }, 30000);

  it('is hidden everywhere', () => {
    const parts = [...document.querySelectorAll('[data-app-switch], [data-app-switch-link]')];
    expect(parts.length).toBeGreaterThan(0);
    expect(parts.every(el => el.hidden)).toBe(true);
    expect(document.getElementById('pw-app').classList.contains('pub-shell')).toBe(false);
  });

  it('does not name the tab as the publisher’s inventory app', () => {
    expect(window.name).not.toBe('lm-inventory-app');
  });

  it('drops the leftover ?mode=admin and keeps the rest of the address', () => {
    expect(window.location.search).toBe('?keep=1');
  });

  it('drops a website order link instead of opening it', () => {
    expect(hashAfterBoot).toBe('');
    expect(document.getElementById('tab-history').classList.contains('active')).toBe(false);
  });
});
