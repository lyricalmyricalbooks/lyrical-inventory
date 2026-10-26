// Notifications on the device itself — the phone's or computer's own pop-ups,
// for news that arrives while nobody is looking at the app.
//
// Three features used to build these by hand with `new Notification(...)`.
// That constructor is refused outright by Chrome on Android, which is where the
// Play Store app runs: the switch said "on", the permission was granted, and
// nothing ever arrived. On Android a notification has to come from the service
// worker, so this sends it through the worker when one is running and only
// falls back to the constructor where that is the only option (desktop Safari,
// a dev build with no worker).
//
// It also keeps the two switches in one place. "Orders and parcels" and
// "Payments" each used to be reachable only from the tab they belong to, so
// turning them on meant knowing where to look; now the notifications panel
// carries both as well, and every copy of a switch is painted from here.
//
// Best-effort throughout: a blocked or missing notification must never get in
// the way of the ledger write the news is about, which already happened.

/** The two things the owner can ask to be told about, and where each is remembered. */
export const DEVICE_NOTIFY_KINDS = {
  orders: {
    key: 'lm-bc-order-notify',
    note: 'Pops up on this device when a website order comes in, a parcel is marked shipped or labels file themselves.',
    onMessage: '✓ You’ll be notified on this device about new orders and parcels',
  },
  payments: {
    key: 'lm-stripe-paid-notify',
    note: 'Pops up on this device the moment a Stripe payment settles an invoice or an author pays you.',
    onMessage: '✓ You’ll be notified on this device when an invoice is paid',
  },
};

const ICON = 'pwa-192x192.png';
const CLICK_MESSAGE = 'lm-notification-click';

function store() {
  try { return typeof localStorage === 'undefined' ? null : localStorage; } catch (_) { return null; }
}

export function deviceNotificationsSupported() {
  return typeof Notification !== 'undefined';
}

/** 'unsupported', 'default' (never asked), 'granted' or 'denied'. */
export function deviceNotificationPermission() {
  if (!deviceNotificationsSupported()) return 'unsupported';
  return Notification.permission || 'default';
}

export function deviceNotifyPrefOn(kind) {
  const spec = DEVICE_NOTIFY_KINDS[kind];
  if (!spec) return false;
  try { return store()?.getItem(spec.key) === '1'; } catch (_) { return false; }
}

/** The switch is only "on" when a notification could actually reach the owner. */
export function deviceNotifyActive(kind) {
  return deviceNotifyPrefOn(kind) && deviceNotificationPermission() === 'granted';
}

function writePref(kind, on) {
  const spec = DEVICE_NOTIFY_KINDS[kind];
  if (!spec) return;
  try { store()?.setItem(spec.key, on ? '1' : '0'); } catch (_) { /* storage blocked */ }
}

/**
 * Turn one kind on or off, asking the browser's permission the first time.
 * Returns what happened, so the caller can say it: 'on', 'off', 'unsupported'
 * or 'blocked'.
 */
export async function switchDeviceNotify(kind, on) {
  if (!DEVICE_NOTIFY_KINDS[kind]) return 'off';
  if (!on) { writePref(kind, false); return 'off'; }
  if (!deviceNotificationsSupported()) return 'unsupported';
  let permission = deviceNotificationPermission();
  if (permission !== 'granted') {
    try { permission = await Notification.requestPermission(); } catch (_) { permission = 'denied'; }
  }
  if (permission !== 'granted') return 'blocked';
  writePref(kind, true);
  return 'on';
}

/**
 * What a switch does when pressed, from any copy of it: switch, say what
 * happened through `say` (the app's toast), and repaint every copy.
 */
export async function toggleDeviceNotify(kind, on, say = () => {}) {
  const result = await switchDeviceNotify(kind, on);
  if (result === 'unsupported') say('This browser does not support notifications', 'warn');
  else if (result === 'blocked') say('Notifications were blocked — nothing will be sent to this device', 'warn');
  else if (result === 'on') say(DEVICE_NOTIFY_KINDS[kind].onMessage);
  renderDeviceNotifySwitches();
  return result;
}

/** The line under a switch: what it does, or why it cannot. */
export function deviceNotifyNote(kind) {
  const permission = deviceNotificationPermission();
  if (permission === 'unsupported') return 'Not supported in this browser.';
  if (permission === 'denied') return 'Blocked — allow notifications for this site in your browser settings, then try again.';
  return DEVICE_NOTIFY_KINDS[kind]?.note || '';
}

/**
 * Paint every copy of every switch: `input[data-device-notify="<kind>"]` and
 * the `[data-device-notify-note="<kind>"]` line beside it. There is more than
 * one copy of each (the tab it belongs to, and the notifications panel), and
 * they must never disagree.
 */
export function renderDeviceNotifySwitches(root = typeof document === 'undefined' ? null : document) {
  if (!root) return;
  const supported = deviceNotificationsSupported();
  root.querySelectorAll('input[data-device-notify]').forEach(cb => {
    cb.disabled = !supported;
    cb.checked = supported && deviceNotifyActive(cb.dataset.deviceNotify);
  });
  root.querySelectorAll('[data-device-notify-note]').forEach(el => {
    el.textContent = deviceNotifyNote(el.dataset.deviceNotifyNote);
  });
  const test = root.querySelector('[data-device-notify-test]');
  if (test) test.hidden = deviceNotificationPermission() !== 'granted';
}

// ── Sending ────────────────────────────────────────────────────────────────

