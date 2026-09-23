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

const LOG_KEY = 'lm-notification-log';
/** Messages kept. A few weeks of a busy shop. */
export const LOG_LIMIT = 150;
/** A repeat of the same unread message within this long updates it instead of adding another. */
const MERGE_WINDOW_MS = 12 * 60 * 60 * 1000;

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

export function clearNotificationLog() {
  writeLog([]);
}

/** 'Today', 'Yesterday' or the date, for grouping the panel. */
export function notificationDayLabel(at, now = Date.now()) {
  const day = (ms) => new Date(ms).toDateString();
  if (day(at) === day(now)) return 'Today';
  if (day(at) === day(now - 86400000)) return 'Yesterday';
  return new Date(at).toLocaleDateString('en-CA', { weekday: 'short', month: 'short', day: 'numeric' });
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
