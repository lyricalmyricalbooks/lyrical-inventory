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
// What deliberately did NOT move: the thinking-budget ladder, the
// single-attempt byte cap and the JSON response-mime handling. Those are about
// the shape of a receipt request, not about the account, and they stay with
// _callGeminiForReceipts.
//
// Names are unchanged from when this lived in src/features/receipts.js —
// including GEMINI_RECEIPT_MODELS, which now backs every caller rather than
// only the scanner. Renaming it would buy nothing and would break the suites
// that pin the free-tier floor by matching this source.

import { GEMINI_FREE_TIER_MODEL, rankFreeGeminiModels } from './gemini-models.js';

// Gemini 2.0 Flash and 2.0 Flash-Lite were retired on 2026-06-01 — keeping them
// in the fallback chain meant every escalation re-uploaded the whole payload to
// a model that could only fail.
// The floor, newest first: what the scanner uses before it has ever managed to
// ask Google what exists, and whenever that answer is unavailable — a first
// run, a machine that is offline, a key too new to list anything. Discovery
// below replaces this the moment it succeeds, so this list is a starting point
// rather than the definition of what the scanner can use.
const GEMINI_RECEIPT_MODELS = ['gemini-3.8-flash', 'gemini-3.7-flash', 'gemini-3.6-flash'];

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
export function _geminiModelChain(apiKey) {
  const discovered = _readGeminiModelCache(apiKey)?.models || [];
  return discovered
    .concat(GEMINI_RECEIPT_MODELS.filter(m => !discovered.includes(m)))
    .filter(m => GEMINI_FREE_TIER_MODEL.test(m))
    .slice(0, GEMINI_CHAIN_MAX);
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
      const res = await fetch(
        'https://generativelanguage.googleapis.com/v1beta/models'
        + `?key=${encodeURIComponent(apiKey)}&pageSize=200`
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

// What the reader says when it fails is written for whoever wrote the reader,
// not for whoever is standing at the till. "Request contains an invalid
// argument" tells a shop owner nothing about what to do next — and the thing to
// do next is the whole point of showing an error at all. The raw text still
// goes to the console for anyone debugging.
export function _friendlyScanError(e) {
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
