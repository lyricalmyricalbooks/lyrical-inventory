// Matching a paid postage receipt to the website order it shipped.
//
// The Shippo path has it easy: the API hands back the order number, or failing
// that an email address, so lib/shipping-reconciliation.js can match on an
// identifier. Postage bought at a counter has none of that. A Canada Post
// receipt carries a recipient name, a tracking number, a carrier order number
// and a price — and of those, the name is the only thing that also appears on
// the website order. So the name is what this module matches on, with the
// surname carrying most of the weight: first names get shortened ("Danny" for
// "Daniela") and mistyped far more often than surnames do.
//
// Pure: no DOM, no state, no network. Everything here is a function of the
// expense and the orders passed in, which is what makes the tiers testable.

const POSTAGE_CATEGORY = 'Shipping & Postage';

const clean = (value) => String(value ?? '').trim();

// Titles and suffixes are noise on both sides of the comparison, and a suffix
// left in place would make "John Barnard Jr" miss "John Barnard" outright.
const NAME_NOISE = new Set([
  'mr', 'mrs', 'ms', 'miss', 'mx', 'dr', 'prof', 'sir', 'madam',
  'jr', 'sr', 'ii', 'iii', 'iv', 'phd', 'md', 'esq',
]);

/** Fold accents, drop punctuation, collapse whitespace, lowercase. */
export function normalizeName(value) {
  return clean(value)
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[.,''`]/g, '')
    .replace(/[^a-z0-9\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Split a printed name into parts.
 *
 * Handles the three forms these documents actually use: "DANIELA DAWSON" from
 * a shipping label, "Daniela Dawson" from a storefront, and "Dawson, Daniela"
 * from an address book export. A single-word name is treated as a surname,
 * because that is the half a one-word entry almost always is.
 */
export function personNameParts(value) {
  const raw = clean(value);
  if (!raw) return { first: '', last: '', tokens: [], full: '' };

  const commaSplit = raw.split(',');
  const ordered = commaSplit.length > 1 && clean(commaSplit[1])
    ? `${clean(commaSplit.slice(1).join(' '))} ${clean(commaSplit[0])}`
    : raw;

  const tokens = normalizeName(ordered).split(' ')
    .filter(token => token && !NAME_NOISE.has(token));
  if (!tokens.length) return { first: '', last: '', tokens: [], full: '' };

  return {
    first: tokens.length > 1 ? tokens[0] : '',
    last: tokens[tokens.length - 1],
    tokens,
    full: tokens.join(' '),
  };
}

/**
 * A tracking number with its formatting removed: "LE 055 214 725 CA" and
 * "le055214725ca" are the same parcel, and the owner will type whichever the
 * receipt happens to print.
 */
export function normalizeTrackingNumber(value) {
  return clean(value).toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/** Pretty-print a Canada Post number back into its spaced form for display. */
export function formatTrackingNumber(value) {
  const bare = normalizeTrackingNumber(value);
  const cp = bare.match(/^([A-Z]{2})(\d{3})(\d{3})(\d{3})([A-Z]{2})$/);
  return cp ? `${cp[1]} ${cp[2]} ${cp[3]} ${cp[4]} ${cp[5]}` : bare;
}

/**
 * Which carrier a tracking number belongs to, from its shape alone.
 *
 * Deliberately conservative: an unrecognised shape returns '' rather than a
 * guess, because a wrong carrier means a tracking link that 404s and a
 * customer told to look in the wrong place.
 */
export function carrierFromTracking(value) {
  const bare = normalizeTrackingNumber(value);
  if (!bare) return '';
  // Universal Postal Union S10: two letters, nine digits, two-letter country.
  const upu = bare.match(/^[A-Z]{2}\d{9}([A-Z]{2})$/);
  if (upu) return upu[1] === 'CA' ? 'Canada Post' : 'Postal';
  if (/^1Z[A-Z0-9]{16}$/.test(bare)) return 'UPS';
  if (/^\d{16}$/.test(bare)) return 'Canada Post';
  if (/^(94|93|92|95)\d{20}$/.test(bare)) return 'USPS';
  if (/^\d{12}$/.test(bare) || /^\d{15}$/.test(bare)) return 'FedEx';
  return '';
}

/** A public tracking page for a number, or '' when the carrier is unknown. */
export function trackingUrlFor(value, carrierHint = '') {
  const bare = normalizeTrackingNumber(value);
  if (!bare) return '';
  const carrier = clean(carrierHint) || carrierFromTracking(bare);
  switch (carrier) {
    case 'Canada Post':
    case 'Postal':
      return `https://www.canadapost-postescanada.ca/track-reperage/en#/details/${bare}`;
    case 'UPS':
      return `https://www.ups.com/track?tracknum=${bare}`;
    case 'USPS':
      return `https://tools.usps.com/go/TrackConfirmAction?tLabels=${bare}`;
    case 'FedEx':
      return `https://www.fedex.com/fedextrack/?trknbr=${bare}`;
    default:
      return '';
  }
}

