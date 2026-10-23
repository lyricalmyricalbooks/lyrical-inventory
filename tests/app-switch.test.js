// The Website · Inventory switcher's shared rules (src/lib/app-switch.js):
// the addresses, the deep link both ways, the "not sent yet" count, when the
// page is an installed app, and how the other app's tab is found again.
import { describe, it, expect, beforeEach } from 'vitest';
import {
  INVENTORY_APP_URL,
  WEBSITE_ADMIN,
  WEBSITE_ORIGINS,
  WEBSITE_TAB_NAME,
  countWebsiteOrdersNotSent,
  inventoryOrderUrl,
  isStandalone,
  notSentWords,
  openOnWebsiteHtml,
  openOtherApp,
  originOf,
  parseWebsiteOrderHash,
  searchWithoutAdminMode,
  useWebsiteFrom,
  websiteAdmin,
  websiteAdminFor,
  websiteOrderUrl,
} from '../src/lib/app-switch.js';

describe('addresses', () => {
  it('opens the website admin on one order', () => {
    expect(websiteOrderUrl('ABCD-123456-WXYZ')).toBe(`${WEBSITE_ADMIN}#orders/ABCD-123456-WXYZ`);
    expect(websiteOrderUrl(' a b/c ')).toBe(`${WEBSITE_ADMIN}#orders/a%20b%2Fc`);
    expect(websiteOrderUrl('')).toBe(WEBSITE_ADMIN);
    expect(websiteOrderUrl(null)).toBe(WEBSITE_ADMIN);
  });

  it('builds the link the website uses to open an order here', () => {
    expect(inventoryOrderUrl('ABCD-1')).toBe(`${INVENTORY_APP_URL}#website-order=ABCD-1`);
    expect(inventoryOrderUrl('')).toBe(INVENTORY_APP_URL);
  });

  it('sends deep links back to the website address this app was opened from', () => {
    expect(websiteAdminFor('https://www.lyricalmyricalbooks.com/admin#orders/1')).toBe('https://www.lyricalmyricalbooks.com/admin');
    expect(websiteAdminFor('https://lyricalmyrical-web-v2.firebaseapp.com/admin')).toBe('https://lyricalmyrical-web-v2.firebaseapp.com/admin');
    expect(websiteAdminFor('https://mail.google.com/')).toBe(WEBSITE_ADMIN);
    expect(websiteAdminFor('android-app://com.example/')).toBe(WEBSITE_ADMIN);
    expect(websiteAdminFor('')).toBe(WEBSITE_ADMIN);
    try {
      expect(useWebsiteFrom('https://lyricalmyricalbooks.com/admin')).toBe('https://lyricalmyricalbooks.com/admin');
      expect(websiteAdmin()).toBe('https://lyricalmyricalbooks.com/admin');
      expect(websiteOrderUrl('A-1')).toBe('https://lyricalmyricalbooks.com/admin#orders/A-1');
      expect(openOnWebsiteHtml('A-1')).toContain('href="https://lyricalmyricalbooks.com/admin#orders/A-1"');
    } finally {
      useWebsiteFrom('');
    }
    expect(websiteAdmin()).toBe(WEBSITE_ADMIN);
  });

  it('drops a leftover ?mode=admin and keeps everything else', () => {
    expect(searchWithoutAdminMode('?mode=admin')).toBe('');
    expect(searchWithoutAdminMode('?mode=admin&transfer_paid=a.b')).toBe('?transfer_paid=a.b');
    expect(searchWithoutAdminMode('?setup=paylink&mode=admin')).toBe('?setup=paylink');
    expect(searchWithoutAdminMode('?mode=other')).toBeNull();
    expect(searchWithoutAdminMode('?setup=paylink')).toBeNull();
    expect(searchWithoutAdminMode('')).toBeNull();
  });

  it('lists every website address, and reads origins safely', () => {
    expect(WEBSITE_ORIGINS).toContain('https://lyricalmyrical-web-v2.web.app');
    expect(WEBSITE_ORIGINS).toContain('https://www.lyricalmyricalbooks.com');
    expect(originOf('https://lyricalmyrical-web-v2.web.app/admin#orders/x')).toBe('https://lyricalmyrical-web-v2.web.app');
    expect(originOf('android-app://com.example')).toBe('');
    expect(originOf('')).toBe('');
    expect(originOf('not a url')).toBe('');
  });
});

