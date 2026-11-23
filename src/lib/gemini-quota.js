// Shared Gemini account state — the parts of talking to Google that belong to
// the KEY, not to any one caller.
//
// The receipt scanner owned all of this when it was the only thing in the app
// that called Gemini. It no longer is: the Intelligence panel asks the same
// account, on the same free tier, against the same per-minute limit. Two
// callers each holding their own cooldown is not untidy, it is wrong — the one
// that did not see the 429 retries straight back into the window that produced
// it, and both fail. The same goes for a model this key cannot reach: learned
// once by either caller, it should be known to both, or the other pays a full
// upload to be told so again.
//
// So the cooldown, the model chain and the "this key can't use that" set live
// here, shared, and every caller waits on the same pause.
//
// The request loop that walks that chain lives here too (askGemini), and so
// does the "Google first, then the saved backup" rule (askGeminiOrBackup).
// Each caller used to carry its own copy of both, and the copies drifted: the
// assistant kept walking the chain after a billing-sounding server error that
// the receipt scanner stopped on, and it reported a key that no model would
// serve as a spent allowance, which rested Google until midnight. One copy
// means a fix to how Google is asked reaches every caller at once.
//
// What deliberately did NOT move: the thinking-budget ladder's spellings, the
// single-attempt byte cap and the JSON response-mime handling. Those are about
// the shape of a receipt request, not about the account, and they stay with
// _callGeminiForReceipts, which hands them to askGemini as options.
//
// Names are unchanged from when this lived in src/features/receipts.js —
// including GEMINI_RECEIPT_MODELS, which now backs every caller rather than
// only the scanner. Renaming it would buy nothing and would break the suites
// that pin the free-tier floor by matching this source.

import {
  GEMINI_FREE_TIER_MODEL,
  GEMINI_ROUTED_MODELS,
  geminiErrorBody,
  geminiModelRefused,
  rankFreeGeminiModels,
} from './gemini-models.js';

// Gemini 2.0 Flash and 2.0 Flash-Lite were retired on 2026-06-01 — keeping them
// in the fallback chain meant every escalation re-uploaded the whole payload to
// a model that could only fail.
// The floor, newest first: what the scanner uses before it has ever managed to
// ask Google what exists, and whenever that answer is unavailable — a first
// run, a machine that is offline, a key too new to list anything. Discovery
// below replaces this the moment it succeeds, so this list is a starting point
// rather than the definition of what the scanner can use.
//
// Checked against Google's model and deprecation pages on 2026-11-23: 3.8 Flash
// is the newest Flash, 3.6 Flash the one before it (3.7 and 3.5 now just route
// to those two), 3.5 Flash-Lite the newest Lite. 2.5 Flash closes the list on
// purpose: it is the one Google's pricing page still lists with a free
// allowance, so a key with no billing has something left to read with when the
// newer models answer "limit: 0".
const GEMINI_RECEIPT_MODELS = ['gemini-3.8-flash', 'gemini-3.6-flash', 'gemini-3.5-flash-lite', 'gemini-2.5-flash'];

// Models this key cannot use, learned as we go. Without this the scan pays a
// full upload and a round-trip to be told so on EVERY scan rather than once a
// session — and on a free tier those are metered requests spent for nothing.
export const _geminiUnavailable = new Set();

// ── KEEPING UP WITH NEW READERS
// A newer Flash model used to sit unused until somebody edited the constant
// above and shipped a release, which for a one-person publisher means never.
// The models API lists exactly what this key can reach, so the scanner asks
// once a day and ranks the answer itself.
const GEMINI_MODEL_CACHE_KEY = 'lm_gemini_models';
const GEMINI_MODEL_CACHE_MS = 24 * 60 * 60 * 1000;
// How many readers one scan may ever walk through. Discovery can return a
// dozen; without a cap, a receipt that fails everywhere would be uploaded a
// dozen times, and on a free tier that is the whole day's allowance on one bad
// photo.
const GEMINI_CHAIN_MAX = 4;