/**
 * A stable identity for one postage expense.
 *
 * NOT `ref`. Every hand-entered expense is created with `ref: ''` (main.js
 * submitTaxExpense), and `ref` stays a free-text field the owner can edit or
 * leave blank. Keying rows off it meant every ref-less receipt shared one
 * identity: a lookup found whichever came first, and the rows shared DOM ids,
 * so a dismiss hit the wrong receipt and a second receipt's inputs read the
 * first one's values. `id` is what the rest of the app keys expenses by.
 */
export function postageExpenseKey(expense = {}) {
  const id = clean(expense.id);
  if (id) return `id:${id}`;
  const ref = clean(expense.ref);
  if (ref) return `ref:${ref}`;
  // Nothing stable to key on. A content hash is still better than a shared
  // blank: two different receipts almost never agree on all four.
  return `x:${clean(expense.date)}|${clean(expense.amount)}|${clean(expense.desc).slice(0, 40)}|${clean(expense.currency)}`;
}

/** Find one postage expense by the key postageExpenseKey() produced. */
export function findPostageByKey(expenses = [], key) {
  const wanted = String(key ?? '');
  return expenses.find(expense => postageExpenseKey(expense) === wanted) || null;
}

// Words that mean "this bought a parcel's carriage". Checked FIRST, so a real
// service whose name happens to contain a supply word — "Priority Mail Flat
// Rate Box" is postage, not a box — is never mistaken for equipment.
const POSTAGE_SIGNALS = [
  'canada post', 'postes canada', 'canadapost', 'shippo', 'usps', 'ups ', 'fedex', 'dhl',
  'purolator', 'stallion', 'chit chats', 'royal mail', 'auspost',
  'postage', 'shipping label', 'tracked packet', 'xpresspost', 'expedited parcel',
  'priority mail', 'first class', 'ground advantage', 'flat rate', 'stamp', 'small packet',
];

// Words that mean "this bought a thing you keep". Shipping supplies and
// equipment are genuine shipping costs, but they are not the carriage of any
// one parcel, so they can never be matched to an order and must not be counted
// as a carrier's spend. Deliberately excludes a bare "label", which would
// swallow every Shippo label.
const SUPPLY_SIGNALS = [
  'scale', 'weighing', 'box of', 'boxes', 'carton', 'tape', 'envelope', 'mailer',
  'bubble', 'wrap', 'packaging', 'packing material', 'printer', 'ink', 'toner',
  'label stock', 'label roll', 'dispenser', 'trolley', 'shelving', 'cutter',
  'scissors', 'stationery', 'ruler', 'pallet',
];

/**
 * Whether this expense is the carriage of a parcel, rather than kit bought to
 * help ship parcels.
 *
 * Anything already tied to a shipment — a Shippo import, a recorded recipient
 * or tracking number, an existing link — is postage by evidence and never
 * reaches the wording test, so the heuristic can only ever misjudge an
 * untouched, hand-typed description. It defaults to "yes" on an unrecognised
 * one, because a false positive is clutter the owner can dismiss while a false
 * negative silently hides real postage from the only screen that would catch
 * it.
 */