/**
 * Where pressing a notification takes the owner.
 *
 * A press used to run a function kept in memory, so it only worked while the
 * page that sent the notification was still open. On a phone the system closes
 * the app freely, and a press then reopened it on the list of notifications
 * instead of on the order or invoice the notification was about. Now the
 * destination travels inside the notification itself as plain data, and the
 * app goes there however it was opened.
 *
 * That data can come back on the app's address, so only these shapes are
 * trusted, and each value is checked:
 *   { to: 'tab', tab }            one of NOTIFY_TABS
 *   { to: 'invoice', id }         an invoice, opened once the books have loaded
 *   { to: 'book', book, tab }     a book's screen
 *   { to: 'labels', source }      labels waiting in the review inbox
 */
export const NOTIFY_TABS = ['bigcartel', 'shipping', 'dashboard', 'consignment', 'todo'];
const LABEL_SOURCES = ['email', 'canadapost'];

// Book ids can be text a publisher typed, so any short string passes here; the
// app still looks each one up in its own records before going anywhere.
const shortId = (v) => (typeof v === 'string' && v.length > 0 && v.length <= 120 ? v : '');

/** A destination the app can safely go to, or null. */
export function notificationTarget(open) {
  if (!open || typeof open !== 'object') return null;
  if (open.to === 'tab' && NOTIFY_TABS.includes(open.tab)) return { to: 'tab', tab: open.tab };
  if (open.to === 'invoice' && shortId(open.id)) return { to: 'invoice', id: open.id };
  if (open.to === 'book' && shortId(open.book) && NOTIFY_TABS.includes(open.tab)) return { to: 'book', book: open.book, tab: open.tab };
  if (open.to === 'labels' && LABEL_SOURCES.includes(open.source)) return { to: 'labels', source: open.source };
  return null;
}

let _opener = null;

/** What the app does with a pressed notification's destination (null when it has none). */
export function setDeviceNotifyOpener(fn) {
  _opener = typeof fn === 'function' ? fn : null;
}

/**
 * Whether the owner is looking at the app right now. The in-app card already
 * says the same thing then, and a second pop-up from the system on top of it
 * is just noise.
 */
export function appInView() {
  if (typeof document === 'undefined') return false;
  if (document.visibilityState !== 'visible') return false;
  try { return typeof document.hasFocus !== 'function' || document.hasFocus(); } catch (_) { return true; }
}

export function runDeviceNotifyClick(open) {
  try { if (typeof window !== 'undefined') window.focus(); } catch (_) { /* not focusable from here */ }
  try { _opener?.(notificationTarget(open)); } catch (_) { /* the app may still be loading */ }
}

async function workerRegistration() {
  try {
    if (typeof navigator === 'undefined' || !navigator.serviceWorker?.getRegistration) return null;
    return (await navigator.serviceWorker.getRegistration()) || null;
  } catch (_) { return null; }
}

/**
 * Put one piece of news on the device, if the owner asked for this kind.
 * Returns whether it was sent.
 *
 * `open` is where a press should go (see notificationTarget); without one, a
 * press shows the list of notifications. `force` skips the "already looking at
 * the app" check, for the test button.
 */
export async function notifyDevice({ kind, title, body = '', tag, open = null, force = false } = {}) {
  if (!title || !tag) return false;
  if (kind && !deviceNotifyPrefOn(kind)) return false;
  if (deviceNotificationPermission() !== 'granted') return false;
  if (!force && appInView()) return false;
  const target = notificationTarget(open);
  const options = { body, icon: ICON, badge: ICON, tag, data: { tag, open: target } };
  const reg = await workerRegistration();
  if (reg?.showNotification) {
    try { await reg.showNotification(title, options); return true; } catch (_) { /* fall through */ }
  }
  try {
    const n = new Notification(title, options);
    n.onclick = () => { runDeviceNotifyClick(target); n.close(); };
    return true;
  } catch (_) {
    // Android refuses the constructor; with no worker running there is no other way.
    return false;
  }
}

/** The destination carried on the address when a press opened the app from closed. */
export function targetFromAddress(search) {
  try {
    const params = new URLSearchParams(search);
    if (!params.has('notif')) return undefined;
    return notificationTarget(JSON.parse(params.get('open') || 'null'));
  } catch (_) { return null; }
}

/**
 * Listen for presses the service worker passes back (see public/sw-notify.js),
 * and handle the one that opened the app from closed, which arrives as
 * `?notif=<tag>&open=<destination>` on the address.
 */
export function initDeviceNotify() {
  if (typeof navigator !== 'undefined' && navigator.serviceWorker?.addEventListener) {
    navigator.serviceWorker.addEventListener('message', event => {
      if (event?.data?.type === CLICK_MESSAGE) runDeviceNotifyClick(event.data.open);
    });
  }
  if (typeof location === 'undefined' || typeof history === 'undefined') return;
  const target = targetFromAddress(location.search);
  if (target === undefined) return;
  try {
    const url = new URL(location.href);
    url.searchParams.delete('notif');
    url.searchParams.delete('open');
    history.replaceState(history.state, '', url.pathname + url.search + url.hash);
  } catch (_) { /* leaving the address as it is costs nothing */ }
  runDeviceNotifyClick(target);
}

// ── The app icon's count ───────────────────────────────────────────────────

/**
 * Show the number of unread notifications on the installed app's icon, where
 * the device supports it. Quietly does nothing elsewhere.
 */
export function setAppIconBadge(count) {
  try {
    if (typeof navigator === 'undefined') return;
    const n = Math.max(0, Number(count) || 0);
    if (n > 0 && typeof navigator.setAppBadge === 'function') navigator.setAppBadge(n).catch?.(() => {});
    else if (n === 0 && typeof navigator.clearAppBadge === 'function') navigator.clearAppBadge().catch?.(() => {});
  } catch (_) { /* not supported here */ }
}