describe('the deep link into this app', () => {
  it('reads #website-order=<id>, with or without the #', () => {
    expect(parseWebsiteOrderHash('#website-order=ABCD-123456-WXYZ')).toBe('ABCD-123456-WXYZ');
    expect(parseWebsiteOrderHash('website-order=WEB-0123456789abcdef01234567')).toBe('WEB-0123456789abcdef01234567');
    expect(parseWebsiteOrderHash('#website-order=ABCD%2D1')).toBe('ABCD-1');
  });

  it('round-trips the link the website builds', () => {
    const url = new URL(inventoryOrderUrl('ABCD-123456-WXYZ'));
    expect(parseWebsiteOrderHash(url.hash)).toBe('ABCD-123456-WXYZ');
  });

  it('opens nothing for any other hash or a malformed id', () => {
    expect(parseWebsiteOrderHash('')).toBeNull();
    expect(parseWebsiteOrderHash('#')).toBeNull();
    expect(parseWebsiteOrderHash('#orders/ABCD')).toBeNull();
    expect(parseWebsiteOrderHash('#website-order=')).toBeNull();
    expect(parseWebsiteOrderHash('#website-order=%E0%A4%A')).toBeNull();
    expect(parseWebsiteOrderHash('#website-order=a/b')).toBeNull();
    expect(parseWebsiteOrderHash('#website-order=<script>')).toBeNull();
    expect(parseWebsiteOrderHash('#website-order=..')).toBeNull();
    expect(parseWebsiteOrderHash(`#website-order=${'x'.repeat(201)}`)).toBeNull();
    expect(parseWebsiteOrderHash(null)).toBeNull();
  });
});

describe('website orders not sent yet', () => {
  const doc = (id, over = {}, ff = {}) => ({
    id,
    web: { orderId: id, test: false, paymentStatus: 'paid', fulfillment: { status: 'paid', ...ff }, ...over },
  });
  const row = (id, pay, status, at = '') => ({ webOrderId: id, webPaymentStatus: pay, webFulfillmentStatus: status, webSourceUpdatedAt: at });

  it('counts paid orders that have not left the shop', () => {
    expect(countWebsiteOrdersNotSent({ docs: [doc('A'), doc('B', {}, { status: 'processing' }), doc('C', {}, { status: '' })] })).toBe(3);
  });

  it('leaves out sent, collected, cancelled and pickup-ready orders', () => {
    const docs = ['shipped', 'out_for_delivery', 'delivered', 'collected', 'completed', 'cancelled', 'ready_for_pickup']
      .map((status, i) => doc(`S${i}`, {}, { status }));
    expect(countWebsiteOrdersNotSent({ docs })).toBe(0);
  });

  it('leaves out refunds and rehearsal orders', () => {
    const docs = [
      doc('R1', { paymentStatus: 'refunded' }),
      doc('R2', { paymentStatus: 'refund_pending' }),
      doc('T1', { test: true }),
    ];
    expect(countWebsiteOrdersNotSent({ docs })).toBe(0);
  });

  it('reads orders already brought in from their sale rows, one per order', () => {
    const rows = [
      row('A', 'paid', 'paid'), row('A', 'paid', 'paid'),   // two books, one order
      row('B', 'paid', 'shipped'),
      row('C', 'refunded', 'paid'),
    ];
    expect(countWebsiteOrdersNotSent({ rows })).toBe(1);
  });

  it('uses the newest push when two rows of an order disagree', () => {
    const rows = [row('A', 'paid', 'paid', '2026-10-11T10:00:00Z'), row('A', 'paid', 'shipped', '2026-10-12T10:00:00Z')];
    expect(countWebsiteOrdersNotSent({ rows })).toBe(0);
    expect(countWebsiteOrdersNotSent({ rows: rows.slice().reverse() })).toBe(0);
  });

  it('lets a waiting website document win over the rows it will update', () => {
    const rows = [row('A', 'paid', 'paid')];
    expect(countWebsiteOrdersNotSent({ rows, docs: [doc('A', {}, { status: 'shipped' })] })).toBe(0);
    expect(countWebsiteOrdersNotSent({ rows: [row('A', 'paid', 'shipped')], docs: [doc('A')] })).toBe(1);
  });

  it('never counts rows that predate the website sending its state', () => {
    expect(countWebsiteOrdersNotSent({ rows: [{ webOrderId: 'A' }, { webOrderId: 'B', webPaymentStatus: 'paid' }] })).toBe(0);
    expect(countWebsiteOrdersNotSent({ rows: [{ num: '12', webPaymentStatus: 'paid', webFulfillmentStatus: 'paid' }] })).toBe(0);
  });

  it('copes with nothing at all', () => {
    expect(countWebsiteOrdersNotSent()).toBe(0);
    expect(countWebsiteOrdersNotSent({ docs: [null, {}, { id: 'x' }], rows: [null] })).toBe(0);
  });

  it('words the badge, and shows none for zero or nothing known', () => {
    expect(notSentWords(1)).toEqual({ badge: '1', words: '1 website order not sent yet' });
    expect(notSentWords(3)).toEqual({ badge: '3', words: '3 website orders not sent yet' });
    expect(notSentWords(140).badge).toBe('99+');
    expect(notSentWords(0)).toBeNull();
    expect(notSentWords(null)).toBeNull();
    expect(notSentWords(undefined)).toBeNull();
  });
});

