// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  DEVICE_NOTIFY_KINDS,
  deviceNotifyActive,
  deviceNotifyNote,
  notifyDevice,
  renderDeviceNotifySwitches,
  notificationTarget,
  runDeviceNotifyClick,
  setAppIconBadge,
  setDeviceNotifyOpener,
  targetFromAddress,
  switchDeviceNotify,
} from '../src/lib/device-notify.js';

/** A stand-in for the browser's Notification, recording what was built. */
function installNotification(permission = 'granted', { throws = false } = {}) {
  const built = [];
  function FakeNotification(title, options) {
    if (throws) throw new TypeError('Illegal constructor');
    built.push({ title, options });
    this.close = () => {};
  }
  FakeNotification.permission = permission;
  FakeNotification.requestPermission = vi.fn(async () => FakeNotification.permission);
  globalThis.Notification = FakeNotification;
  return { built, FakeNotification };
}

function installWorker(showNotification) {
  Object.defineProperty(navigator, 'serviceWorker', {
    configurable: true,
    value: { getRegistration: async () => ({ showNotification }), addEventListener: () => {} },
  });
}

function setInView(inView) {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => (inView ? 'visible' : 'hidden') });
  document.hasFocus = () => inView;
}

beforeEach(() => {
  localStorage.clear();
  setInView(false);
});

afterEach(() => {
  delete globalThis.Notification;
  delete navigator.serviceWorker;
  setDeviceNotifyOpener(null);
});