export function looksLikeParcelPostage(expense = {}) {
  if (String(expense.ref || '').startsWith('shippo:')) return true;
  if (clean(expense.recipientName) || clean(expense.trackingNumber)) return true;
  if (clean(expense.shippingOrderNumber)) return true;

  const haystack = ` ${clean(expense.desc).toLowerCase()} `;
  if (POSTAGE_SIGNALS.some(word => haystack.includes(word))) return true;
  if (SUPPLY_SIGNALS.some(word => haystack.includes(word))) return false;
  return true;
}

/**
 * Every postage cost in the ledger, whichever carrier it came from.
 *
 * A refund credit carries the same category and a negative amount; it reverses
 * a label rather than paying for one, so it can never be the postage behind an
 * order and is excluded here rather than at each call site. Shipping equipment
 * filed under the same category is excluded for the same reason — it is a real
 * cost, but not any parcel's, and the carrier scorecard sums this list whether
 * or not an entry is linked, so a luggage scale left in it becomes carrier
 * spend that no carrier was ever paid.
 */
export function isPostageExpense(expense = {}) {
  if (expense.cat !== POSTAGE_CATEGORY) return false;
  if (String(expense.ref || '').startsWith('shippo-refund:')) return false;
  if ((Number(expense.amount) || 0) <= 0) return false;
  return looksLikeParcelPostage(expense);
}

/** True once a postage expense is tied to an order. */
export function isPostageLinked(expense = {}) {
  return expense.shippingMatchStatus === 'matched' && !!clean(expense.shippingOrderNumber);
}

/**
 * The recipient this postage was for.
 *
 * Shippo fills `recipientName` from the label. A counter receipt has no such
 * field until someone types it, so fall back to a name the owner wrote into
 * the description — "Canada Post — Dawson" is exactly what a hurried entry
 * looks like, and reading it saves re-typing.
 */
// Words that appear in a postage description and never in a person's name.
// Without this, "Canada Post — Tracked Packet" reads as a customer called
// Tracked Packet, and the matcher then hunts for an order under that name.
const NOT_A_NAME = new Set([
  'postage', 'packet', 'parcel', 'tracked', 'label', 'shipping', 'shipment',
  'post', 'mail', 'express', 'expedited', 'priority', 'standard', 'regular',
  'usa', 'us', 'canada', 'international', 'domestic', 'stamp', 'stamps',
  'oversize', 'letter', 'flat', 'rate', 'insurance', 'signature', 'return',
]);

export function postageRecipientName(expense = {}) {
  const stored = clean(expense.recipientName);
  if (stored) return stored;

  // Split on a dash used as a separator only — an em or en dash, or a hyphen
  // with spaces around it. A bare hyphen belongs to the words it joins, and
  // splitting on it turned "Tracked Packet - USA postage" into "USA postage".
  const tail = clean(expense.desc).split(/\s+[—–]\s+|\s+-\s+/).pop();
  const candidate = clean(tail);
  if (!/^[A-Za-z][A-Za-z'-]*(\s+[A-Za-z][A-Za-z'-]*){1,2}$/.test(candidate)) return '';
  const words = candidate.toLowerCase().split(/\s+/);
  return words.some(word => NOT_A_NAME.has(word)) ? '' : candidate;
}

/** Whole days from the order date to the postage date; null if either is unusable. */
function daysAfterOrder(orderDate, postageDate) {
  const orderMs = Date.parse(`${clean(orderDate)}T00:00:00Z`);
  const postageMs = Date.parse(`${clean(postageDate)}T00:00:00Z`);
  if (!Number.isFinite(orderMs) || !Number.isFinite(postageMs)) return null;
  return Math.round((postageMs - orderMs) / 86400000);
}

// Postage bought before the order existed is not this order's postage; a label
// bought more than this many days later is almost certainly a different one.
const MAX_DAYS_AFTER_ORDER = 45;
// Buying the label a day or two before entering the order is ordinary; a small
// negative window keeps that from disqualifying a good match.
const MIN_DAYS_AFTER_ORDER = -3;

