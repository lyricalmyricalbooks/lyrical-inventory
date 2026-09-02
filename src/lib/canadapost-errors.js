/**
 * Reading what Canada Post said went wrong — once, in one place.
 *
 * Every REST 4.0.0 failure comes back as `{"messages":[{"code","description"}]}`,
 * often with more than one message, and the code inside it is the only thing
 * that says which of six very different problems this is. Answering that
 * question at each call site is how a missing payment method on the account
 * ends up being retried nine times and then reported to the publisher as
 * "shipping is down": the status alone cannot tell those apart, and the
 * description alone is written for a developer.
 *
 * So two questions are answered here and kept apart on purpose:
 *
 *   WHAT WENT WRONG comes from the message code, which is the more specific of
 *   the two signals — a service code returned under a plain bad-request status
 *   is still a service problem.
 *
 *   WHETHER TO CALL AGAIN comes from the HTTP status, which is the only thing
 *   that says whether repeating the call is safe. That matters most for label
 *   creation: an unrecognised answer is treated as "do not repeat", because a
 *   second attempt at a shipment that may already have succeeded buys a second
 *   label with real postage on it.
 *
 * The one place those two cross is a missing payment method — see
 * CANADAPOST_PAYMENT_METHOD_CODES, which is documented as both.
 *
 * Owner-facing wording lives here too, in `summary`: one plain sentence with no
 * codes and no jargon in it, because this is what ends up on the screen the
 * publisher is looking at when a parcel will not print. The raw description is
 * kept beside it in `detail` rather than folded into that sentence, so the
 * exact words Canada Post used are never lost but never dumped on the owner
 * mid-sentence either.
 */

import {
  CANADAPOST_THROTTLE_COOLDOWN_MS,
  isThrottleResponse,
} from './canadapost-throttle.js';

/** AA001–AA006 — the key or token itself was refused. */
export const CANADAPOST_AUTH_CODES = Object.freeze({ prefix: 'AA', min: 1, max: 6 });

/** AA007–AA010 — the credentials are fine; the account is not set up for this. */
export const CANADAPOST_AUTHORIZATION_CODES = Object.freeze({ prefix: 'AA', min: 7, max: 10 });

/** 003–008 — tracking and other lookups that found nothing. */
export const CANADAPOST_TRACKING_CODES = Object.freeze({ prefix: '', min: 3, max: 8 });

/** 1128–1743 — missing mandatory fields, bad addresses, conflicting options. */
export const CANADAPOST_VALIDATION_CODES = Object.freeze({ prefix: '', min: 1128, max: 1743 });

/** 7000–7322 — service unavailable for this parcel, weight limits, currency. */
export const CANADAPOST_SERVICE_CODES = Object.freeze({ prefix: '', min: 7000, max: 7322 });

/** 8064–9208 — shipment creation, transmission, manifest and void operations. */
export const CANADAPOST_SHIPMENT_CODES = Object.freeze({ prefix: '', min: 8064, max: 9208 });

/**
 * The two shipment codes that usually mean the account has no default payment
 * method saved.
 *
 * These are the awkward pair. Canada Post's own documentation lists 9153 in the
 * retry-with-backoff set AND describes both 9153 and 9154 as a missing default
 * payment method, which no amount of retrying will fix. Rather than quietly
 * picking one reading, both are honoured: the message says what actually needs
 * doing (save a payment method), and 9153 alone is allowed a single retry after
 * the documented one-second wait, in case it really was the transient variant.
 * 9154 is not retried at all. If a retried 9153 fails again, the owner sees the
 * payment-method message, which is the useful outcome either way.
 */
export const CANADAPOST_PAYMENT_METHOD_CODES = Object.freeze([9153, 9154]);

/** The one of that pair Canada Post also lists as worth retrying. */
export const CANADAPOST_PAYMENT_METHOD_RETRY_CODE = 9153;

/** Documented floor for a retry wait; nothing here ever retries faster. */
export const CANADAPOST_MIN_RETRY_MS = 1_000;