describe('sending a notification to the device', () => {
  it('goes through the service worker, which is the only way Android shows one', async () => {
    const { built } = installNotification('granted', { throws: true });
    const shown = [];
    installWorker(async (title, options) => { shown.push({ title, options }); });
    localStorage.setItem(DEVICE_NOTIFY_KINDS.orders.key, '1');

    const sent = await notifyDevice({ kind: 'orders', title: '2 new orders', body: 'Recorded', tag: 'lm-bc-new-orders' });

    expect(sent).toBe(true);
    expect(built).toHaveLength(0);
    expect(shown).toEqual([{ title: '2 new orders', options: expect.objectContaining({ body: 'Recorded', tag: 'lm-bc-new-orders', data: { tag: 'lm-bc-new-orders', open: null } }) }]);
  });

  it('falls back to a plain notification where no worker is running', async () => {
    const { built } = installNotification('granted');
    localStorage.setItem(DEVICE_NOTIFY_KINDS.payments.key, '1');
    expect(await notifyDevice({ kind: 'payments', title: 'Invoice paid', tag: 'lm-stripe' })).toBe(true);
    expect(built.map(n => n.title)).toEqual(['Invoice paid']);
  });

  it('uses an icon path that works from the app’s own folder, not the site root', async () => {
    const { built } = installNotification('granted');
    await notifyDevice({ title: 'Hi', tag: 't', force: true });
    expect(built[0].options.icon).not.toMatch(/^\//);
  });

  it('stays quiet when the owner has not asked for that kind', async () => {
    const { built } = installNotification('granted');
    expect(await notifyDevice({ kind: 'orders', title: 'New order', tag: 't' })).toBe(false);
    expect(built).toHaveLength(0);
  });

  it('stays quiet while the owner is looking at the app, where the card already says it', async () => {
    const { built } = installNotification('granted');
    localStorage.setItem(DEVICE_NOTIFY_KINDS.orders.key, '1');
    setInView(true);
    expect(await notifyDevice({ kind: 'orders', title: 'New order', tag: 't' })).toBe(false);
    expect(await notifyDevice({ title: 'Test', tag: 'lm-test', force: true })).toBe(true);
    expect(built.map(n => n.title)).toEqual(['Test']);
  });

  it('never throws when the browser refuses everything', async () => {
    installNotification('granted', { throws: true });
    localStorage.setItem(DEVICE_NOTIFY_KINDS.orders.key, '1');
    await expect(notifyDevice({ kind: 'orders', title: 'x', tag: 't' })).resolves.toBe(false);
  });

  it('carries where a press should land inside the notification, so it survives the app closing', async () => {
    const shown = [];
    installNotification('granted', { throws: true });
    installWorker(async (title, options) => { shown.push(options); });
    await notifyDevice({ title: 'Invoice paid', tag: 'lm-stripe', force: true, open: { to: 'invoice', id: 'inv-42' } });
    expect(shown[0].data).toEqual({ tag: 'lm-stripe', open: { to: 'invoice', id: 'inv-42' } });
  });

  it('a press goes to its destination, or to the list when it has none', async () => {
    const { built } = installNotification('granted');
    const went = [];
    setDeviceNotifyOpener(target => went.push(target));
    await notifyDevice({ title: 'Labels', tag: 'lm-postage', force: true, open: { to: 'labels', source: 'canadapost' } });
    built.length = 0;
    runDeviceNotifyClick({ to: 'tab', tab: 'shipping' });
    runDeviceNotifyClick(undefined);
    expect(went).toEqual([{ to: 'tab', tab: 'shipping' }, null]);
  });
});

describe('where a press can go', () => {
  it('only trusts the known destinations', () => {
    expect(notificationTarget({ to: 'tab', tab: 'bigcartel' })).toEqual({ to: 'tab', tab: 'bigcartel' });
    expect(notificationTarget({ to: 'book', book: 'The Hound', tab: 'dashboard', extra: 1 })).toEqual({ to: 'book', book: 'The Hound', tab: 'dashboard' });
    expect(notificationTarget({ to: 'labels', source: 'email' })).toEqual({ to: 'labels', source: 'email' });
    expect(notificationTarget({ to: 'tab', tab: 'settings-danger-zone' })).toBeNull();
    expect(notificationTarget({ to: 'labels', source: 'anything' })).toBeNull();
    expect(notificationTarget({ to: 'invoice', id: '' })).toBeNull();
    expect(notificationTarget({ to: 'eval', code: 'alert(1)' })).toBeNull();
    expect(notificationTarget('tab')).toBeNull();
  });

  it('reads the destination off the address the app was reopened on', () => {
    const open = encodeURIComponent(JSON.stringify({ to: 'invoice', id: 'inv-42' }));
    expect(targetFromAddress(`?notif=lm-stripe&open=${open}`)).toEqual({ to: 'invoice', id: 'inv-42' });
    expect(targetFromAddress('?notif=lm-test')).toBeNull();
    expect(targetFromAddress('?notif=x&open=not-json')).toBeNull();
    expect(targetFromAddress('?ls=a')).toBeUndefined();
  });
});

describe('the switches', () => {
  it('asks permission the first time, and only remembers "on" once it is granted', async () => {
    const { FakeNotification } = installNotification('default');
    FakeNotification.requestPermission = vi.fn(async () => 'denied');
    expect(await switchDeviceNotify('orders', true)).toBe('blocked');
    expect(localStorage.getItem(DEVICE_NOTIFY_KINDS.orders.key)).toBeNull();

    FakeNotification.requestPermission = vi.fn(async () => { FakeNotification.permission = 'granted'; return 'granted'; });
    expect(await switchDeviceNotify('orders', true)).toBe('on');
    expect(deviceNotifyActive('orders')).toBe(true);
    expect(await switchDeviceNotify('orders', false)).toBe('off');
    expect(deviceNotifyActive('orders')).toBe(false);
  });

  it('says why a switch cannot work', () => {
    expect(deviceNotifyNote('orders')).toBe('Not supported in this browser.');
    installNotification('denied');
    expect(deviceNotifyNote('payments')).toMatch(/Blocked/);
  });

  it('paints every copy of a switch the same, wherever it sits', () => {
    installNotification('granted');
    localStorage.setItem(DEVICE_NOTIFY_KINDS.payments.key, '1');
    document.body.innerHTML = `
      <input type="checkbox" data-device-notify="orders"><span data-device-notify-note="orders"></span>
      <input type="checkbox" data-device-notify="payments" id="a"><input type="checkbox" data-device-notify="payments" id="b">
      <button data-device-notify-test hidden></button>`;
    renderDeviceNotifySwitches();
    expect(document.querySelector('[data-device-notify="orders"]').checked).toBe(false);
    expect(document.getElementById('a').checked).toBe(true);
    expect(document.getElementById('b').checked).toBe(true);
    expect(document.querySelector('[data-device-notify-note="orders"]').textContent).toBe(DEVICE_NOTIFY_KINDS.orders.note);
    expect(document.querySelector('[data-device-notify-test]').hidden).toBe(false);
  });
});

describe('the app icon count', () => {
  it('shows the unread count and clears it at zero', () => {
    const calls = [];
    navigator.setAppBadge = (n) => { calls.push(['set', n]); return Promise.resolve(); };
    navigator.clearAppBadge = () => { calls.push(['clear']); return Promise.resolve(); };
    setAppIconBadge(3);
    setAppIconBadge(0);
    expect(calls).toEqual([['set', 3], ['clear']]);
    delete navigator.setAppBadge;
    delete navigator.clearAppBadge;
    expect(() => setAppIconBadge(2)).not.toThrow();
  });
});
