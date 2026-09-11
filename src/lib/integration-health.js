// Saying when something that runs on its own has stopped working.
//
// Two checks now run unattended: the storefront order watch and the Shippo
// label watch. The whole value of both rests on their actually running, and
// neither could say when it had stopped — each reached a catch site holding the
// error and threw it away into console.warn. A revoked token or a changed
// password therefore looked exactly like a quiet day, and the first visible
// sign was money missing from the books weeks later.
//
// The hard part is not noticing a failure. It is deciding which failures are
// worth a publisher's attention, because the corner this speaks into now also
// carries new orders and imported labels — and an alarm that cries wolf during
// every tunnel and café wifi would cost the trust those depend on. So the
// restraint here is the feature:
//
//   · Offline says nothing at all. The sync chip already owns that message, and
//     a second amber card about the same fact is noise. This mirrors
//     describeSyncStatus, where offline deliberately outranks failure so a
//     dropped connection never presents as a fault.
//   · An integration with no credentials says nothing. That is switched off,
//     not broken.
//   · A refused credential speaks immediately, because it will not fix itself.
//   · Everything else waits for three consecutive failures — a quarter of an
//     hour at the current interval — because almost every one-off failure is a
//     connection that came back.
//
// Pure: no DOM, no storage, no timers, no network. The caller owns the record
// and the painting; what lives here is the judgement.

import { SYNC_TONES, formatSyncAge } from './sync-status.js';

/** How many consecutive failures a transient fault must reach before it speaks. */
export const TRANSIENT_ALARM_THRESHOLD = 3;

export const HEALTH_CATEGORIES = Object.freeze([
  'auth',
  'throttled',
  'server',
  'network',
  'unknown',
]);

/**
 * One sentence per situation, written for the shop owner rather than for
 * whoever reads the stack trace. `{label}` is the integration's own name, so
 * the same wording serves every service that adopts this.
 */
const OWNER_SUMMARIES = Object.freeze({
  auth: '{label} refused the details this app is signed in with, so nothing can be fetched until the key or password is set up again.',
  throttled: '{label} asked for a short break because too many requests went out at once, so checks will space themselves out until it lets up.',
  server: '{label} is having trouble at their end, so this is nothing to do with your account and it should sort itself out.',
  network: '{label} could not be reached from this device, so checks will keep trying quietly in the background.',
  unknown: '{label} gave an answer this app did not understand, so nothing was changed and it will try again shortly.',
});

const clean = (value) => String(value ?? '').trim();

/** True for the browser's own "the request never left" rejection. */
function looksLikeNetworkFailure(message) {
  return /failed to fetch|networkerror|load failed|network request failed/i.test(clean(message));
}

/**
 * What a failure means for whether it is worth speaking about.
 *
 * `permanent` is the whole point of the split: a refused credential will still
 * be refused in five minutes, so waiting three rounds to mention it only wastes
 * fifteen minutes of a publisher's day. Everything else is likelier than not to
 * be a connection that came back on its own.
 */
export function classifyIntegrationFailure({ status, message } = {}) {
  const code = Number(status);
  const text = clean(message);

  let category = 'unknown';
  if (code === 401 || code === 403) category = 'auth';
  else if (code === 429) category = 'throttled';
  else if (code >= 500 && code <= 599) category = 'server';
  else if (code === 0 || !Number.isFinite(code) || looksLikeNetworkFailure(text)) category = 'network';

  return {
    category,
    permanent: category === 'auth',
    status: Number.isFinite(code) ? code : 0,
    message: text,
  };
}

/** The record a caller keeps per integration. Empty means "nothing has gone wrong". */
export function emptyHealthState() {
  return { attempts: 0, category: '', status: 0, lastError: '', failedAt: 0, succeededAt: 0, announced: false };
}

function normalizeState(state) {
  const s = state && typeof state === 'object' ? state : {};
  const attempts = Math.max(0, Math.floor(Number(s.attempts) || 0));
  return {
    attempts,
    category: clean(s.category),
    status: Math.max(0, Math.floor(Number(s.status) || 0)),
    lastError: clean(s.lastError),
    failedAt: Number(s.failedAt) || 0,
    succeededAt: Number(s.succeededAt) || 0,
    announced: !!s.announced,
  };
}

/**
 * Fold one failure into the record.
 *
 * `attempts` counts consecutive failures and is what the alarm threshold and
 * the backoff both read. `announced` is deliberately preserved rather than
 * recomputed: it is the caller's note that this fault has already been said out
 * loud, and resetting it every round is how a card starts reappearing every
 * five minutes.
 */
export function recordFailure(state, { at = Date.now(), error } = {}) {
  const prior = normalizeState(state);
  const verdict = classifyIntegrationFailure({
    status: error?.status,
    message: error?.message || error,
  });
  return {
    ...prior,
    attempts: prior.attempts + 1,
    category: verdict.category,
    status: verdict.status,
    lastError: verdict.message,
    failedAt: Number(at) || 0,
  };
}

/** A success wipes the slate — including the note that a fault was announced. */
export function recordSuccess(state, { at = Date.now() } = {}) {
  const prior = normalizeState(state);
  return { ...emptyHealthState(), succeededAt: Number(at) || 0, announced: false, _recovered: prior.announced };
}

