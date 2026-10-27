/**
 * Canada Post call pacing — one place, and one queue per product.
 *
 * Canada Post throttles on a rolling 60-second window and asks for at least a
 * quarter second between calls. When a window is spent the gateway answers with
 * a "Server Rejected by SLM Monitor" rejection (or a bare 429) and stays shut
 * for the rest of the minute, so the price of going too fast is not one failed
 * call — it is a minute in the middle of the publisher's mailing run.
 *
 * Two things about those published limits shape this file.
 *
 * They are PER PRODUCT. Rating, Shipping and Tracking are separate
 * subscriptions with separate allowances, so a single global queue would be
 * wrong in both directions at once: a burst of rate quotes would hold up a
 * tracking poll that had spent nothing, while a label purchase would be waved
 * straight through on a Rating allowance it never touched. Each product gets
 * its own queue, and an unrecognised product name gets its own rather than
 * borrowing Rating's.
 *
 * The per-window call CEILING is not published as a number — only the spacing
 * is. So the spacing is what gets enforced ahead of time, and the window shows
 * up here only as the length of the cooldown: a rejection means the window is
 * already spent, and there is nothing useful to do but sit out the rest of it.
 * Guessing at a ceiling would either throttle the app for no reason or fail to
 * prevent the very rejection this exists to avoid.
 *
 * `now` and `sleep` are injectable everywhere. That is partly so the test suite
 * never actually waits a minute, and partly so this module owns no timers it
 * would then have to cancel: the caller's own clock decides when a wait is over.
 */

/** Minimum gap between two calls to the same product, per the published limit. */
export const CANADAPOST_MIN_CALL_SPACING_MS = 250;

/** The window Canada Post counts calls in. */
export const CANADAPOST_THROTTLE_WINDOW_MS = 60_000;

/**
 * How long to stand down after a rejection.
 *
 * Derived from the window rather than written out again, because they are the
 * same fact: being rejected means this window is gone, so the next one is the
 * earliest thing worth trying.
 */
export const CANADAPOST_THROTTLE_COOLDOWN_MS = CANADAPOST_THROTTLE_WINDOW_MS;

/** The HTTP status the gateway uses when it is turning calls away. */
export const CANADAPOST_THROTTLE_STATUS = 429;

/**
 * The products with their own allowances. Passing one of these is preferred to
 * a hand-typed string only because a typo would silently open a second queue.
 */
export const CANADAPOST_PRODUCTS = Object.freeze({
  RATING: 'rating',
  SHIPPING: 'shipping',
  TRACKING: 'tracking',
});

/**
 * The gateway's throttle rejection, which arrives as body text rather than as a
 * status on some hops. Matched loosely on whitespace and case because it has
 * been seen wrapped in XML, in JSON and in a bare HTML error page, but no
 * looser than that: a false positive here costs a full minute of not calling,
 * so only the phrase Canada Post actually uses counts.
 */
export const CANADAPOST_SLM_REJECTION_PATTERN = /\bslm[\s_-]*monitor\b/i;

/** Per-product pacing state, created on first use. */
const throttleState = new Map();

const defaultNow = () => Date.now();
const defaultSleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Normalise a product name to its queue key.
 *
 * A blank or junk name lands in one shared bucket instead of getting a fresh
 * queue per call: pacing a call that did not need it costs a quarter second,
 * while failing to pace one costs the minute.
 */
function productKey(product) {
  return String(product ?? '').trim().toLowerCase() || 'unknown';
}

function stateFor(product) {
  const key = productKey(product);
  if (!throttleState.has(key)) {
    throttleState.set(key, {
      // null rather than 0, so the very first call for a product is not made to
      // wait out a quarter second measured from the epoch.
      lastStartedAt: null,
      readyAt: null,
      cooldownUntil: 0,
      queue: Promise.resolve(),
    });
  }
  return throttleState.get(key);
}

/** Whatever came back, as text we can search. */
function readBodyText(body) {
  if (body === null || body === undefined) return '';
  if (typeof body === 'string') return body;
  try {
    return JSON.stringify(body);
  } catch (_) {
    // Circular or otherwise unserialisable — fall through to a plain coercion
    // rather than throwing out of what is only ever a yes/no question.
    return String(body);
  }
}

