// The Website · Inventory switcher in the real app, signed in as the publisher:
// it shows, counts website orders not sent yet, says when it is offline, opens
// the website in its own tab, and a link from the website opens the order here.
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import { loadApp, makeBook } from './helpers/load-app.js';
import { WEBSITE_TAB_NAME, forgetOtherApp } from '../src/lib/app-switch.js';

const BOOK = 'harbour';
const books = [makeBook({ id: BOOK, title: 'Harbour Lights' }), makeBook({ id: 'lanterns', title: 'Lanterns' })];
const link = { ordersCb: null };

const webRow = (orderId, status, over = {}) => ({
  id: `r-${orderId}`,
  uid: `web-${orderId}-${BOOK}`,
  sheetsId: `web-${orderId}-${BOOK}`,
  webOrderId: orderId,
  chan: 'Website',
  num: `#${orderId}`,
  date: '2026-10-11',
  qty: 1,
  price: 40,
  cur: 'CAD',
  fulfilledOnWebsite: true,
  webPaymentStatus: 'paid',
  webFulfillmentStatus: status,
  webSourceUpdatedAt: '2026-10-11T15:00:00.000Z',
  ...over,
});

let app;
const switches = () => [...document.querySelectorAll('[data-app-switch]')];
const links = () => [...document.querySelectorAll('[data-app-switch-link]')];
const badges = () => links().map(a => a.querySelector('.app-switch-badge'));
const waitFor = (fn) => vi.waitFor(fn, { timeout: 4000, interval: 10 });

function click(el) {
  const event = new window.MouseEvent('click', { bubbles: true, cancelable: true, button: 0 });
  el.dispatchEvent(event);
  return event;
}

beforeAll(async () => {
  app = await loadApp({
    books,
    overrides: {
      _fbWatchWebsiteOrders: (cb) => { link.ordersCb = cb; return () => {}; },
      _fbWatchWebsiteLinkStatus: (cb) => { cb({ website: { at: new Date().toISOString() }, app: { importConsentAt: '2026-10-01T00:00:00.000Z' } }); return () => {}; },
      _fbMarkLinkSwitchedOn: async (at) => at,
      _fbPublishWebsiteLink: async () => ({ ok: true, at: new Date().toISOString(), feeds: 0, accepted: [], refused: [], sent: [], current: [], blocked: [], unavailable: [] }),
    },
  });
}, 30000);

beforeEach(async () => {
  forgetOtherApp();
  await app.resetBook(BOOK, { hist: [webRow('WEB-1', 'paid'), webRow('WEB-2', 'shipped')] });
  link.ordersCb([]);
  await app.settle();
});