/**
 * A short, non-reversible fingerprint of a key.
 *
 * Only ever used to notice that the key CHANGED. Deliberately not the key
 * itself and not recoverable from this, because it sits in localStorage next to
 * the cache — knowing two keys differ is all this needs to do.
 */
function _geminiKeyId(apiKey) {
  const s = String(apiKey || '');
  if (!s) return '';
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16);
}

/**
 * The models a previous discovery found, if they were found by THIS key.
 *
 * The key matters. A list discovered by one key says nothing about what another
 * can reach: two keys can sit in different Google Cloud projects with different
 * models enabled. Without this check, swapping a key left the old key's list in
 * the browser for a full day, and every scan in that day kept trying models the
 * new key had no access to — which surfaces as a run of failures that look like
 * the new key being broken rather than the cache being stale.
 *
 * A cache written before this check existed carries no key id, so it does not
 * match any key and is discarded once. That costs one metadata call and is the
 * correct answer for it, because there is no way to tell which key wrote it.
 */
function _readGeminiModelCache(apiKey) {
  try {
    if (typeof localStorage === 'undefined') return null;
    const saved = JSON.parse(localStorage.getItem(GEMINI_MODEL_CACHE_KEY) || 'null');
    if (!saved || !Array.isArray(saved.models) || !saved.models.length) return null;
    if (apiKey && saved.keyId !== _geminiKeyId(apiKey)) return null;
    return saved;
  } catch (_) {
    // A corrupt or unreadable cache is not worth failing a scan over.
    return null;
  }
}

// The chain for this scan. Whatever was discovered comes first; the built-in
// list fills in behind it, so a short or missing answer still leaves something
// to try. Capped, and re-filtered for the free tier on the way out — a name
// that arrived from the network is not trusted any further than one typed by
// hand.
//
// The built-in list's last model always keeps the last seat. Discovery can
// return four newer Flash models that this key has no free allowance for, and
// a chain made only of those fails every scan on a key without billing.
export function _geminiModelChain(apiKey) {
  const discovered = _readGeminiModelCache(apiKey)?.models || [];
  const lastResort = GEMINI_RECEIPT_MODELS[GEMINI_RECEIPT_MODELS.length - 1];
  const usable = discovered
    .concat(GEMINI_RECEIPT_MODELS.filter(m => !discovered.includes(m)))
    .filter(m => GEMINI_FREE_TIER_MODEL.test(m) && !GEMINI_ROUTED_MODELS.has(m));
  if (usable.length <= GEMINI_CHAIN_MAX) return usable;
  const head = usable.filter(m => m !== lastResort).slice(0, GEMINI_CHAIN_MAX - 1);
  return usable.includes(lastResort) ? head.concat(lastResort) : usable.slice(0, GEMINI_CHAIN_MAX);
}

// In-flight discovery, so a pile of receipts scanning at once asks once.
let _geminiDiscovery = null;

/**
 * Refresh the list of readers, at most once a day, without ever making anyone
 * wait for it. Deliberately fire-and-forget: a scan runs on the list it
 * already has, and a newly released model is picked up by the next one. Making
 * the owner wait on a metadata call to save a few hundred milliseconds later
 * would be the wrong way round.
 */
export function _warmGeminiModelCache(apiKey) {
  if (!apiKey || typeof fetch !== 'function') return null;
  if (typeof navigator !== 'undefined' && navigator && navigator.onLine === false) return null;
  const cached = _readGeminiModelCache(apiKey);
  if (cached && Date.now() - Number(cached.at || 0) < GEMINI_MODEL_CACHE_MS) return null;
  if (_geminiDiscovery) return _geminiDiscovery;

  _geminiDiscovery = (async () => {
    try {
      // The key goes in the x-goog-api-key header, the only way Google's
      // current guides send it, rather than in the address.
      const res = await fetch(
        'https://generativelanguage.googleapis.com/v1beta/models?pageSize=200',
        { headers: { 'x-goog-api-key': apiKey } }
      );
      if (!res.ok) return;
      const data = await res.json();
      const ranked = rankFreeGeminiModels(data && data.models);
      // An empty ranking means the answer was unusable, not that this key has
      // no readers. Keeping yesterday's list beats replacing it with nothing.
      if (!ranked.length) return;
      localStorage.setItem(GEMINI_MODEL_CACHE_KEY, JSON.stringify({
        at: Date.now(), models: ranked, keyId: _geminiKeyId(apiKey),
      }));
    } catch (_) {
      // Offline, blocked, rate-limited: the built-in list still works.
    } finally {
      _geminiDiscovery = null;
    }
  })();
  return _geminiDiscovery;
}

