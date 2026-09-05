import { roundCents } from './money.js';

const ORDER_PATTERN = /#?([A-Z0-9]+-[A-Z0-9-]+)/i;
const normalizeText = (value) => String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
const normalizePostal = (value) => String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

function levenshteinDistance(a, b) {
  if (!a || !b) return (a || b || '').length;
  const mx = Array(b.length + 1).fill(null).map(() => Array(a.length + 1).fill(null));
  for (let i = 0; i <= a.length; i++) mx[0][i] = i;
  for (let j = 0; j <= b.length; j++) mx[j][0] = j;
  for (let j = 1; j <= b.length; j++) {
    for (let i = 1; i <= a.length; i++) {
      const subCost = a[i - 1] === b[j - 1] ? 0 : 1;
      mx[j][i] = Math.min(mx[j][i - 1] + 1, mx[j - 1][i] + 1, mx[j - 1][i - 1] + subCost);
    }
  }
  return mx[b.length][a.length];
}

export function normalizeShippingOrderNumber(value) {
  const match = String(value || '').trim().match(ORDER_PATTERN);
  return match ? `#${match[1].toUpperCase()}` : '';
}

export function extractShippingOrderNumber(...values) {
  for (const value of values.flat(Infinity)) {
    const normalized = normalizeShippingOrderNumber(value);
    if (normalized) return normalized;
  }
  return '';
}

function withinShippingWindow(orderDate, expenseDate, maxDays = 7) {
  const orderMs = Date.parse(`${orderDate || ''}T00:00:00Z`);
  const expenseMs = Date.parse(`${expenseDate || ''}T00:00:00Z`);
  if (!Number.isFinite(orderMs) || !Number.isFinite(expenseMs)) return false;
  const days = Math.floor((expenseMs - orderMs) / 86400000);
  return days >= 0 && days <= maxDays;
}

export function reconcileShippingExpense(expense = {}, orders = []) {
  const exact = normalizeShippingOrderNumber(expense.sourceOrderNumber || expense.shippingOrderNumber);
  const exactOrder = exact && orders.find(order => normalizeShippingOrderNumber(order.num) === exact);
  if (exactOrder) {
    return { shippingOrderNumber: exact, shippingMatchMethod: expense.sourceOrderMethod || 'metadata', shippingMatchStatus: 'matched' };
  }

  const eligible = orders.filter(order => withinShippingWindow(order.date, expense.date));
  const email = normalizeText(expense.recipientEmail);
  // Which rule found the candidate, not just that one was found. The three
  // tiers below are not equally trustworthy — an exact email is the buyer's own
  // address, a fuzzy surname is a guess — and anything deciding to link without
  // being asked has to be able to tell them apart. Without this they all
  // reported the same 'recipient' method and were indistinguishable.
  let tier = '';
  let candidates = email ? eligible.filter(order => normalizeText(order.shipEmail || order.email) === email) : [];
  if (candidates.length) tier = 'email';
  if (!candidates.length) {
    const name = normalizeText(expense.recipientName);
    const postal = normalizePostal(expense.recipientPostal);
    if (name && postal) {
      candidates = eligible.filter(order =>
        normalizeText(order.shipName || order.customer) === name && normalizePostal(order.shipPostal) === postal
      );
      if (candidates.length) tier = 'name-postal';
    }
    // Fallback: fuzzy name match within 14 days when postal is absent or exact match failed
    if (!candidates.length && name) {
      const widerEligible = orders.filter(order => withinShippingWindow(order.date, expense.date, 14));
      candidates = widerEligible.filter(order => {
        const orderName = normalizeText(order.shipName || order.customer);
        if (!orderName) return false;
        if (orderName === name) return true;
        
        // Levenshtein fuzzy matching
        const distance = levenshteinDistance(name, orderName);
        const maxLength = Math.max(name.length, orderName.length);
        // Allow up to 3 typos for names 10+ chars, 2 typos for 6+ chars, 1 typo otherwise
        const threshold = maxLength >= 10 ? 3 : (maxLength >= 6 ? 2 : 1);
        return distance <= threshold;
      });
      if (candidates.length) tier = 'fuzzy';
    }
  }

  const nums = candidates.map(order => normalizeShippingOrderNumber(order.num)).filter(Boolean);
  if (nums.length === 1) {
    return {
      shippingSuggestedOrderNumber: nums[0],
      shippingMatchMethod: 'recipient',
      shippingMatchTier: tier,
      shippingMatchStatus: 'suggested',
    };
  }
  if (nums.length > 1) {
    return {
      shippingCandidateOrderNumbers: nums,
      shippingMatchMethod: 'recipient',
      shippingMatchTier: tier,
      shippingMatchStatus: 'ambiguous',
    };
  }
  return { shippingMatchMethod: '', shippingMatchStatus: 'unmatched' };
}

