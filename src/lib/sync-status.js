/**
 * sync-status.js — presentation model for the offline / not-yet-uploaded chip.
 *
 * The app already survives a dropped connection: `queueSync()` parks the book
 * state in localStorage and `processSyncQueue()` drains it with backoff. What
 * was missing is the part the publisher can see. The only live signals were a
 * 6px dot inside the account avatar, a label buried in a menu that has to be
 * opened, and a single toast that vanishes after four seconds — so a phone that
 * loses signal mid-market reads as "Live" until the next save is attempted, and
 * a queue that is still draining looks identical to a queue that is empty.
 *
 * This module turns the four facts that matter (are we online, how many changes
 * are queued, did the last drain fail, when did anything last reach the cloud)
 * into the copy and tone of a persistent status chip. It is deliberately pure —
 * no DOM, no globals, no timers — so the wording and the visibility rules are
 * unit-testable without a browser, and `main.js` only has to paint the result.
 *
 * Visibility rule, stated once: the chip shows ONLY when there is something the
 * publisher could not otherwise know. Online with an empty queue paints nothing.
 */

/** Tones map onto the app's status-colour convention (see UX_PATTERNS.md). */
export const SYNC_TONES = Object.freeze({
  /** No connection. Amber — attention, not alarm; nothing is lost. */
  OFFLINE: 'offline',
  /** Online, queue draining. Neutral — informational only. */
  PENDING: 'pending',
  /** Online, but the drain keeps failing. Rose — needs a look. */
  FAILED: 'failed',
});

/**
 * Coerce a queue length into a safe non-negative integer.
 *
 * @param {unknown} value
 * @returns {number}
 */
export function normalizePendingCount(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.floor(n);
}

/**
 * "1 change" / "4 changes" — the noun the publisher sees for a queued write.
 *
 * @param {number} count
 * @returns {string}
 */
export function pluralChanges(count) {
  const n = normalizePendingCount(count);
  return `${n} change${n === 1 ? '' : 's'}`;
}

/**
 * Plain-language age of the last successful cloud write. Deliberately relative
 * ("14 min ago") rather than a clock time: while offline the question is "how
 * stale is the cloud copy", and an absolute timestamp makes you do the
 * subtraction yourself.
 *
 * @param {number|null|undefined} timestamp  epoch ms of the last cloud write
 * @param {number} [now]  epoch ms, injectable for tests
 * @returns {string} '' when unknown or in the future
 */
export function formatSyncAge(timestamp, now = Date.now()) {
  const ts = Number(timestamp);
  const ref = Number(now);
  if (!Number.isFinite(ts) || ts <= 0 || !Number.isFinite(ref)) return '';
  const delta = ref - ts;
  // A clock skew (or a stamp written a tick ahead of `now`) should read as
  // "just now", never as a negative age.
  if (delta < 60_000) return 'moments ago';
  const mins = Math.floor(delta / 60_000);
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} hr${hrs === 1 ? '' : 's'} ago`;
  const days = Math.floor(hrs / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}

/**
 * Describe what the sync chip should say, if anything.
 *
 * @param {object} [input]
 * @param {boolean} [input.online]        navigator.onLine (defaults to true)
 * @param {number}  [input.pending]       queued, not-yet-uploaded book states
 * @param {boolean} [input.retrying]      the queue drain threw and is backing off
 * @param {number|null} [input.lastSyncedAt]  epoch ms of the last cloud write
 * @param {number}  [input.now]           epoch ms, injectable for tests
 * @returns {{visible: boolean, tone: string, icon: string, title: string,
 *            detail: string, meta: string, count: number, action: null |
 *            {label: string, title: string}, srText: string}}
 *
 * @example
 *   describeSyncStatus({ online: false, pending: 2 }).title; // 'Offline'
 */
export function describeSyncStatus(input = {}) {
  const {
    online = true,
    pending = 0,
    retrying = false,
    lastSyncedAt = null,
    now = Date.now(),
  } = input || {};

  const count = normalizePendingCount(pending);
  const age = formatSyncAge(lastSyncedAt, now);
  const hidden = {
    visible: false, tone: '', icon: '', title: '', detail: '', meta: '',
    count, action: null, srText: '',
  };

  // Offline outranks everything: it explains the queue AND it is true even when
  // the queue happens to be empty, which is exactly the case the old UI missed.
  if (online === false) {
    const detail = count
      ? `${pluralChanges(count)} are saved on this device. They upload on their own the moment you're back online.`
      : 'You can keep selling. Everything you record is saved on this device and uploads on its own when the connection returns.';
    return {
      visible: true,
      tone: SYNC_TONES.OFFLINE,
      icon: '⚡',
      title: 'No connection',
      detail,
      meta: age ? `Last upload ${age}` : '',
      count,
      action: null,   // retrying with no connection can only fail
      srText: `No connection. ${detail}`,
    };
  }

  // Online and nothing outstanding — say nothing rather than reassure noisily.
  if (!count) return hidden;

  if (retrying) {
    const detail = `${pluralChanges(count)} haven't reached the cloud yet. Nothing is lost — they're saved on this device and we keep retrying.`;
    return {
      visible: true,
      tone: SYNC_TONES.FAILED,
      icon: '⚠',
      title: "Changes haven't uploaded",
      detail,
      meta: age ? `Last upload ${age}` : '',
      count,
      action: { label: 'Try again now', title: 'Retry the upload immediately' },
      srText: `Changes have not uploaded. ${detail}`,
    };
  }

  const detail = `${pluralChanges(count)} on the way to the cloud.`;
  return {
    visible: true,
    tone: SYNC_TONES.PENDING,
    icon: '↻',
    title: 'Uploading',
    detail,
    meta: '',
    count,
    action: null,
    srText: `Uploading. ${detail}`,
  };
}