// One rate-limit response means the whole pool should ease off together. Left
// to themselves, every concurrent scan retries into the same congestion window
// that produced the 429 and they all fail again. Holding the pause here —
// shared, not per-request — is what makes a higher concurrency safe.
let _geminiCooldownUntil = 0;
let _geminiCooldownWait = null;

export function _geminiNoteThrottle(ms) {
  const until = Date.now() + ms;
  // An in-flight, longer pause already covers this one.
  if (until <= _geminiCooldownUntil) return;
  _geminiCooldownUntil = until;
  _geminiCooldownWait = new Promise(r => setTimeout(r, ms));
}

// Deliberately a stored promise rather than a poll of the clock: every waiting
// worker awaits the same timer, so nothing spins and nothing can outlive its
// own cooldown.
export function _geminiAwaitCooldown() {
  return _geminiCooldownWait || Promise.resolve();
}

// ── WHEN THE ALLOWANCE ITSELF IS SPENT
// The cooldown above is a pause of a few seconds. A spent allowance is not: once
// the day's free requests are gone, or prepaid credit has run out, every request
// is refused the same way until Google resets it. With an OpenRouter backup
// saved, asking Google first anyway cost three refused requests and a few
// seconds of backoff on EVERY receipt before the backup was even tried — on a
// batch of thirty receipts, most of the wait was spent being told no.
//
// So a spent allowance is remembered here, shared by every caller, and callers
// with a backup go straight to it until Google is likely to answer again. It is
// only ever consulted when there is somewhere else to go: with no backup, every
// request still asks Google, exactly as before.
let _geminiRestUntil = 0;

// Google resets the free tier's daily allowance at midnight Pacific time.
function _msUntilPacificMidnight(now) {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Los_Angeles', hourCycle: 'h23',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    }).formatToParts(new Date(now));
    const get = (type) => Number(parts.find(p => p.type === type)?.value) || 0;
    const elapsed = (((get('hour') % 24) * 60 + get('minute')) * 60 + get('second')) * 1000;
    return Math.max(60_000, 86_400_000 - elapsed);
  } catch (_) {
    return 60 * 60 * 1000;
  }
}

/**
 * How long Google is likely to keep refusing, judged from one failure — or 0
 * when the failure says nothing about the allowance (a bad key, a malformed
 * request, an outage), so a real problem is never hidden behind the backup.
 *
 * @param {{status?: number, message?: string, details?: Array}} error
 *   What the Gemini callers throw: the HTTP status, Google's own message, and
 *   the error's `details` block when Google sent one.
 */
export function _geminiSpentFor(error, now = Date.now()) {
  const raw = String(error?.message || '');
  const status = Number(error?.status) || 0;
  const details = Array.isArray(error?.details) ? JSON.stringify(error.details) : '';
  // Prepaid credit or billing: nothing resets on its own, so check back hourly.
  if (status === 402 || /prepayment|credits? (?:are |is )?depleted|out of credit|billing account|enable billing|paid tier/i.test(raw)) {
    return 60 * 60 * 1000;
  }
  if (status !== 429 && !/RESOURCE_EXHAUSTED|quota|rate.?limit|too many requests/i.test(raw)) return 0;
  // The daily allowance names itself in the quota id (…PerDay…) and sometimes
  // in the message. Its "retry in 13s" hint is misleading — nothing frees up
  // until the reset — so the day's cap wins over any hint.
  if (/per.?day|daily/i.test(raw) || /PerDay/i.test(details)) return _msUntilPacificMidnight(now);
  // A per-minute limit: rest as long as Google says, within sensible bounds.
  const hint = /"retryDelay":"(\d+(?:\.\d+)?)s"/.exec(details) || /retry in (\d+(?:\.\d+)?)\s*s/i.exec(raw);
  const seconds = hint ? Number(hint[1]) : 60;
  return Math.min(10 * 60 * 1000, Math.max(15_000, seconds * 1000));
}