/**
 * Postage from Shippo that still has no order behind it.
 *
 * The reconciliation worklist, the clear-all action and the auto-linker all ask
 * this same question, and asked it with three separately-written copies of the
 * same condition. One name, so a change to what "still needs attention" means
 * cannot land in two of the three places.
 */
export function isUnresolvedShippoPostage(expense) {
  return String(expense?.ref || '').startsWith('shippo:')
    && expense?.shippingMatchStatus !== 'matched'
    && expense?.shippingMatchStatus !== 'dismissed';
}

/** The candidate rules exact enough to act on without being asked. */
const CONFIDENT_TIERS = new Set(['email', 'name-postal']);

export function enrichShippoExpense(expense, transaction = {}, shipment = {}, shippoOrder = {}, orders = []) {
  const {
    shippingOrderNumber: _shippingOrderNumber,
    shippingSuggestedOrderNumber: _shippingSuggestedOrderNumber,
    shippingCandidateOrderNumbers: _shippingCandidateOrderNumbers,
    shippingMatchMethod: _shippingMatchMethod,
    shippingMatchTier: _shippingMatchTier,
    shippingMatchStatus: _shippingMatchStatus,
    ...accountingFields
  } = expense;
  const metadataOrderNumber = extractShippingOrderNumber(
    transaction.metadata,
    shipment.metadata,
    shippoOrder.metadata,
  );
  const shippoOrderNumber = normalizeShippingOrderNumber(shippoOrder.order_number);
  const sourceOrderNumber = metadataOrderNumber || shippoOrderNumber;
  const recipient = shipment.address_to || shippoOrder.to_address || {};
  const source = {
    sourceOrderNumber,
    sourceOrderMethod: metadataOrderNumber ? 'metadata' : (shippoOrderNumber ? 'shippo-order' : ''),
    recipientEmail: recipient.email || '',
    recipientName: recipient.name || '',
    recipientPostal: recipient.zip || '',
    date: expense.date,
  };
  // The rest of the label's delivery address. Matching never needs it — but a
  // label with no website order behind it is the one case where the address is
  // the only surviving record of where the book went, and rebuilding the
  // missing order from the worklist needs somewhere to read it from.
  const recipientAddress = {
    recipientStreet1: recipient.street1 || '',
    recipientStreet2: recipient.street2 || '',
    recipientCity: recipient.city || '',
    recipientState: recipient.state || '',
    recipientCountry: recipient.country || '',
    recipientPhone: recipient.phone || '',
  };
  return {
    ...accountingFields,
    shippoTransactionId: String(transaction.object_id || '').trim(),
    shippoShipmentId: String(shipment.object_id || (typeof transaction.shipment === 'string' ? transaction.shipment : '') || '').trim(),
    shippoOrderId: String(shippoOrder.object_id || (typeof transaction.order === 'string' ? transaction.order : '') || '').trim(),
    recipientEmail: source.recipientEmail,
    recipientName: source.recipientName,
    recipientPostal: source.recipientPostal,
    ...recipientAddress,
    ...reconcileShippingExpense(source, orders),
  };
}

export function stageShippoExpenseEnrichment(
  expense,
  transaction = {},
  shipment = {},
  shippoOrder = {},
  orders = [],
  contextLoaded = true,
) {
  if (!expense || !contextLoaded) return null;
  return { target: expense, enriched: enrichShippoExpense(expense, transaction, shipment, shippoOrder, orders) };
}

export function applyShippoExpenseEnrichments(staged = []) {
  staged.forEach(entry => {
    if (!entry?.target || !entry?.enriched) return;
    [
      'shippingOrderNumber',
      'shippingSuggestedOrderNumber',
      'shippingCandidateOrderNumbers',
      'shippingMatchMethod',
      'shippingMatchTier',
      'shippingMatchStatus',
    ].forEach(key => delete entry.target[key]);
    Object.assign(entry.target, entry.enriched);
  });
}

const SHIPPING_LINK_KEYS = [
  'shippingOrderNumber',
  'shippingSuggestedOrderNumber',
  'shippingCandidateOrderNumbers',
  'shippingMatchMethod',
  'shippingMatchTier',
  'shippingMatchStatus',
];

/**
 * Write a link and persist it, rolling every field back if the save fails.
 *
 * `method` defaults to 'manual' because that is what every existing caller
 * means. The automatic path passes 'recipient-auto' instead, so a link the app
 * made on its own stays distinguishable from one a person made — worth knowing
 * later when a payout looks wrong and the question is who decided this.
 */
