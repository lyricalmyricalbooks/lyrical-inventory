// Every notification the app has raised, kept so it can be read again.
//
// A pop-up used to be the only record that something had happened: dismiss it,
// reload the app, or simply not be looking, and the news was gone — "3 card
// sales recorded" or "a parcel is coming back" existed for exactly as long as
// the card was on screen. This keeps a short history on this device, with a
// read/unread mark, so the notifications panel can show what was said and
// when, and the sidebar can say how many are new.
//
// Stored in this browser only, and capped: it is a record of messages, not of
// the business — everything a message describes lives in the ledger already.
// Written defensively, because storage can be full or blocked and a history
// that fails must never stop the notification itself from showing.

import { reviewTaskStillOpen } from './review-queue.js';

const LOG_KEY = 'lm-notification-log';
/** Messages kept. A few weeks of a busy shop. */
export const LOG_LIMIT = 150;
/** A repeat of the same unread message within this long updates it instead of adding another. */
const MERGE_WINDOW_MS = 12 * 60 * 60 * 1000;

/** Plain source labels for alerts raised by the app's background checks. */
export function notificationSource(entry = {}) {
  if (entry.source) return String(entry.source);
  const id = String(entry.kind || entry.id || '');
  if (id.startsWith('health-')) return 'Connection check';
  if (id.startsWith('postage-sweep-')) return id.endsWith('canada-post') ? 'Canada Post' : id.endsWith('gmail') ? 'Gmail' : 'Postage import';
  if (id.startsWith('stripe-') || id.startsWith('author-paid-')) return 'Stripe';
  if (id.startsWith('todo:')) return 'To-do list';
  if (id === 'receipt-sweep') return 'Receipt finder';
  if (id === 'delivery-watch') return 'Parcel tracking';
  if (id === 'shippo-labels') return 'Shippo';
  if (id.includes('shipping') || id.includes('postage') || id.includes('unshipped')) return 'Shipping';
  if (id.includes('store') || id.includes('order') || id.includes('bigcartel')) return 'Website orders';
  if (id.includes('market')) return 'Market sales';
  if (id.includes('invoice')) return 'Invoices';
  return 'Lyrical Inventory';
}

function store() {
  try { return typeof localStorage === 'undefined' ? null : localStorage; } catch (_) { return null; }
}

export function readNotificationLog() {
  try {
    const raw = JSON.parse(store()?.getItem(LOG_KEY) || '[]');
    return Array.isArray(raw) ? raw.filter(item => item && item.title) : [];
  } catch (_) { return []; }
}

function writeLog(list) {
  try { store()?.setItem(LOG_KEY, JSON.stringify(list.slice(0, LOG_LIMIT))); } catch (_) { /* storage full or blocked */ }
}

/**
 * Add one message to the history, newest first.
 *
 * Checks that repeat every few minutes update the card they already raised;
 * the history follows the same rule. If the same kind of message is still
 * unread and recent, it is replaced with the latest wording rather than
 * stacked, so "2 new orders" then "3 new orders" is one line, not two.
 */
export function logNotification(entry = {}, { now = Date.now() } = {}) {
  const kind = String(entry.id || '').trim();
  const title = String(entry.title || '').trim();
  if (!kind || !title) return null;
  const list = readNotificationLog();
  const item = {
    uid: `${kind}:${now}`,
    kind,
    source: notificationSource(entry),
    icon: entry.icon || '',
    title,
    detail: String(entry.detail || ''),
    tone: entry.tone || '',
    actionLabel: entry.actionLabel || '',
    action: entry.action || '',
    at: now,
    read: false,
  };
  const same = list.findIndex(old => old.kind === kind);
  if (same >= 0 && !list[same].read && now - (Number(list[same].at) || 0) < MERGE_WINDOW_MS) {
    list.splice(same, 1);
  } else if (same >= 0 && list[same].title === title && list[same].detail === item.detail && now - (Number(list[same].at) || 0) < MERGE_WINDOW_MS) {
    // The very same words again, already read: nothing new to say.
    return list[same];
  }
  list.unshift(item);
  writeLog(list);
  return item;
}

export function unreadNotificationCount(list = readNotificationLog()) {
  return list.filter(item => !item.read).length;
}

export function markNotificationsRead() {
  const list = readNotificationLog();
  if (!list.some(item => !item.read)) return;
  writeLog(list.map(item => ({ ...item, read: true })));
}

/** Viewing the list acknowledges news, but leaves tasks visible until opened. */
export function markInformationalNotificationsRead() {
  const list = readNotificationLog();
  if (!list.some(item => !item.read && !(item.action && item.actionLabel))) return;
  writeLog(list.map(item => item.action && item.actionLabel ? item : { ...item, read: true }));
}

/** Opening a task acknowledges the matching alert, including repeated checks. */
export function markNotificationKindRead(kind) {
  const list = readNotificationLog();
  if (!list.some(item => item.kind === kind && !item.read)) return;
  writeLog(list.map(item => item.kind === kind ? { ...item, read: true } : item));
}

/** Remove one message. Returns whether it was there. */
export function removeNotification(uid) {
  const list = readNotificationLog();
  const kept = list.filter(item => item.uid !== uid);
  if (kept.length === list.length) return false;
  writeLog(kept);
  return true;
}