/** Remember a spent allowance, if that is what this failure was. */
export function _geminiNoteSpent(error, now = Date.now()) {
  const ms = _geminiSpentFor(error, now);
  if (ms > 0) _geminiRestUntil = Math.max(_geminiRestUntil, now + ms);
  return ms;
}

/** True while Google's allowance is known to be spent. */
export function _geminiResting(now = Date.now()) {
  return now < _geminiRestUntil;
}

/** Forget a spent allowance — a new key, or a test starting clean. */
export function _geminiClearRest() {
  _geminiRestUntil = 0;
}

// ── ASKING GOOGLE
// Every Gemini request in the app goes through askGemini: the receipt scanner,
// the email sweep and the assistant. Walking the model chain, waiting out the
// shared pause, stepping past a model this key cannot use and stopping on
// anything that would fail the same way everywhere are all decided here, once.

/**
 * Ask the first model in the chain that will answer.
 *
 * What it does with a failure, model by model:
 *  - 429 or 5xx: retried twice with backoff; a 429 becomes the shared pause.
 *  - Refused for this key ("limit: 0", a missing or retired model): that model
 *    is remembered as unusable and the NEXT model is asked. This never stops
 *    the scan — a newer Flash without a free allowance must not end a read
 *    that an older, free one could do.
 *  - A rejected key, a malformed request, or anything that reads as "this
 *    would cost money": stops at once. Every model would answer the same, and
 *    walking further only re-uploads the payload to be told so again.
 *  - Anything else (an outage, an early stop, an empty answer): next model.
 *
 * @param {string} apiKey The publisher's own Gemini key.
 * @param {object} o
 * @param {(model: string, step: number) => string} o.body
 *   The request, already serialised, for this model at this rung of the
 *   caller's ladder (always 0 without one). Serialised by the caller so a big
 *   upload can be built once and reused across models and retries.
 * @param {(candidate: object, model: string, finish: string|undefined) => any} o.read
 *   Turns Google's first candidate into the caller's result. Return nothing to
 *   say the answer was empty, and the next model is asked.
 * @param {{first: (model: string) => number, last: number, worked: (model: string, step: number) => void}} [o.ladder]
 *   Request shapes to step down through when a model answers 400, before the
 *   400 is believed. Without one, a 400 stops the walk straight away.
 * @param {number} [o.singleAttemptBytes] A body bigger than this gets one real
 *   attempt rather than one per model. A refused model does not use it up.
 * @param {Function} [o.fetchImpl] Injected for tests; the global fetch otherwise.
 * @param {AbortSignal} [o.signal]
 */
