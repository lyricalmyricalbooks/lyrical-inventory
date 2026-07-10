import { roundCents } from './money.js';

const ORDER_PATTERN = /#?([A-Z0-9]+-[A-Z0-9-]+)/i;
const normalizeText = (value) => String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
const normalizePostal = (value) => String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

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

function withinShippingWindow(orderDate, expenseDate) {
  const orderMs = Date.parse(`${orderDate || ''}T00:00:00Z`);
  const expenseMs = Date.parse(`${expenseDate || ''}T00:00:00Z`);
  if (!Number.isFinite(orderMs) || !Number.isFinite(expenseMs)) return false;
  const days = Math.floor((expenseMs - orderMs) / 86400000);
  return days >= 0 && days <= 7;
}

export function reconcileShippingExpense(expense = {}, orders = []) {
  const exact = normalizeShippingOrderNumber(expense.sourceOrderNumber || expense.shippingOrderNumber);
  const exactOrder = exact && orders.find(order => normalizeShippingOrderNumber(order.num) === exact);
  if (exactOrder) {
    return { shippingOrderNumber: exact, shippingMatchMethod: expense.sourceOrderMethod || 'metadata', shippingMatchStatus: 'matched' };
  }

  const eligible = orders.filter(order => withinShippingWindow(order.date, expense.date));
  const email = normalizeText(expense.recipientEmail);
  let candidates = email ? eligible.filter(order => normalizeText(order.shipEmail || order.email) === email) : [];
  if (!candidates.length) {
    const name = normalizeText(expense.recipientName);
    const postal = normalizePostal(expense.recipientPostal);
    if (name && postal) {
      candidates = eligible.filter(order =>
        normalizeText(order.shipName || order.customer) === name && normalizePostal(order.shipPostal) === postal
      );
    }
  }

  const nums = candidates.map(order => normalizeShippingOrderNumber(order.num)).filter(Boolean);
  if (nums.length === 1) {
    return { shippingSuggestedOrderNumber: nums[0], shippingMatchMethod: 'recipient', shippingMatchStatus: 'suggested' };
  }
  if (nums.length > 1) {
    return { shippingCandidateOrderNumbers: nums, shippingMatchMethod: 'recipient', shippingMatchStatus: 'ambiguous' };
  }
  return { shippingMatchMethod: '', shippingMatchStatus: 'unmatched' };
}

export function enrichShippoExpense(expense, transaction = {}, shipment = {}, shippoOrder = {}, orders = []) {
  const {
    shippingOrderNumber: _shippingOrderNumber,
    shippingSuggestedOrderNumber: _shippingSuggestedOrderNumber,
    shippingCandidateOrderNumbers: _shippingCandidateOrderNumbers,
    shippingMatchMethod: _shippingMatchMethod,
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
  return {
    ...accountingFields,
    shippoTransactionId: String(transaction.object_id || '').trim(),
    shippoShipmentId: String(shipment.object_id || (typeof transaction.shipment === 'string' ? transaction.shipment : '') || '').trim(),
    shippoOrderId: String(shippoOrder.object_id || (typeof transaction.order === 'string' ? transaction.order : '') || '').trim(),
    recipientEmail: source.recipientEmail,
    recipientName: source.recipientName,
    recipientPostal: source.recipientPostal,
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
    if (entry?.target && entry?.enriched) Object.assign(entry.target, entry.enriched);
  });
}

export function linkedShippingSummary(order = {}, expenses = [], orderRateToBase = 1) {
  const orderNumber = normalizeShippingOrderNumber(order.num || order.orderNum);
  const linked = orderNumber ? expenses.filter(expense =>
    expense.shippingMatchStatus === 'matched' && normalizeShippingOrderNumber(expense.shippingOrderNumber) === orderNumber
  ) : [];
  const customerPaid = roundCents(Number(order.shippingPaid) || 0);
  const rate = Number(orderRateToBase);
  const customerBase = Number.isFinite(rate) && rate > 0 ? roundCents(customerPaid * rate) : null;
  if (!linked.length) return { customerPaid, customerBase, postageBase: null, marginBase: null, linkedCount: 0 };
  if (linked.some(expense => expense.baseAmount == null || expense.fxMissing)) {
    return { customerPaid, customerBase, postageBase: null, marginBase: null, linkedCount: linked.length };
  }
  const postageBase = linked.reduce(
    (sum, expense) => roundCents(sum + roundCents(Number(expense.baseAmount) || 0)),
    0,
  );
  return {
    customerPaid,
    customerBase,
    postageBase,
    marginBase: customerBase == null ? null : roundCents(customerBase - postageBase),
    linkedCount: linked.length,
  };
}