/**
 * The messages whose work is finished, so they can be cleared away by
 * themselves instead of waiting for the owner to tidy them.
 *
 * - A to-do message (`todo:<signal>`) is finished when that signal is gone from
 *   the to-do list: the stock was reordered, the script was updated, the
 *   receipt was filed.
 * - While its signal is still there, only the newest message of that kind is
 *   worth keeping. "Script is out of date (v47)" is replaced by "(v48)", not
 *   listed beside it.
 * - A receipt or label message is finished when nothing of that kind is left
 *   in the review inbox.
 * Every other kind (parcel delivered, connection restored…) is news, not a
 * task, and is only ever removed by the owner.
 */
export function resolvedNotificationUids(list = readNotificationLog(), { signalIds = new Set(), review = {} } = {}) {
  const newestOfKind = new Map();
  list.forEach(item => {
    const seen = newestOfKind.get(item.kind);
    if (!seen || (Number(item.at) || 0) > (Number(seen.at) || 0)) newestOfKind.set(item.kind, item);
  });
  const out = [];
  list.forEach(item => {
    const kind = String(item.kind || '');
    if (kind.startsWith('todo:')) {
      if (!signalIds.has(kind.slice(5)) || newestOfKind.get(kind) !== item) out.push(item.uid);
      return;
    }
    if (reviewTaskStillOpen(kind, review) === false) out.push(item.uid);
  });
  return out;
}

/** Clear the finished messages. Returns how many went. */
export function pruneResolvedNotifications(context) {
  const list = readNotificationLog();
  const gone = new Set(resolvedNotificationUids(list, context));
  if (!gone.size) return 0;
  writeLog(list.filter(item => !gone.has(item.uid)));
  return gone.size;
}

export function clearNotificationLog() {
  writeLog([]);
}

// toLocaleDateString with options builds a fresh Intl.DateTimeFormat on every
// call (~50x slower than reusing one), and the notifications panel asks for a
// label once per logged item (up to LOG_LIMIT), so build the formatter once.
const DAY_LABEL_FMT = new Intl.DateTimeFormat('en-CA', { weekday: 'short', month: 'short', day: 'numeric' });

/** 'Today', 'Yesterday' or the date, for grouping the panel. */
export function notificationDayLabel(at, now = Date.now()) {
  const day = (ms) => new Date(ms).toDateString();
  const atDay = day(at);
  if (atDay === day(now)) return 'Today';
  if (atDay === day(now - 86400000)) return 'Yesterday';
  const d = new Date(at);
  // format() throws on an invalid date where toLocaleDateString returned 'Invalid Date'.
  return isNaN(d.getTime()) ? 'Invalid Date' : DAY_LABEL_FMT.format(d);
}

// ─── To-do items that became urgent ────────────────────────────────────────
//
// Some things turn urgent without any check raising a pop-up — a book drops
// below its reorder level after a sale, an invoice passes its due date
// overnight. The to-do list shows them, but the notification history would
// never mention them. This notices each urgent item the first time it
// appears and says so once. When an item clears and later comes back, that is
// news again.

const SEEN_URGENT_KEY = 'lm-seen-urgent-signals';

/**
 * The urgent signals not seen before, and the ids to remember now.
 * `seen` of null means this device has never looked: nothing is announced,
 * so installing the app never produces a burst of old news.
 */
export function newlyUrgent(signals = [], seen = null) {
  const urgent = (Array.isArray(signals) ? signals : [])
    .filter(s => s && s.id && (s.status === 'blocked' || s.status === 'warn'));
  const ids = urgent.map(s => s.id);
  if (!Array.isArray(seen)) return { fresh: [], remember: ids };
  const known = new Set(seen);
  return { fresh: urgent.filter(s => !known.has(s.id)), remember: ids };
}

export function readSeenUrgent() {
  try {
    const raw = JSON.parse(store()?.getItem(SEEN_URGENT_KEY) || 'null');
    return Array.isArray(raw) ? raw : null;
  } catch (_) { return null; }
}

export function writeSeenUrgent(ids) {
  try { store()?.setItem(SEEN_URGENT_KEY, JSON.stringify(ids.slice(0, 300))); } catch (_) { /* storage full */ }
}

// ─── One-time clean-up of false stock alerts ───────────────────────────────
//
// Before the fix above, opening the app announced "Stock running low — 0
// copies" for every book with a reorder level, because the check ran before
// the books had loaded. Those entries were never true. This removes stock
// alerts from the history that don't match anything low right now, once per
// device, and leaves every other message alone.

const STOCK_CLEANUP_KEY = 'lm-notif-stock-cleanup-v1';

export function dropFalseStockNotifications(currentSignalIds = []) {
  const s = store();
  try { if (s?.getItem(STOCK_CLEANUP_KEY)) return 0; } catch (_) { return 0; }
  const current = new Set((currentSignalIds || []).map(id => `todo:${id}`));
  const isStock = (kind) => /^todo:stock-(low|getting-low):/.test(String(kind || ''));
  const list = readNotificationLog();
  const kept = list.filter(item => !isStock(item.kind) || current.has(item.kind));
  const removed = list.length - kept.length;
  if (removed) writeLog(kept);
  // The seen list may hold the same false ids; forget them so a real low
  // stock later is still announced.
  const seen = readSeenUrgent();
  if (seen) writeSeenUrgent(seen.filter(id => !/^stock-(low|getting-low):/.test(id) || current.has(`todo:${id}`)));
  try { s?.setItem(STOCK_CLEANUP_KEY, '1'); } catch (_) { /* storage blocked */ }
  return removed;
}