export async function askGemini(apiKey, { body, read, ladder = null, singleAttemptBytes = Infinity, fetchImpl = null, signal } = {}) {
  // The free-tier gate, enforced at the point of use: whatever the chain ends
  // up saying, a model that would be billed is never called.
  const free = _geminiModelChain(apiKey);
  if (!free.length) throw new Error('No free-tier reader is configured');
  // Then skip what this key has already been refused — but never let that
  // empty the chain, because a refusal that turns out to be temporary must not
  // leave the app permanently unable to try.
  const reachable = free.filter(m => !_geminiUnavailable.has(m));
  const chain = reachable.length ? reachable : free;
  const firstStep = (model) => (ladder ? ladder.first(model) : 0);
  const lastStep = ladder ? ladder.last : 0;
  const singleAttempt = body(chain[0], firstStep(chain[0])).length > singleAttemptBytes;
  let attempted = false;
  let refusedCount = 0;

  let lastErr;
  for (const model of chain) {
    if (singleAttempt && attempted) break;
    let step = firstStep(model);
    let sendBody = body(model, step);
    try {
      const send = async () => {
        // Nothing goes out while the pool is serving a rate-limit pause.
        await _geminiAwaitCooldown();
        if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
        // The key travels in the x-goog-api-key header, the only way Google's
        // current guides send it, rather than in the address.
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
        const init = { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey }, body: sendBody, signal };
        return fetchImpl ? fetchImpl(url, init) : fetch(url, init);
      };
      let res = await send();
      // Retry transient overload / rate-limit / server errors with exponential
      // backoff. A single flat retry lands right back inside the same
      // congestion window that caused the 429; jitter stops parallel callers
      // from resonating.
      for (let attempt = 0; attempt < 2 && !res.ok && (res.status === 429 || res.status >= 500); attempt++) {
        // A "limit: 0" refusal is about the model, not the moment: waiting and
        // asking again gets the same answer, so go straight to the next model.
        if (res.status === 429 && geminiModelRefused(429, (await geminiErrorBody(res))?.error?.message)) break;
        const retryAfter = Number(res.headers?.get?.('retry-after'));
        const wait = Number.isFinite(retryAfter) && retryAfter > 0
          ? Math.min(retryAfter * 1000, 8000)
          : (700 * Math.pow(2, attempt)) + Math.random() * 400;
        // A 429 is the whole pool's problem, so it is published as a shared
        // pause that send() already waits on. A 5xx is this one request's.
        if (res.status === 429) _geminiNoteThrottle(wait);
        else await new Promise(r => setTimeout(r, wait));
        if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
        res = await send();
      }

      // Step down the caller's ladder until the model stops objecting. A 400
      // raised on any rung but the last is NEVER fatal: the last rung is the
      // shape that worked before the ladder existed. Only there does a 400
      // mean the payload itself is bad.
      const startStep = step;
      while (!res.ok && res.status === 400 && step < lastStep) {
        step++;
        sendBody = body(model, step);
        res = await send();
      }
      // Only a rung that actually WORKED is worth remembering. A request the
      // model still rejects at the bottom was never about the ladder — a
      // corrupt file, say.
      if (res.ok && step !== startStep) ladder.worked(model, step);

      if (!res.ok) {
        let detail = `HTTP ${res.status} from ${model}`;
        // Escalating to another model only helps when THIS model is the
        // problem. A rejected key or a malformed payload fails identically on
        // every model.
        let shouldStop = res.status === 400 || res.status === 401 || res.status === 403;
        // 404 means this key cannot reach that model at all — not enabled on
        // the account yet, or retired. Worth remembering rather than
        // re-discovering with a fresh upload every time.
        if (res.status === 404) _geminiUnavailable.add(model);
        let details;
        try {
          const err = await geminiErrorBody(res);
          // Kept for _geminiSpentFor(): the quota id is what tells a spent
          // day's allowance apart from a one-minute rate limit.
          details = err?.error?.details;
          if (err?.error?.message) {
            detail = err.error.message;
            // Anything that means "this would cost money" stops the whole
            // chain on the spot. Walking further down it in that state is how
            // a reader meant to be free quietly starts spending.
            if (res.status === 429
              || /prepayment|credits|billing|quota|API key|paid tier|FAILED_PRECONDITION|payment/i.test(detail)) {
              shouldStop = true;
            }
          }
        } catch (_) { /* a body that isn't JSON tells us nothing extra */ }
        lastErr = new Error(detail);
        lastErr.status = res.status;
        if (Array.isArray(details)) lastErr.details = details;
        // Google turned down this one model for this key — typically a newer
        // Flash with no free allowance ("limit: 0"). That says nothing about
        // the key or the request, so the next model is asked instead of
        // stopping on a billing-sounding message it was never going to get
        // past.
        if (geminiModelRefused(res.status, detail)) {
          _geminiUnavailable.add(model);
          refusedCount++;
          continue;
        }
        attempted = true;
        // Marked so this iteration's own catch re-throws instead of recording
        // it as one more failed model and moving on.
        if (shouldStop) { lastErr.__fatal = true; throw lastErr; }
        continue;
      }
      attempted = true;
      const data = await res.json();
      const cand = data.candidates?.[0];
      const finish = cand?.finishReason;
      if (finish && finish !== 'STOP' && finish !== 'MAX_TOKENS') {
        lastErr = new Error(`Gemini stopped early (${finish})`);
        continue;
      }
      const out = read(cand, model, finish);
      if (out) return out;
      lastErr = new Error(`Empty response from ${model}`);
    } catch (e) {
      // A cancel must never be mistaken for a model failure worth retrying.
      if (e && e.name === 'AbortError') throw e;
      // Nor an error every model in the chain would give identically.
      if (e && e.__fatal) throw e;
      attempted = true;
      lastErr = e;
    }
  }
  if (refusedCount && refusedCount === chain.length) throw _geminiNoModelError(lastErr);
  throw lastErr || new Error('All Gemini models failed');
}