describe('installed app or browser tab', () => {
  const mm = (matches) => (q) => ({ matches: matches.includes(q) });

  it('is an installed app on the home screen, an iPhone, or the Android app', () => {
    expect(isStandalone({ matchMedia: mm(['(display-mode: standalone)']) })).toBe(true);
    expect(isStandalone({ matchMedia: mm(['(display-mode: fullscreen)']) })).toBe(true);
    expect(isStandalone({ navigator: { standalone: true } })).toBe(true);
    expect(isStandalone({ referrer: 'android-app://com.lyricalmyrical.inventory/' })).toBe(true);
    expect(isStandalone({ twaSeen: true })).toBe(true);
  });

  it('is a browser tab otherwise', () => {
    expect(isStandalone({ matchMedia: mm([]), navigator: {}, referrer: 'https://lyricalmyrical-web-v2.web.app/' })).toBe(false);
    expect(isStandalone()).toBe(false);
    expect(isStandalone({ matchMedia: () => { throw new Error('old'); } })).toBe(false);
  });
});

// Fake windows: a same-origin blank tab can be read; another app's tab throws
// on any read of its location, like a real cross-origin window.
function fakeTab({ crossOrigin = false, href = 'about:blank', closed = false } = {}) {
  const log = [];
  let current = href;
  const location = {
    replace(url) { log.push(['replace', url]); current = url; },
  };
  Object.defineProperty(location, 'href', {
    get() { if (crossOrigin) throw new Error('SecurityError'); return current; },
    set(url) { log.push(['href', url]); current = url; },
  });
  return { location, closed, log, focused: 0, focus() { this.focused++; } };
}

function fakeWindow({ opener = null, openReturns = null } = {}) {
  const opened = [];
  return {
    opener,
    opened,
    open(url, name) { opened.push([url, name]); return openReturns; },
  };
}