/**
 * Ceiling on a backed-off wait. Capped because the publisher is usually stood
 * at the printer with a parcel: a batch that quietly stalls for several minutes
 * on a service that is simply down is worse than one that gives up and says so.
 */
export const CANADAPOST_MAX_RETRY_MS = 30_000;

/** A refused token is worth exactly one more try, with a fresh token. */
export const CANADAPOST_TOKEN_REFRESH_RETRIES = 1;

/** How many times a genuinely transient failure is worth repeating. */
export const CANADAPOST_BACKOFF_RETRIES = 3;

/**
 * Every category `classifyCanadaPostFailure` can report.
 *
 * The first seven are the ones a message code can produce, and are all
 * `classifyCanadaPostCode` ever returns. The last four exist because a status
 * can describe a situation no code covers — still waiting, being throttled,
 * an outage at Canada Post, or a billing setup problem — and folding those into
 * the code categories would lose exactly the distinction a caller needs.
 */
export const CANADAPOST_FAILURE_CATEGORIES = Object.freeze([
  'auth',
  'authorization',
  'tracking',
  'validation',
  'service',
  'shipment',
  'unknown',
  'payment',
  'pending',
  'throttled',
  'outage',
]);

const CODE_RANGES = Object.freeze([
  ['auth', CANADAPOST_AUTH_CODES],
  ['authorization', CANADAPOST_AUTHORIZATION_CODES],
  ['tracking', CANADAPOST_TRACKING_CODES],
  ['validation', CANADAPOST_VALIDATION_CODES],
  ['service', CANADAPOST_SERVICE_CODES],
  ['shipment', CANADAPOST_SHIPMENT_CODES],
]);

/**
 * One sentence per situation, written for the shop owner.
 *
 * Keyed mostly by category, with `notFound` as the exception: a lookup that
 * found nothing is still a lookup problem, but "nothing on file" and "no such
 * tracking number" want different words, and the owner reads the words.
 */
const OWNER_SUMMARIES = Object.freeze({
  auth: 'Canada Post did not accept the account details this app is using, so the connection needs setting up again with a fresh key from your Canada Post account.',
  authorization: 'Your Canada Post account is not signed up for this part of their service yet, so it has to be switched on with Canada Post before this will work.',
  tracking: 'Canada Post has no record of that tracking number, which usually means the parcel is too new to show up yet or the number was typed slightly differently.',
  notFound: 'Canada Post has nothing on file for this, which usually means it is more than about three months old and has been cleared from their records.',
  validation: 'Canada Post turned these shipment details down, so something in the address, the parcel details or the options chosen needs correcting before trying again.',
  service: 'Canada Post cannot offer this shipping service for this parcel, so the weight, the size or the destination needs another look.',
  shipment: 'Something went wrong at Canada Post while this label was being created, so nothing was bought and it is worth trying once more.',
  payment: 'Canada Post could not bill this label because the account has no payment method saved, so add one to your Canada Post account and then try again.',
  pending: 'Canada Post is still working on this, so it will be checked again in a moment.',
  throttled: 'Canada Post is asking for a short break because too many requests went out at once, so this will carry on by itself in about a minute.',
  outage: 'Canada Post is having trouble at their end right now, so this is nothing to do with your account and it is worth trying again shortly.',
  unknown: 'Canada Post gave an answer this app did not understand, so nothing was changed and it is worth trying again before anything else.',
});

/**
 * What each handled status means for calling again.
 *
 * `summary` names a wording above rather than repeating the sentence, so the
 * owner-facing text stays in one block that can be read end to end.
 */