/**
 * True when a success has just cleared a fault the publisher was told about.
 *
 * Read from the state recordSuccess() returns, so the caller can say "working
 * again" exactly once — and say nothing at all after the ordinary successes
 * that follow, or after a first success on a fault nobody ever heard about.
 */
export function justRecovered(state) {
  return !!state?._recovered;
}

/**
 * How long to wait before asking again after repeated failures.
 *
 * Doubling, capped at an hour. Without this a dead endpoint is polled every
 * five minutes forever — which for a refused credential means several hundred
 * pointless rejected requests a day, and is the sort of thing that gets an
 * account rate-limited for a fault it did not cause.
 */
export function healthBackoffMs(attempts, baseMs = 5 * 60 * 1000) {
  const n = Math.max(0, Math.floor(Number(attempts) || 0));
  if (n < 2) return 0;
  const base = Math.max(1, Number(baseMs) || 1);
  return Math.min(60 * 60 * 1000, base * Math.pow(2, Math.min(n - 1, 10)));
}

/** Whether this fault has earned the right to interrupt someone. */
export function shouldAnnounceFailure(state) {
  const s = normalizeState(state);
  if (!s.attempts) return false;
  if (s.category === 'auth') return true;
  return s.attempts >= TRANSIENT_ALARM_THRESHOLD;
}

/**
 * What to say about one integration, if anything.
 *
 * Same return shape as describeSyncStatus, so the visibility rule it states
 * once — show only what the publisher could not otherwise know — carries over
 * here verbatim rather than being restated in different words.
 */
export function describeIntegrationHealth({
  label = 'This service',
  state,
  online = true,
  configured = true,
  now = Date.now(),
} = {}) {
  const s = normalizeState(state);
  const hidden = {
    visible: false, tone: '', icon: '', title: '', detail: '', meta: '',
    category: '', permanent: false, action: null, srText: '',
  };

  // The two silences, in precedence order. Offline first, because it is also
  // true when the credentials are perfect, and blaming the service for a train
  // tunnel is how a publisher learns to ignore this corner.
  if (online === false) return hidden;
  if (!configured) return hidden;
  if (!shouldAnnounceFailure(s)) return hidden;

  const permanent = s.category === 'auth';
  const detail = (OWNER_SUMMARIES[s.category] || OWNER_SUMMARIES.unknown).replace('{label}', label);
  const age = formatSyncAge(s.succeededAt, now);

  return {
    visible: true,
    // Rose for a refused credential, which needs a look; amber for the rest,
    // which are attention rather than alarm — the tone semantics sync-status.js
    // already set out.
    tone: permanent ? SYNC_TONES.FAILED : SYNC_TONES.OFFLINE,
    icon: permanent ? '⚠' : '●',
    title: permanent ? `${label} needs signing in again` : `${label} is not answering`,
    detail,
    meta: age ? `Last worked ${age}` : '',
    category: s.category,
    permanent,
    action: { label: 'Check now', title: `Try ${label} again straight away` },
    srText: `${label}: ${detail}`,
  };
}

// ─── Where the record lives ───────────────────────────────────────────────
//
// localStorage, and deliberately not TAX_CENTER.settings. saveTaxCenter()
// serialises the whole tax document — ledger, expenses, recurring charges — to
// one Firestore doc on every call, and a failure record written on each failed
// background check is exactly the write the guard in importShippoShippingFromApi
// exists to prevent. A persistently broken integration would push the entire
// document every five minutes to record that it was still broken.
//
// Per-device is also the honest scope for most of what is stored here: whether
// this laptop could reach Shippo is a fact about this laptop.

export const HEALTH_STORAGE_KEY = 'lm-integration-health';

/**
 * Every integration's record, from a storage object shaped like localStorage.
 * A blocked or absent store reads as "nothing has gone wrong", which is the
 * right answer: a browser that cannot remember faults must not invent them.
 */
export function readHealthRecords(store) {
  try {
    const raw = JSON.parse(store?.getItem(HEALTH_STORAGE_KEY) || 'null');
    return raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  } catch (_) {
    return {};
  }
}

export function readHealthState(store, id) {
  const records = readHealthRecords(store);
  const key = clean(id);
  return normalizeState(key ? records[key] : null);
}

/**
 * Persist one integration's record. Returns the state it wrote, so a caller can
 * keep using it whether or not the browser accepted the write.
 */
export function writeHealthState(store, id, state) {
  const key = clean(id);
  const next = normalizeState(state);
  if (!key) return next;
  try {
    const records = readHealthRecords(store);
    // A cleared record is removed rather than stored as zeroes, so the key does
    // not grow a row per integration that has never once failed.
    if (!next.attempts && !next.announced) delete records[key];
    else records[key] = next;
    store?.setItem(HEALTH_STORAGE_KEY, JSON.stringify(records));
  } catch (_) { /* private mode, or storage full */ }
  return next;
}

/** The one line to show when a fault clears. */
export function describeIntegrationRecovery(label = 'This service') {
  return {
    tone: SYNC_TONES.PENDING,
    icon: '✓',
    title: `${label} is working again`,
    detail: `Checks are running normally, and anything missed while it was down has been picked up.`,
  };
}