describe('opening the other app', () => {
  const url = websiteOrderUrl('ABCD-1');
  let memory;
  beforeEach(() => { memory = { win: null }; });

  it('never asks the tab that opened this one to come forward', () => {
    // Browsers ignore that, so a deep link would change a hidden tab. The
    // named lookup finds that tab instead, and focusing it works.
    const opener = fakeTab({ crossOrigin: true });
    const named = fakeTab({ crossOrigin: true });
    const win = fakeWindow({ opener, openReturns: named });
    expect(openOtherApp({ url, deep: true, win, memory })).toBe('named');
    expect(opener.focused).toBe(0);
    expect(opener.log).toEqual([]);
    expect(win.opened).toEqual([['', WEBSITE_TAB_NAME]]);
    expect(named.log).toEqual([['href', url]]);
    expect(named.focused).toBe(1);
  });

  it('opens a new named tab the first time, keeping the opener link', () => {
    const tab = fakeTab();
    const win = fakeWindow({ openReturns: tab });
    expect(openOtherApp({ url, win, memory })).toBe('opened');
    expect(win.opened).toEqual([['', WEBSITE_TAB_NAME]]);
    expect(tab.log).toEqual([['replace', url]]);
    expect(tab.focused).toBe(1);
    expect(memory.win).toBe(tab);
    expect(tab.opener).toBeUndefined(); // never cut (no noopener)
  });

  it('reuses the tab it opened before instead of opening a third', () => {
    const tab = fakeTab({ crossOrigin: true });
    memory.win = tab;
    const win = fakeWindow({ openReturns: fakeTab() });
    expect(openOtherApp({ url, deep: true, win, memory })).toBe('remembered');
    expect(win.opened).toEqual([]);
    expect(tab.log).toEqual([['href', url]]);
    expect(tab.focused).toBe(1);
  });

  it('only brings a reused tab forward on a plain switch, so it keeps its place', () => {
    const tab = fakeTab({ crossOrigin: true });
    memory.win = tab;
    expect(openOtherApp({ url: WEBSITE_ADMIN, deep: false, win: fakeWindow(), memory })).toBe('remembered');
    expect(tab.log).toEqual([]);
    expect(tab.focused).toBe(1);
  });

  it('forgets a remembered tab once it is closed', () => {
    memory.win = fakeTab({ closed: true });
    const fresh = fakeTab();
    expect(openOtherApp({ url, win: fakeWindow({ openReturns: fresh }), memory })).toBe('opened');
    expect(memory.win).toBe(fresh);
  });

  it('finds the website already open in its named tab and sends a deep link there', () => {
    const tab = fakeTab({ crossOrigin: true });
    const win = fakeWindow({ openReturns: tab });
    expect(openOtherApp({ url, deep: true, win, memory })).toBe('named');
    expect(tab.log).toEqual([['href', url]]);
    expect(tab.focused).toBe(1);
    expect(memory.win).toBe(tab);
  });

  it('leaves the website where it is on a plain switch to its named tab', () => {
    const tab = fakeTab({ crossOrigin: true });
    expect(openOtherApp({ url: WEBSITE_ADMIN, deep: false, win: fakeWindow({ openReturns: tab }), memory })).toBe('named');
    expect(tab.log).toEqual([]);
    expect(tab.focused).toBe(1);
  });

  it('lets the plain link open when the pop-up is blocked', () => {
    const win = fakeWindow({ openReturns: null });
    expect(openOtherApp({ url, win, memory })).toBe('link');
    expect(memory.win).toBeNull();
  });

  it('never uses window.open in an installed app', () => {
    const win = fakeWindow({ openReturns: fakeTab() });
    expect(openOtherApp({ url, win, memory, standalone: true })).toBe('link');
    expect(win.opened).toEqual([]);
  });

  it('does nothing without an address', () => {
    expect(openOtherApp({ url: '', win: fakeWindow(), memory })).toBe('link');
  });
});

describe('the "Open on the website" link', () => {
  it('is a real link to the order with the website tab as its target', () => {
    const html = openOnWebsiteHtml('ABCD-1');
    expect(html).toContain(`href="${WEBSITE_ADMIN}#orders/ABCD-1"`);
    expect(html).toContain(`target="${WEBSITE_TAB_NAME}"`);
    expect(html).toContain('data-open-website="ABCD-1"');
    expect(html).toContain('Open on the website');
    expect(html).not.toContain('noopener');
  });

  it('escapes the id and is empty without one', () => {
    expect(openOnWebsiteHtml('"><x')).not.toContain('"><x');
    expect(openOnWebsiteHtml('')).toBe('');
  });
});