const STATUS_POLICY = Object.freeze({
  202: {
    category: 'pending',
    summary: 'pending',
    retryable: true,
    retryAfterMs: CANADAPOST_MIN_RETRY_MS,
    refreshToken: false,
    retryLimit: CANADAPOST_BACKOFF_RETRIES,
  },
  400: {
    category: 'validation',
    summary: 'validation',
    retryable: false,
    retryAfterMs: 0,
    refreshToken: false,
    retryLimit: 0,
  },
  401: {
    category: 'auth',
    summary: 'auth',
    retryable: true,
    retryAfterMs: 0,
    refreshToken: true,
    // Once, and only once. A second refused token is a wrong credential, and
    // repeating it is how an account gets locked out mid-mailing.
    retryLimit: CANADAPOST_TOKEN_REFRESH_RETRIES,
  },
  403: {
    category: 'authorization',
    summary: 'authorization',
    retryable: false,
    retryAfterMs: 0,
    refreshToken: false,
    retryLimit: 0,
  },
  404: {
    category: 'tracking',
    summary: 'notFound',
    retryable: false,
    retryAfterMs: 0,
    refreshToken: false,
    retryLimit: 0,
  },
});

const OUTAGE_POLICY = Object.freeze({
  category: 'outage',
  summary: 'outage',
  retryable: true,
  retryAfterMs: CANADAPOST_MIN_RETRY_MS,
  refreshToken: false,
  retryLimit: CANADAPOST_BACKOFF_RETRIES,
});

const THROTTLED_POLICY = Object.freeze({
  category: 'throttled',
  summary: 'throttled',
  retryable: true,
  // The whole window, not a token wait: the gateway is closed until it turns over.
  retryAfterMs: CANADAPOST_THROTTLE_COOLDOWN_MS,
  refreshToken: false,
  retryLimit: CANADAPOST_BACKOFF_RETRIES,
});

const UNKNOWN_POLICY = Object.freeze({
  category: 'unknown',
  summary: 'unknown',
  // Deliberately not retryable. An answer we cannot read might be a shipment
  // that already went through, and buying the same label twice costs real
  // postage; a call the owner repeats by hand is the cheaper mistake.
  retryable: false,
  retryAfterMs: 0,
  refreshToken: false,
  retryLimit: 0,
});

/** Parse a body into something addressable, or null if it is not JSON at all. */
function coerceBody(body) {
  if (!body) return null;
  if (typeof body === 'object') return body;
  if (typeof body !== 'string') return null;

  const trimmed = body.trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed);
  } catch (_) {
    // An HTML error page, the retired SOAP service's XML, or a truncated
    // response all land here. None of them are parsed: the XML shape belongs to
    // a host this app no longer calls, and its reader still lives in
    // canadapost.js for old proxy replies. On the failure path, "no messages"
    // is a usable answer and an exception is not.
    return null;
  }
}

/** One message, with both fields as trimmed strings, or null if it holds nothing. */
function toMessage(entry) {
  if (!entry || typeof entry !== 'object') return null;
  const code = entry.code === null || entry.code === undefined ? '' : String(entry.code).trim();
  const description = entry.description === null || entry.description === undefined
    ? ''
    : String(entry.description).trim();
  if (!code && !description) return null;
  return { code, description };
}

/**
 * Pull `messages[]` out of whatever came back.
 *
 * Accepts the documented envelope, a bare array, and a single message object,
 * because all three have turned up depending on which proxy hop relayed the
 * failure. Anything else is an empty list rather than a throw.
 */
export function parseCanadaPostMessages(body) {
  const source = coerceBody(body);
  if (!source || typeof source !== 'object') return [];

  const list = Array.isArray(source)
    ? source
    : Array.isArray(source.messages)
      ? source.messages
      : (source.code !== undefined || source.description !== undefined)
        ? [source]
        : [];

  return list.map(toMessage).filter(Boolean);
}

/**
 * Split a code into its letter prefix and its number.
 *
 * Leading zeros are dropped so that '003' and '3' are the same code, which they
 * are — Canada Post pads them inconsistently between documents.
 */
function readCode(code) {
  if (typeof code === 'number') {
    return Number.isFinite(code) ? { prefix: '', value: Math.trunc(code) } : null;
  }
  const match = String(code ?? '').trim().toUpperCase().match(/^([A-Z]*)0*(\d+)$/);
  return match ? { prefix: match[1], value: Number(match[2]) } : null;
}