// Every model in the chain was turned down for this key. Said in words the
// publisher can act on, and deliberately not phrased as a quota or billing
// problem: nothing was used up, so the app must not rest the key until
// midnight or tell them their allowance is spent.
function _geminiNoModelError(lastErr) {
  return Object.assign(new Error(
    'Google did not offer any of its reading models to this AI key on its free plan. '
    + 'Check the key in Google AI Studio, or add an OpenRouter backup key in the Tax Centre config'
  ), { __alreadyFriendly: true, status: 404, cause: lastErr });
}

/**
 * Google first, the saved OpenRouter backup second — the one rule every AI
 * caller follows.
 *
 *  - While Google's allowance is known to be spent (see _geminiResting) and
 *    there is a backup, Google is not asked: it would only refuse, after
 *    seconds of backoff, before the backup got the request anyway.
 *  - Any other Google failure is remembered (_geminiNoteSpent) so every caller
 *    learns of a spent allowance, then the backup is asked.
 *  - A cancel is never a failure to fall back from.
 *  - With no backup, Google's own error is thrown unchanged.
 *
 * What the caller says about a failure stays with the caller — a receipt toast
 * and an assistant reply word it differently — so `bothFailed` builds the error
 * thrown when the backup fails too.
 *
 * @param {object} o
 * @param {(() => Promise<any>)|null} o.google  Ask Google; null when there is no Google key (or it is not to be used).
 * @param {(() => Promise<any>)|null} o.backup  Ask the backup; null when there is none (or it is not to be used).
 * @param {(why: {googleError: any, skipped: boolean}) => void} [o.onFallback]
 *   Called just before the backup is asked. `skipped` is true when Google was
 *   passed over because its allowance is spent.
 * @param {(backupError: any, why: {googleError: any, skipped: boolean}) => any} [o.bothFailed]
 *   The error to throw when the backup fails too. Defaults to the backup's own.
 */
export async function askGeminiOrBackup({ google, backup, onFallback, bothFailed }) {
  let googleError = null;
  let skipped = false;
  if (google && !(backup && _geminiResting())) {
    try {
      return await google();
    } catch (error) {
      if (error?.name === 'AbortError') throw error;
      _geminiNoteSpent(error);
      if (!backup) throw error;
      googleError = error;
    }
  } else if (google) {
    skipped = true;
  }
  if (!backup) throw new Error('No AI key is set');
  const why = { googleError, skipped };
  if (onFallback && (googleError || skipped)) onFallback(why);
  try {
    return await backup();
  } catch (error) {
    if (error?.name === 'AbortError') throw error;
    throw bothFailed ? bothFailed(error, why) : error;
  }
}