/**
 * How well one postage receipt matches one order, and why.
 *
 * The tiers exist so the UI can say what it believes and how strongly, rather
 * than silently linking money to the wrong customer. Nothing here ever links
 * on its own — `confident` still means "pre-selected for the owner to confirm".
 *
 * Returns null when the pair cannot match at all.
 */
export function scorePostageOrderMatch(expense = {}, order = {}, opts = {}) {
  const { recipientOverride = '' } = opts;
  const receipt = personNameParts(recipientOverride || postageRecipientName(expense));
  const customer = personNameParts(order.shipName || order.customer || order.name);
  if (!receipt.last || !customer.last) return null;

  const gap = daysAfterOrder(order.date, expense.date);
  // An unreadable date on either side is a missing signal, not a mismatch —
  // the name still stands on its own.
  if (gap !== null && (gap < MIN_DAYS_AFTER_ORDER || gap > MAX_DAYS_AFTER_ORDER)) return null;

  const reasons = [];
  let score = 0;

  if (receipt.full === customer.full) {
    score += 100;
    reasons.push('Name matches exactly');
  } else if (receipt.last === customer.last) {
    score += 70;
    reasons.push(`Surname ${titleCase(customer.last)} matches`);
    if (receipt.first && customer.first) {
      if (receipt.first === customer.first) {
        score += 20;
        reasons.push('First name matches');
      } else if (receipt.first[0] === customer.first[0]) {
        score += 8;
        reasons.push('First initial matches');
      } else {
        // Same surname, clearly different person — two Dawsons in one week is
        // rarer than a shortened first name, so this is a demotion not a veto.
        score -= 25;
        reasons.push('First name differs');
      }
    }
  } else if (receipt.tokens.includes(customer.last) || customer.tokens.includes(receipt.last)) {
    // A surname that landed in the wrong field, or a double-barrelled name
    // recorded one way on the label and another on the storefront.
    score += 45;
    reasons.push('Part of the name matches');
  } else {
    return null;
  }

  if (gap !== null) {
    if (gap >= 0 && gap <= 7) {
      score += 15;
      reasons.push(gap === 0 ? 'Posted the same day' : `Posted ${gap} day${gap === 1 ? '' : 's'} after the order`);
    } else if (gap > 7 && gap <= 21) {
      score += 5;
      reasons.push(`Posted ${gap} days after the order`);
    } else if (gap < 0) {
      reasons.push(`Posted ${Math.abs(gap)} day${gap === -1 ? '' : 's'} before the order was recorded`);
    } else {
      score -= 10;
      reasons.push(`Posted ${gap} days after the order`);
    }
  }

  return {
    orderNumber: clean(order.num || order.orderNum),
    orderName: clean(order.shipName || order.customer || order.name),
    orderDate: clean(order.date),
    score,
    tier: score >= 100 ? 'confident' : score >= 65 ? 'likely' : 'weak',
    reason: reasons.join(' · '),
  };
}

function titleCase(value) {
  const text = clean(value);
  return text ? text[0].toUpperCase() + text.slice(1) : '';
}

/**
 * Ranked order candidates for one postage receipt, best first.
 *
 * `takenOrderNumbers` are orders already carrying postage; they are dropped so
 * the second label of a two-parcel day cannot be offered the order the first
 * one already paid for.
 */
export function suggestPostageMatches(expense = {}, orders = [], opts = {}) {
  const { takenOrderNumbers = [], recipientOverride = '', limit = 5 } = opts;
  const taken = new Set(takenOrderNumbers.map(value => clean(value).toUpperCase()));
  return orders
    .filter(order => !taken.has(clean(order.num || order.orderNum).toUpperCase()))
    .map(order => scorePostageOrderMatch(expense, order, { recipientOverride }))
    .filter(Boolean)
    .sort((a, b) => b.score - a.score || a.orderDate.localeCompare(b.orderDate))
    .slice(0, Math.max(1, limit));
}

