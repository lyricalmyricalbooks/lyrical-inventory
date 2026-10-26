// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  DEVICE_NOTIFY_KINDS,
  deviceNotifyActive,
  deviceNotifyNote,
  notifyDevice,
  renderDeviceNotifySwitches,
  runDeviceNotifyClick,
  setAppIconBadge,
  setDeviceNotifyFallback,
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
  setDeviceNotifyFallback(null);
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
    expect(shown).toEqual([{ title: '2 new orders', options: expect.objectContaining({ body: 'Recorded', tag: 'lm-bc-new-orders', data: { tag: 'lm-bc-new-orders' } }) }]);
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

  it('runs the press handler for that notification, or opens the list when it is gone', async () => {
    installNotification('granted');
    const pressed = [];
    setDeviceNotifyFallback(tag => pressed.push(`fallback:${tag}`));
    await notifyDevice({ title: 'x', tag: 'known', force: true, onClick: () => pressed.push('known') });
    runDeviceNotifyClick('known');
    runDeviceNotifyClick('from-before-a-reload');
    expect(pressed).toEqual(['known', 'fallback:from-before-a-reload']);
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