/**
 * Which family a message code belongs to.
 *
 * The prefix has to match exactly: AA is its own numbering space, so a code
 * like AA1128 is not a validation code that happens to be spelled oddly, it is
 * a code this app has never seen and should say so about.
 */
export function classifyCanadaPostCode(code) {
  const parsed = readCode(code);
  if (!parsed) return 'unknown';

  for (const [category, range] of CODE_RANGES) {
    if (parsed.prefix === range.prefix && parsed.value >= range.min && parsed.value <= range.max) {
      return category;
    }
  }
  return 'unknown';
}

/**
 * How long to wait before retry number `attempt` (0 is the first retry).
 *
 * Exported so that every caller backs off the same way. The floor is the
 * documented one second and the ceiling keeps a stalled batch from looking hung.
 */
export function canadaPostBackoffMs(attempt = 0, baseMs = CANADAPOST_MIN_RETRY_MS) {
  const step = Math.max(0, Math.floor(Number(attempt) || 0));
  const base = Math.max(CANADAPOST_MIN_RETRY_MS, Number(baseMs) || 0);
  return Math.min(base * 2 ** step, CANADAPOST_MAX_RETRY_MS);
}

/** The payment-method code in these messages, if there is one. */
function findPaymentMethodCode(messages) {
  for (const message of messages) {
    const parsed = readCode(message.code);
    if (parsed && parsed.prefix === '' && CANADAPOST_PAYMENT_METHOD_CODES.includes(parsed.value)) {
      return parsed.value;
    }
  }
  return null;
}

/**
 * Turn a Canada Post failure into a decision.
 *
 * Returns:
 *   category     — one of CANADAPOST_FAILURE_CATEGORIES.
 *   retryable    — whether calling again could plausibly work.
 *   retryAfterMs — how long to wait first; 0 means straight away.
 *   retryLimit   — how many retries are allowed, since "retry" and "retry once"
 *                  are different instructions and only one of them is safe for
 *                  a refused token.
 *   refreshToken — whether to mint a new bearer token before retrying.
 *   messages     — every code and description Canada Post sent, unaltered.
 *   detail       — the first description, for showing under the summary.
 *   summary      — one plain sentence for the shop owner.
 */
export function classifyCanadaPostFailure({ status = 0, body = '' } = {}) {
  const messages = parseCanadaPostMessages(body);
  const httpStatus = Number(status) || 0;
  const detail = messages.find(m => m.description)?.description || '';

  const finish = (policy, category = policy.category, summaryKey = policy.summary) => ({
    category,
    retryable: policy.retryable,
    retryAfterMs: policy.retryAfterMs,
    retryLimit: policy.retryLimit,
    refreshToken: policy.refreshToken,
    messages,
    detail,
    summary: OWNER_SUMMARIES[summaryKey] || OWNER_SUMMARIES.unknown,
  });

  // Throttling first: it is about whether the call reached Canada Post at all,
  // so nothing in the body can change the answer.
  if (isThrottleResponse({ status: httpStatus, body })) return finish(THROTTLED_POLICY);

  // Then the payment-method pair, which overrides the status because no status
  // can describe "the account cannot be billed" and no retry schedule fixes it.
  const paymentCode = findPaymentMethodCode(messages);
  if (paymentCode !== null) {
    const retryable = paymentCode === CANADAPOST_PAYMENT_METHOD_RETRY_CODE;
    return finish({
      category: 'payment',
      summary: 'payment',
      retryable,
      retryAfterMs: retryable ? CANADAPOST_MIN_RETRY_MS : 0,
      retryLimit: retryable ? 1 : 0,
      refreshToken: false,
    });
  }

  const policy = httpStatus >= 500
    ? OUTAGE_POLICY
    : STATUS_POLICY[httpStatus] || UNKNOWN_POLICY;

  // The code wins on what this is, the status still decides whether to call
  // again — a service code under a plain bad-request status is a service
  // problem, but it is no more repeatable for being one.
  const coded = messages.map(m => classifyCanadaPostCode(m.code)).find(c => c !== 'unknown');
  return coded ? finish(policy, coded, coded) : finish(policy);
}