describe('the switcher for the publisher', () => {
  it('shows in the sidebar, the More sheet and the phone header, and names the tab', () => {
    expect(switches().length).toBe(2);
    expect(switches().every(el => el.hidden === false)).toBe(true);
    expect(links().length).toBe(3);
    expect(links().every(a => a.hidden === false)).toBe(true);
    expect(window.name).toBe('lm-inventory-app');
    // The current half is not a link.
    const current = document.querySelector('#pub-sidebar .app-switch-seg.is-current');
    expect(current.tagName).toBe('SPAN');
    expect(current.getAttribute('aria-current')).toBe('page');
  });

  it('counts the website orders paid and not sent yet', async () => {
    await waitFor(() => expect(badges().every(b => b.hidden === false && b.textContent === '1')).toBe(true));
    const sidebarLink = document.querySelector('#pub-sidebar [data-app-switch-link]');
    expect(sidebarLink.getAttribute('aria-label')).toBe('Open the website admin. 1 website order not sent yet.');
    expect(sidebarLink.getAttribute('href')).toBe('https://lyricalmyrical-web-v2.web.app/admin');
  });

  it('drops the count when that order ships', async () => {
    await app.resetBook(BOOK, { hist: [webRow('WEB-1', 'shipped')] });
    link.ordersCb([]);
    await waitFor(() => expect(badges().every(b => b.hidden)).toBe(true));
    expect(document.querySelector('#pub-sidebar [data-app-switch-link]').getAttribute('aria-label')).toBe('Open the website admin');
  });

  it('hides the count with the other menu alerts', async () => {
    await waitFor(() => expect(badges()[0].hidden).toBe(false));
    window.toggleSidebarAlerts();
    expect(badges().every(b => b.hidden)).toBe(true);
    window.toggleSidebarAlerts();
    expect(badges().every(b => b.hidden === false)).toBe(true);
  });

  it('opens the website in its own named tab, keeping the opener', () => {
    const tab = { location: { href: 'about:blank', replace: vi.fn() }, focus: vi.fn(), closed: false };
    const open = vi.fn(() => tab);
    vi.stubGlobal('open', open);
    window.open = open;
    const event = click(document.querySelector('#pub-sidebar [data-app-switch-link]'));
    expect(open).toHaveBeenCalledWith('', WEBSITE_TAB_NAME);
    expect(tab.location.replace).toHaveBeenCalledWith('https://lyricalmyrical-web-v2.web.app/admin');
    expect(event.defaultPrevented).toBe(true);
  });

  it('says it is offline and opens nothing', async () => {
    const open = vi.fn(() => null);
    window.open = open;
    app.setOnline(false);
    const a = document.querySelector('#pub-sidebar [data-app-switch-link]');
    expect(a.getAttribute('aria-disabled')).toBe('true');
    expect(a.classList.contains('is-offline')).toBe(true);
    const event = click(a);
    expect(event.defaultPrevented).toBe(true);
    expect(open).not.toHaveBeenCalled();
    expect(app.toast()).toBe('You’re offline. The website opens once you’re back online.');
    app.setOnline(true);
    expect(a.hasAttribute('aria-disabled')).toBe(false);
  });

  it('puts "Open on the website" on a website sale in History', async () => {
    app.window.switchBook(BOOK);
    app.window.switchTab('history');
    const linkEl = document.querySelector('#hist-body [data-open-website="WEB-1"]');
    expect(linkEl).not.toBeNull();
    expect(linkEl.getAttribute('href')).toBe('https://lyricalmyrical-web-v2.web.app/admin#orders/WEB-1');
  });
});

describe('a link from the website to one of its orders', () => {
  it('opens that order in the book’s History and tidies the address', async () => {
    app.window.switchBook('all');
    window.location.hash = '#website-order=WEB-1';
    window.dispatchEvent(new window.HashChangeEvent('hashchange'));
    await waitFor(() => expect(document.getElementById('tab-history').classList.contains('active')).toBe(true));
    expect(app.main.activeBook).toBe(BOOK);
    expect(document.getElementById('hist-search').value).toBe('#WEB-1');
    expect(window.location.hash).toBe('');
    expect(app.toast()).toContain('Website order #WEB-1 · Harbour Lights');
  });

  it('opens the Website orders card when the order is not in the books yet', async () => {
    app.setOnline(false);
    window.location.hash = '#website-order=WEB-9';
    window.dispatchEvent(new window.HashChangeEvent('hashchange'));
    await waitFor(() => expect(document.getElementById('tab-website').classList.contains('active')).toBe(true));
    expect(app.toast()).toContain('Website order WEB-9 isn’t in your books on this device yet');
    expect(window.location.hash).toBe('');
    app.setOnline(true);
  });

  it('ignores any other hash', async () => {
    app.window.switchBook(BOOK);
    app.window.switchTab('expenses');
    window.location.hash = '#something-else';
    window.dispatchEvent(new window.HashChangeEvent('hashchange'));
    await app.settle();
    expect(document.getElementById('tab-expenses').classList.contains('active')).toBe(true);
    expect(window.location.hash).toBe('#something-else');
    window.location.hash = '';
  });
});