/**
 * True when a response is Canada Post turning calls away rather than failing.
 *
 * Both forms count: the status, and the rejection text, which is what arrives
 * when the rejection is relayed through a proxy hop that answers 200 with the
 * gateway's words in the body.
 */
export function isThrottleResponse({ status = 0, body = '' } = {}) {
  if (Number(status) === CANADAPOST_THROTTLE_STATUS) return true;
  return CANADAPOST_SLM_REJECTION_PATTERN.test(readBodyText(body));
}

/**
 * Start a product's cooldown, and return the moment it ends.
 *
 * Called by whoever read the response, rather than inferred from the result of
 * the call: this module has no idea what shape a given product's answer takes,
 * and guessing at one would either miss real rejections or stand down on a
 * perfectly good response.
 */
export function noteCanadaPostThrottled(product, { now = defaultNow } = {}) {
  const clock = typeof now === 'function' ? now : defaultNow;
  const state = stateFor(product);
  const until = clock() + CANADAPOST_THROTTLE_COOLDOWN_MS;
  // The later deadline wins. A second rejection part-way through a cooldown
  // means the gateway was still shut when it arrived, so the minute runs from
  // there; and nothing — including a clock that jumped backwards — can cut a
  // stand-down short, which is the failure that costs another whole minute.
  state.cooldownUntil = Math.max(state.cooldownUntil, until);
  return state.cooldownUntil;
}

/**
 * Milliseconds still owed on a product's cooldown, 0 when it is free to call.
 * For showing the wait to the publisher, so a stalled batch reads as "waiting
 * for Canada Post" rather than as nothing happening.
 */
export function describeThrottleWait(product, { now = defaultNow } = {}) {
  const clock = typeof now === 'function' ? now : defaultNow;
  const key = productKey(product);
  const state = throttleState.get(key);
  if (!state) return 0;
  return Math.max(0, state.cooldownUntil - clock());
}

/**
 * Wait until this product may be called again, then record the slot as taken.
 *
 * The gate is measured from `from`, the later of the wall clock and the moment
 * the previous call for this product began. Under a real clock those are the
 * same thing and this is just "how long until the gap has passed". Under an
 * injected clock that does not advance, it is what keeps a queue of three calls
 * a quarter second apart instead of measuring every wait from one frozen
 * instant and having them grow.
 */
async function takeSlot(state, { now, sleep }) {
  const from = state.lastStartedAt === null
    ? now()
    : Math.max(now(), state.lastStartedAt);

  const gate = Math.max(state.readyAt === null ? from : state.readyAt, state.cooldownUntil);
  const wait = Math.max(0, gate - from);
  if (wait > 0) await sleep(wait);

  // The cooldown is cleared once served rather than re-checked against the
  // clock, so the calls queued behind this one do not each sit out the same
  // minute over again.
  state.cooldownUntil = 0;

  const startedAt = from + wait;
  state.lastStartedAt = startedAt;
  state.readyAt = startedAt + CANADAPOST_MIN_CALL_SPACING_MS;
}

/**
 * Run `fn` once this product's queue and cooldown allow it.
 *
 * Calls line up in the order they were asked for, because a mailing run that
 * reorders itself under load is much harder to reason about than one that is
 * simply slow. The queue keeps going after a failed call: one rejected rate
 * quote must not wedge every later call for that product.
 */
export function scheduleCanadaPostCall(product, fn, { now = defaultNow, sleep = defaultSleep } = {}) {
  if (typeof fn !== 'function') {
    return Promise.reject(new TypeError('scheduleCanadaPostCall needs a function to run.'));
  }

  const clocks = {
    now: typeof now === 'function' ? now : defaultNow,
    sleep: typeof sleep === 'function' ? sleep : defaultSleep,
  };
  const state = stateFor(product);

  // The turn is claimed synchronously, before anything is awaited, so callers
  // that fire in the same tick keep their order instead of racing for the slot.
  const turn = state.queue.then(async () => {
    await takeSlot(state, clocks);
    return fn();
  });

  state.queue = turn.then(() => undefined, () => undefined);
  return turn;
}

/**
 * Forget one product's pacing. For tests; it does not cancel work already
 * queued, which keeps the state object it started with.
 */
export function resetCanadaPostThrottle(product) {
  throttleState.delete(productKey(product));
}

/** Forget every product's pacing. For tests. */
export function resetAllCanadaPostThrottles() {
  throttleState.clear();
}