// What the reader says when it fails is written for whoever wrote the reader,
// not for whoever is standing at the till. "Request contains an invalid
// argument" tells a shop owner nothing about what to do next — and the thing to
// do next is the whole point of showing an error at all. The raw text still
// goes to the console for anyone debugging.
export function _friendlyScanError(e) {
  if (e?.__alreadyFriendly) return e.message;
  const raw = String(e?.message || e || '').trim();
  if (typeof navigator !== 'undefined' && navigator && navigator.onLine === false) {
    return 'you are offline — reconnect and try again';
  }
  if (e?.name === 'AbortError') return 'the scan was stopped';
  // Google has two quite different ways of saying "this key is no good", and
  // they need two different things from the publisher.
  //
  // UNAUTHENTICATED — "Request had invalid authentication credentials. Expected
  // OAuth 2 access token, login cookie or other valid authentication
  // credential" — is what comes back when the key does not authenticate at all:
  // it was deleted or rotated in AI Studio and this app still holds the old
  // one, or it carries website restrictions that do not list this app. Neither
  // is fixed by "check your key", so the message names both.
  if (/UNAUTHENTICATED|invalid authentication credentials|Expected OAuth 2/i.test(raw)) {
    return 'Google would not accept that key — if you made a new one, paste it into the Tax Centre config; '
      + 'if the key has website restrictions, they have to allow this app';
  }
  if (/API key|api_key|PERMISSION_DENIED|unregistered|not valid/i.test(raw)) {
    return 'your AI key was rejected — check it in the Tax Centre config';
  }
  // The key is fine but the API it needs was never switched on for its project.
  // A different fix again, and one nothing else here would hint at.
  if (/SERVICE_DISABLED|has not been used in project|API has not been enabled|is disabled/i.test(raw)) {
    return 'the AI service is not switched on for that key\'s Google project — enable the Generative Language API for it';
  }
  // Rate limit BEFORE billing, and this order is load-bearing. Google's
  // free-tier 429 reads "You exceeded your current quota, please check your
  // plan and billing details" — it contains the word "billing", so a bare
  // /billing/ test above this line caught every ordinary rate limit and told
  // the publisher their account was no longer free. That is the same words
  // they would see if they really had lost free access, so there was no way to
  // tell the two apart, and hitting a limit looked like losing the free tier.
  if (/quota|rate limit|rate-limit|RESOURCE_EXHAUSTED|too many requests/i.test(raw)) {
    return 'the free reader is at its limit for now — wait a minute and try again';
  }
  // Only phrases that mean the request itself is not free. "billing" on its own
  // is not one of them, for the reason above.
  if (/paid tier|enable billing|billing account|billing is (?:not )?enabled|prepayment|credits|payment method|FAILED_PRECONDITION|free tier is not available/i.test(raw)) {
    return 'that reader is not free on your Google account — nothing was charged, but the scan stopped rather than spend';
  }
  if (/SAFETY|blocked|RECITATION/i.test(raw)) {
    return 'the reader refused this file — try a photo of the receipt instead';
  }
  if (/invalid argument|INVALID_ARGUMENT|unsupported|cannot be processed|Unable to process/i.test(raw)) {
    return 'the reader could not open that file — try a photo or a PDF of the receipt';
  }
  if (/failed to fetch|network|ENOTFOUND|ECONN/i.test(raw)) {
    return 'could not reach the reader — check your connection';
  }
  if (/too large|payload|exceeds/i.test(raw)) {
    return 'that file is too big to read — try a photo instead of a scan';
  }
  // Nothing recognised: show what came back rather than inventing a cause,
  // trimmed so a wall of API text cannot push the toast off the screen. Cut at
  // a space rather than mid-character-count — "other valid authenticatio" reads
  // as the app having broken, which is a worse first impression than a slightly
  // shorter sentence.
  if (!raw) return 'the reader did not say why';
  // How much raw API text a toast can hold without pushing itself off screen.
  // Kept local: several suites lift this function on its own, and a top-level
  // constant would have to be lifted alongside it everywhere.
  const LIMIT = 120;
  if (raw.length <= LIMIT) return raw;
  // One character of the budget belongs to the ellipsis, so the whole string
  // still fits the limit the toast was sized against.
  const cut = raw.slice(0, LIMIT - 1);
  const lastSpace = cut.lastIndexOf(' ');
  // Only back up to a word boundary if one is reasonably near the end —
  // otherwise a single very long token would cut the message to nothing.
  const body = lastSpace > 60 ? cut.slice(0, lastSpace) : cut;
  return `${body.replace(/[.,;:]$/, '')}…`;
}