/**
 * The subset of postage receipts that can be linked without a judgement call.
 *
 * Three conditions, all required. The receipt's best candidate must be
 * `confident`; it must be clearly ahead of the runner-up, so two same-surname
 * orders in one week stay with the owner; and no two receipts may want the
 * same order, because at most one of them can be right and picking either
 * would put real money on the wrong customer. Everything filtered out here
 * still appears in the worklist for the owner to decide.
 */
export function autoMatchPostage(expenses = [], orders = [], opts = {}) {
  const { takenOrderNumbers = [] } = opts;
  const claimed = new Set(takenOrderNumbers.map(value => clean(value).toUpperCase()));
  const wanted = new Map();
  const proposals = [];

  expenses.forEach(expense => {
    const [best, runnerUp] = suggestPostageMatches(expense, orders, {
      takenOrderNumbers: Array.from(claimed),
      limit: 2,
    });
    if (!best || best.tier !== 'confident') return;
    if (runnerUp && best.score - runnerUp.score < 25) return;
    proposals.push({ expense, match: best });
    const key = best.orderNumber.toUpperCase();
    wanted.set(key, (wanted.get(key) || 0) + 1);
  });

  return proposals.filter(({ match }) => wanted.get(match.orderNumber.toUpperCase()) === 1);
}

/**
 * The receipts worth pointing the reader at.
 *
 * A receipt with both a recipient and a tracking number already recorded has
 * nothing left to read, and re-reading it would spend an API call to overwrite
 * good data with a guess. Ordered oldest-first so a long batch works through
 * the backlog in the order it accumulated.
 */
export function postageScanCandidates(expenses = [], { includeComplete = false } = {}) {
  return expenses
    .filter(expense => clean(expense.receipt))
    .filter(expense => includeComplete
      || !postageRecipientName(expense)
      || !normalizeTrackingNumber(expense.trackingNumber))
    .sort((a, b) => clean(a.date).localeCompare(clean(b.date)));
}

/**
 * What a scan should write onto a receipt, given what it read.
 *
 * Only fills blanks by default. A recipient the owner typed by hand is better
 * evidence than a reader's guess at smudged toner, so a scan must never
 * silently replace it. Returns an empty object when there is nothing to add,
 * which is how the caller knows the scan found nothing usable.
 */
export function mergeScannedPostageFields(expense = {}, fields = {}, { overwrite = false } = {}) {
  const patch = {};

  const recipient = clean(fields.recipient);
  if (recipient && (overwrite || !postageRecipientName(expense))) {
    patch.recipientName = recipient;
  }

  const tracking = normalizeTrackingNumber(fields.tracking);
  // Six characters is below any real carrier format; anything shorter is the
  // reader having picked up a fragment, and storing it would put a dead link
  // in front of a customer.
  if (tracking.length >= 6 && (overwrite || !normalizeTrackingNumber(expense.trackingNumber))) {
    patch.trackingNumber = tracking;
    const carrier = carrierFromTracking(tracking);
    if (carrier) patch.trackingCarrier = carrier;
    const url = trackingUrlFor(tracking, carrier);
    if (url) patch.trackingUrl = url;
  }

  return patch;
}

/**
 * The fields a link writes onto the postage expense.
 *
 * Kept here rather than at the call site so the manual path, the auto-match
 * path and the tests all agree on what "linked" means — and so a tracking
 * number typed during linking is stored with a usable carrier and URL beside
 * it instead of as a bare string nothing can open.
 */
export function postageLinkPatch(orderNumber, { recipientName = '', trackingNumber = '', method = 'manual' } = {}) {
  const patch = {
    shippingOrderNumber: clean(orderNumber).replace(/^#?/, '#').toUpperCase(),
    shippingMatchMethod: method,
    shippingMatchStatus: 'matched',
  };
  const recipient = clean(recipientName);
  if (recipient) patch.recipientName = recipient;

  const tracking = normalizeTrackingNumber(trackingNumber);
  if (tracking) {
    patch.trackingNumber = tracking;
    const carrier = carrierFromTracking(tracking);
    if (carrier) patch.trackingCarrier = carrier;
    const url = trackingUrlFor(tracking, carrier);
    if (url) patch.trackingUrl = url;
  }
  return patch;
}