/**
 * Point one postage expense at one order, in memory.
 *
 * Split out so the two callers cannot drift: the worklist's Link button saves
 * each link on its own and needs the rollback below, while the importer applies
 * a batch of them and is followed by a single saveTaxCenter() covering
 * everything it wrote. Same five fields either way — a link that set them
 * slightly differently depending on who made it would be a bug nobody found
 * until the shipping P&L disagreed with the worklist.
 */
export function writeShippingLink(expense, orderNumber, method = 'manual') {
  expense.shippingOrderNumber = normalizeShippingOrderNumber(orderNumber);
  expense.shippingMatchMethod = method;
  expense.shippingMatchStatus = 'matched';
  delete expense.shippingSuggestedOrderNumber;
  delete expense.shippingCandidateOrderNumbers;
  return expense;
}

export async function persistManualShippingLink(expense, orderNumber, persist, { method = 'manual' } = {}) {
  const prior = new Map(SHIPPING_LINK_KEYS.map(key => [
    key,
    { present: Object.prototype.hasOwnProperty.call(expense, key), value: expense[key] },
  ]));
  writeShippingLink(expense, orderNumber, method);
  try {
    return await persist();
  } catch (error) {
    SHIPPING_LINK_KEYS.forEach(key => {
      const snapshot = prior.get(key);
      if (snapshot.present) expense[key] = snapshot.value;
      else delete expense[key];
    });
    throw error;
  }
}

/**
 * The postage that can be linked to its order without asking.
 *
 * Deliberately a batch function rather than a per-expense one, because the
 * safety rule that matters cannot be seen from inside a single expense: if two
 * labels both point at the same order, one of them is wrong, and there is no
 * way to tell which. Whichever way you guess, a real parcel ends up costed
 * against a sale it was not for. So neither is linked and both go to the
 * publisher — the same rule autoMatchPostage() enforces in postage-matching.js
 * for counter receipts, arrived at there for the same reason.
 *
 * The other guard is the tier. Only an exact recipient email, or an exact name
 * AND postal code together, are acted on. A fuzzy surname within a fortnight is
 * a good prompt for a human and a bad basis for moving money on its own; it
 * stays a suggestion.
 *
 * Returns the intended links rather than performing them, so the caller decides
 * how to persist and this stays testable without a ledger.
 */
export function autoLinkConfidentShippingMatches(expenses = [], orders = []) {
  const known = new Set(
    (Array.isArray(orders) ? orders : [])
      .map(order => normalizeShippingOrderNumber(order?.num))
      .filter(Boolean),
  );

  const proposals = [];
  (Array.isArray(expenses) ? expenses : []).forEach(expense => {
    if (!expense || expense.shippingMatchStatus !== 'suggested') return;
    if (!CONFIDENT_TIERS.has(expense.shippingMatchTier)) return;
    const orderNumber = normalizeShippingOrderNumber(expense.shippingSuggestedOrderNumber);
    // An order that is no longer in the ledger — deleted, voided, renumbered —
    // is not something to link to just because a stale suggestion names it.
    if (!orderNumber || !known.has(orderNumber)) return;
    proposals.push({ expense, orderNumber, tier: expense.shippingMatchTier });
  });

  const wanted = new Map();
  proposals.forEach(({ orderNumber }) => {
    wanted.set(orderNumber, (wanted.get(orderNumber) || 0) + 1);
  });

  return proposals.filter(({ orderNumber }) => wanted.get(orderNumber) === 1);
}

export function linkedShippingSummary(order = {}, expenses = [], orderRateToBase = 1) {
  const orderNumber = normalizeShippingOrderNumber(order.num || order.orderNum);

  let linkedCount = 0;
  let hasMissingFx = false;
  let postageBaseAccumulator = 0;

  if (orderNumber) {
    for (const expense of expenses) {
      if (expense.shippingMatchStatus === 'matched' && normalizeShippingOrderNumber(expense.shippingOrderNumber) === orderNumber) {
        linkedCount++;
        if (expense.baseAmount == null || expense.fxMissing) {
          hasMissingFx = true;
        } else if (!hasMissingFx) {
          postageBaseAccumulator = roundCents(postageBaseAccumulator + roundCents(Number(expense.baseAmount) || 0));
        }
      }
    }
  }

  const customerPaid = roundCents(Number(order.shippingPaid) || 0);
  const rate = Number(orderRateToBase);
  const customerBase = Number.isFinite(rate) && rate > 0 ? roundCents(customerPaid * rate) : null;

  if (linkedCount === 0) return { customerPaid, customerBase, postageBase: null, marginBase: null, linkedCount: 0 };
  if (hasMissingFx) {
    return { customerPaid, customerBase, postageBase: null, marginBase: null, linkedCount };
  }

  const postageBase = postageBaseAccumulator;
  return {
    customerPaid,
    customerBase,
    postageBase,
    marginBase: customerBase == null ? null : roundCents(customerBase - postageBase),
    linkedCount,
  };
}
