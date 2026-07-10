# Order Shipping Reconciliation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Account for customer-paid shipping as income, retain Shippo labels as canonical expenses, reconcile each postage purchase to its Big Cartel order, and show the resulting shipping margin.

**Architecture:** Put all normalization, conservative matching, and cent-rounded summary math in a new DOM-free library. Keep `shippingPaid` on order history and keep each Shippo purchase in `TAX_CENTER.businessExpenses`; link them with metadata rather than duplicating amounts. `src/main.js` orchestrates Shippo enrichment, persistence, and rendering, while the Tax Center and cash-flow helpers consume the same canonical records.

**Tech Stack:** Vanilla JavaScript ES modules, Vitest, Firebase/Firestore offline settings persistence, Shippo REST API, HTML/CSS.

## Global Constraints

- Customer-paid shipping is income but is not artist royalty-bearing merchandise revenue.
- Shippo postage remains one operating-expense row keyed by `shippo:<transaction-id>`.
- Fuzzy recipient matches are suggestions only; only exact references or explicit user confirmation become `matched`.
- Money totals use `roundCents`; no new raw floating-point accumulator is allowed.
- Manual reconciliation must save through the existing offline-first `saveTaxCenter()` path.
- Publisher-only controls must stay behind the existing Tax Center publisher guard.
- No new framework, server, or client-side secret storage mechanism.
- Any future Apps Script edit must also be copied verbatim to `public/gas-code.txt`; this plan does not require an Apps Script edit.

## File Structure

- Create `src/lib/shipping-reconciliation.js`: pure order-number normalization, matching, enrichment, and margin helpers.
- Create `tests/shipping-reconciliation.test.js`: direct behavioral coverage for the pure helpers.
- Modify `src/lib/cashflow.js` and `tests/cashflow.test.js`: include non-voided customer-paid shipping once in gross income.
- Modify `src/main.js`: fetch Shippo context, enrich/import expenses idempotently, render shipping summaries, and persist manual links.
- Modify `index.html`: add the publisher reconciliation worklist container.
- Modify `src/style.css`: responsive, accessible badges and reconciliation rows.
- Modify `tests/main-verification.test.js` and `tests/html.test.js`: verify integration wiring and required UI landmarks.

---

### Task 1: Pure shipping reconciliation domain helpers

**Files:**
- Create: `src/lib/shipping-reconciliation.js`
- Create: `tests/shipping-reconciliation.test.js`

**Interfaces:**
- Consumes: `roundCents(number): number` from `src/lib/money.js`.
- Produces: `normalizeShippingOrderNumber(value): string`, `extractShippingOrderNumber(...values): string`, `reconcileShippingExpense(expense, orders): object`, `enrichShippoExpense(expense, transaction, shipment, shippoOrder, orders): object`, and `linkedShippingSummary(order, expenses, orderRateToBase?): object`.

- [ ] **Step 1: Write the failing helper tests**

Create `tests/shipping-reconciliation.test.js`:

```js
import { describe, expect, it } from 'vitest';
import {
  normalizeShippingOrderNumber,
  extractShippingOrderNumber,
  reconcileShippingExpense,
  enrichShippoExpense,
  linkedShippingSummary,
} from '../src/lib/shipping-reconciliation.js';

const orders = [
  { num: '#GPWT-916083', date: '2026-07-10', shipEmail: 'dave@example.com', shipName: 'Dave Hebb', shipPostal: '12409' },
  { num: '#KEVI-640529', date: '2026-07-10', shipEmail: 'zuzu@example.com', shipName: 'Zuzu Hill', shipPostal: '60616' },
];

describe('shipping reconciliation', () => {
  it('normalizes and extracts Big Cartel order numbers', () => {
    expect(normalizeShippingOrderNumber(' gpwt-916083 ')).toBe('#GPWT-916083');
    expect(extractShippingOrderNumber('customer_ID:12, order_number:#kevi-640529')).toBe('#KEVI-640529');
    expect(extractShippingOrderNumber('no order here')).toBe('');
  });

  it('accepts an exact metadata match', () => {
    expect(reconcileShippingExpense({ sourceOrderNumber: '#gpwt-916083', date: '2026-07-11' }, orders)).toMatchObject({
      shippingOrderNumber: '#GPWT-916083',
      shippingMatchMethod: 'metadata',
      shippingMatchStatus: 'matched',
    });
  });

  it('distinguishes an exact Shippo Order association', () => {
    expect(reconcileShippingExpense({ sourceOrderNumber: '#KEVI-640529', sourceOrderMethod: 'shippo-order', date: '2026-07-11' }, orders)).toMatchObject({
      shippingOrderNumber: '#KEVI-640529',
      shippingMatchMethod: 'shippo-order',
      shippingMatchStatus: 'matched',
    });
  });

  it('suggests one recipient match but does not finalize it', () => {
    expect(reconcileShippingExpense({ recipientEmail: 'DAVE@example.com', date: '2026-07-12' }, orders)).toMatchObject({
      shippingSuggestedOrderNumber: '#GPWT-916083',
      shippingMatchMethod: 'recipient',
      shippingMatchStatus: 'suggested',
    });
  });

  it('marks multiple recipient candidates ambiguous', () => {
    const duplicated = [...orders, { ...orders[0], num: '#OTHER-100000' }];
    expect(reconcileShippingExpense({ recipientEmail: 'dave@example.com', date: '2026-07-12' }, duplicated)).toMatchObject({
      shippingMatchStatus: 'ambiguous',
      shippingCandidateOrderNumbers: ['#GPWT-916083', '#OTHER-100000'],
    });
  });

  it('does not suggest a recipient outside the seven-day window', () => {
    expect(reconcileShippingExpense({ recipientEmail: 'dave@example.com', date: '2026-07-25' }, orders).shippingMatchStatus).toBe('unmatched');
  });

  it('enriches a Shippo expense without replacing its accounting fields', () => {
    const result = enrichShippoExpense(
      { ref: 'shippo:tx1', amount: 9.35, baseAmount: 9.35 },
      { object_id: 'tx1', metadata: 'order_number:#GPWT-916083', shipment: 'shp1' },
      { object_id: 'shp1', address_to: { email: 'dave@example.com', name: 'Dave Hebb', zip: '12409' } },
      {},
      orders,
    );
    expect(result).toMatchObject({
      ref: 'shippo:tx1', amount: 9.35, baseAmount: 9.35,
      shippoTransactionId: 'tx1', shippoShipmentId: 'shp1',
      shippingOrderNumber: '#GPWT-916083', shippingMatchStatus: 'matched',
    });
  });

  it('sums multiple linked labels and rounds the base-currency margin', () => {
    const result = linkedShippingSummary(
      { num: '#GPWT-916083', shippingPaid: 12 },
      [
        { shippingOrderNumber: '#GPWT-916083', shippingMatchStatus: 'matched', baseAmount: 5.675 },
        { shippingOrderNumber: '#GPWT-916083', shippingMatchStatus: 'matched', baseAmount: 3.675 },
        { shippingOrderNumber: '#KEVI-640529', shippingMatchStatus: 'matched', baseAmount: 99 },
      ],
      1,
    );
    expect(result).toEqual({ customerPaid: 12, customerBase: 12, postageBase: 9.36, marginBase: 2.64, linkedCount: 2 });
  });

  it('returns null postage and margin when no label is linked', () => {
    expect(linkedShippingSummary({ num: '#GPWT-916083', shippingPaid: 12 }, [], 1)).toEqual({
      customerPaid: 12, customerBase: 12, postageBase: null, marginBase: null, linkedCount: 0,
    });
  });

  it('does not invent a base-currency margin when the order FX rate is unavailable', () => {
    expect(linkedShippingSummary(
      { num: '#GPWT-916083', shippingPaid: 12 },
      [{ shippingOrderNumber: '#GPWT-916083', shippingMatchStatus: 'matched', baseAmount: 9 }],
      0,
    )).toEqual({ customerPaid: 12, customerBase: null, postageBase: 9, marginBase: null, linkedCount: 1 });
  });

  it('keeps a linked label visible when its base conversion is unavailable', () => {
    expect(linkedShippingSummary(
      { num: '#GPWT-916083', shippingPaid: 12 },
      [{ shippingOrderNumber: '#GPWT-916083', shippingMatchStatus: 'matched', baseAmount: null, fxMissing: true }],
      1,
    )).toEqual({ customerPaid: 12, customerBase: 12, postageBase: null, marginBase: null, linkedCount: 1 });
  });
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `npm test -- tests/shipping-reconciliation.test.js`

Expected: FAIL because `src/lib/shipping-reconciliation.js` does not exist.

- [ ] **Step 3: Implement the pure helpers**

Create `src/lib/shipping-reconciliation.js`:

```js
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
    ...expense,
    shippoTransactionId: String(transaction.object_id || '').trim(),
    shippoShipmentId: String(shipment.object_id || (typeof transaction.shipment === 'string' ? transaction.shipment : '') || '').trim(),
    shippoOrderId: String(shippoOrder.object_id || (typeof transaction.order === 'string' ? transaction.order : '') || '').trim(),
    recipientEmail: source.recipientEmail,
    recipientName: source.recipientName,
    recipientPostal: source.recipientPostal,
    ...reconcileShippingExpense(source, orders),
  };
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
  const postageBase = roundCents(linked.reduce((sum, expense) => sum + (Number(expense.baseAmount) || 0), 0));
  return {
    customerPaid,
    customerBase,
    postageBase,
    marginBase: customerBase == null ? null : roundCents(customerBase - postageBase),
    linkedCount: linked.length,
  };
}
```

- [ ] **Step 4: Run the focused test and verify GREEN**

Run: `npm test -- tests/shipping-reconciliation.test.js`

Expected: PASS with 11 tests.

- [ ] **Step 5: Commit the helper boundary**

```bash
git add src/lib/shipping-reconciliation.js tests/shipping-reconciliation.test.js
git commit -m "feat: add shipping reconciliation helpers"
```

### Task 2: Include customer-paid shipping in gross-income accounting

**Files:**
- Modify: `src/lib/cashflow.js:8-55`
- Modify: `tests/cashflow.test.js:15-93`
- Modify: `src/main.js:14795-14845`

**Interfaces:**
- Consumes: existing order history field `shippingPaid: number` and `roundCents(number): number`.
- Produces: `computeCashFlowMetrics(...).grossSales` including merchandise plus non-voided customer-paid shipping; Tax Center ledger rows with `sourceType: 'shippingIncome'`.

- [ ] **Step 1: Extend the cash-flow fixtures and assertions**

In `tests/cashflow.test.js`, change `s1` and `s3` to:

```js
{ id: 's1', date: '2025-03-01', price: 20, qty: 2, shippingPaid: 12 },
{ id: 's3', date: '2025-06-01', price: 15, qty: 1, shippingPaid: 4, voided: true },
```

Then update the 2025 and all-time gross assertions:

```js
// 2025: merchandise 170 + non-voided customer shipping 12
expect(m.grossSales).toBeCloseTo(182, 5);
```

```js
// all time: merchandise 180 + non-voided customer shipping 12
expect(m.grossSales).toBeCloseTo(192, 5);
```

Add this focused regression test inside `describe('computeCashFlowMetrics')`:

```js
it('counts customer-paid shipping once and excludes it when the order is voided', () => {
  const custom = {
    books: { b1: books.b1 },
    states: {
      b1: {
        hist: [
          { date: '2025-01-01', price: 65, qty: 1, shippingPaid: 12 },
          { date: '2025-01-02', price: 65, qty: 1, shippingPaid: 20, voided: true },
        ],
      },
    },
    taxCenter: {},
    fxRateCache,
  };
  expect(computeCashFlowMetrics(custom, '2025').grossSales).toBe(77);
});

it('does not assume CAD parity for an expense whose FX conversion failed', () => {
  const custom = {
    books: {},
    states: {},
    taxCenter: {
      businessExpenses: [{ date: '2025-01-01', amount: 10, currency: 'USD', baseAmount: null, fxMissing: true }],
    },
    fxRateCache: {},
  };
  expect(computeCashFlowMetrics(custom, '2025').operatingExpenses).toBe(0);
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `npm test -- tests/cashflow.test.js`

Expected: FAIL because gross sales remains 170 instead of 182 and 65 instead of 77.

- [ ] **Step 3: Add cent-rounded shipping income to the pure cash-flow helper**

At the top of `src/lib/cashflow.js`, change the money import to:

```js
import { getBookCurrencyCode, roundCents } from './money.js';
```

Replace the sale accumulator inside `computeCashFlowMetrics` with:

```js
const qty = h.qty || 1;
const unitPrice = h.price ?? h.unitPrice ?? 0;
const merchandise = h.voided ? 0 : unitPrice * qty;
const customerShipping = h.voided ? 0 : (Number(h.shippingPaid) || 0);
grossSales = roundCents(grossSales + ((merchandise + customerShipping) * hRate));
txnCount += 1;
if (!h.voided) unitsSold += qty;
```

In the general business-expense accumulator, replace `eBase` with:

```js
const eBase = e.baseAmount != null
  ? e.baseAmount
  : e.fxMissing
    ? 0
    : (e.amount || 0) * (fxRateCache[`${eCur}_CAD`] || 1);
```

- [ ] **Step 4: Run the focused test and verify GREEN**

Run: `npm test -- tests/cashflow.test.js`

Expected: PASS.

- [ ] **Step 5: Make the Tax Center ledger auditable**

In the existing `renderTaxCenter()` history loop in `src/main.js`, keep the merchandise `Sale` row unchanged and add customer shipping after it:

```js
const shippingIncome = h.voided ? 0 : (Number(h.shippingPaid) || 0);
if (shippingIncome > 0) {
  const shippingBase = roundCents(shippingIncome * hRate);
  totalGrossSales = roundCents(totalGrossSales + shippingBase);
  allLedger.push({
    date: h.date,
    type: 'Shipping income',
    desc: `Customer shipping paid (${b.title})`,
    cat: 'Income',
    ref: h.num,
    origCurrency: cur,
    origAmount: shippingIncome,
    baseAmount: shippingBase,
    qty: 0,
    voided: false,
    hasRateError: !hRate,
    isIncome: true,
    sourceType: 'shippingIncome',
    sourceId: bid,
    itemId: `${h.id || h.num}-shipping-income`,
  });
}
```

Import `roundCents` from `./lib/money.js` in the existing money import list at the top of `src/main.js`.

In the `TAX_CENTER.businessExpenses` mapping in the same function, replace its base-amount fallback with:

```js
const eBase = e.baseAmount != null
  ? e.baseAmount
  : e.fxMissing
    ? 0
    : (e.amount || 0) * (_fxRateCache[`${eCur}_CAD`] || 1);
```

Set `hasRateError: !!e.fxMissing` on that ledger row so the original amount remains visible while the base total does not invent parity.

- [ ] **Step 6: Add a static integration assertion**

In `tests/main-verification.test.js`, move the source read to describe scope so every verification can reuse it:

```js
describe('main.js window binding verification', () => {
  const mainJsPath = path.resolve(__dirname, '../src/main.js');
  const mainContent = fs.readFileSync(mainJsPath, 'utf8');
```

Remove the now-duplicate `const mainContent = ...` inside the first test, then add:

```js
it('adds customer-paid shipping to the Tax Center income ledger', () => {
  expect(mainContent).toContain("type: 'Shipping income'");
  expect(mainContent).toContain("sourceType: 'shippingIncome'");
  expect(mainContent).toContain('Number(h.shippingPaid)');
});
```

- [ ] **Step 7: Run accounting and integration tests**

Run: `npm test -- tests/cashflow.test.js tests/main-verification.test.js`

Expected: PASS.

- [ ] **Step 8: Commit the accounting correction**

```bash
git add src/lib/cashflow.js tests/cashflow.test.js src/main.js tests/main-verification.test.js
git commit -m "fix: account for customer-paid shipping income"
```

### Task 3: Enrich Shippo expenses and reconcile them idempotently

**Files:**
- Modify: `src/main.js:1-28`
- Modify: `src/main.js:15980-16235`
- Modify: `tests/main-verification.test.js`

**Interfaces:**
- Consumes: `enrichShippoExpense(expense, transaction, shipment, shippoOrder, orders)` from Task 1 and existing `TAX_CENTER.businessExpenses` rows.
- Produces: one enriched expense per Shippo transaction, plus `fetchShippoObject(token, resource, id): Promise<object>`, `fetchShippoContext(token, tx): Promise<{shipment, shippoOrder}>`, and `getShippingReconciliationOrders(): object[]`.

- [ ] **Step 1: Write static importer expectations**

Add to `tests/main-verification.test.js`:

```js
it('enriches existing Shippo expenses instead of duplicating them', () => {
  expect(mainContent).toContain("const existingExpense = existingExpensesByRef.get(ref)");
  expect(mainContent).toContain('Object.assign(existingExpense, enriched)');
  expect(mainContent).toContain('fetchShippoContext(token, tx)');
  expect(mainContent).toContain('enrichShippoExpense(');
});
```

- [ ] **Step 2: Run the integration test and verify RED**

Run: `npm test -- tests/main-verification.test.js`

Expected: FAIL because the enrichment map and functions are not present.

- [ ] **Step 3: Import the domain helpers**

Add this import near the other library imports in `src/main.js`:

```js
import {
  enrichShippoExpense,
  linkedShippingSummary,
  normalizeShippingOrderNumber,
} from './lib/shipping-reconciliation.js';
```

- [ ] **Step 4: Add Shippo context retrieval and local order collection**

Insert after `fetchShippoTransactionsPageAPI`:

```js
async function fetchShippoObject(token, resource, id) {
  if (!id) return {};
  const resp = await fetch(`https://api.goshippo.com/${resource}/${encodeURIComponent(id)}`, {
    headers: { Authorization: `ShippoToken ${token}`, 'Content-Type': 'application/json' },
  });
  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    throw new Error(`Shippo ${resource} lookup ${resp.status}${text ? `: ${text.slice(0, 140)}` : ''}`);
  }
  return resp.json();
}

async function fetchShippoContext(token, tx) {
  let shipment = tx.shipment && typeof tx.shipment === 'object' ? tx.shipment : {};
  const shipmentId = typeof tx.shipment === 'string' ? tx.shipment : shipment.object_id;
  if (shipmentId && !shipment.address_to) shipment = await fetchShippoObject(token, 'shipments', shipmentId);

  let shippoOrder = tx.order && typeof tx.order === 'object' ? tx.order : {};
  const orderId = typeof tx.order === 'string' ? tx.order : (shippoOrder.object_id || shipment.order);
  if (orderId && !shippoOrder.order_number) shippoOrder = await fetchShippoObject(token, 'orders', orderId);
  return { shipment, shippoOrder };
}

function getShippingReconciliationOrders() {
  const byNumber = new Map();
  Object.values(states).forEach(state => {
    (state?.hist || []).forEach(history => {
      const number = normalizeShippingOrderNumber(history.num);
      if (number && history.chan === 'Website' && !history.voided) byNumber.set(number, history);
    });
  });
  (orders || []).forEach(order => {
    const number = normalizeShippingOrderNumber(order.orderNum || order.num);
    if (number && !byNumber.has(number)) byNumber.set(number, { ...order, num: number });
  });
  return Array.from(byNumber.values());
}
```

- [ ] **Step 5: Enrich each newly created expense**

Replace `processShippoTxToExpense` with:

```js
async function processShippoTxToExpense(tx, token, txId, ref, importedCount, context, knownOrders) {
  const { amount, currency } = await getShippoTxCost(tx, token);
  if (!Number.isFinite(amount) || amount <= 0) return null;

  const dateRaw = tx.object_created || tx.object_updated || '';
  const date = /^\d{4}-\d{2}-\d{2}/.test(dateRaw) ? dateRaw.slice(0, 10) : today();

  let fxRate = currency === 'CAD' ? 1 : 0;
  if (currency !== 'CAD') {
    try { const historical = await fetchHistoricalRate(currency, 'CAD', date); fxRate = historical?.rate || 0; } catch (_) { /* continue */ }
    if (!fxRate) {
      try { const live = await fetchLiveRate(currency, 'CAD'); fxRate = live?.rate || 0; } catch (_) { /* continue */ }
    }
    if (!fxRate) fxRate = _fxRateCache[`${currency}_CAD`] || 0;
  }
  const fxMissing = !fxRate;

  const labelUrl = tx.label_url || '';
  const localReceipt = labelUrl ? await saveShippoLabelLocally(labelUrl, txId) : null;
  const expense = {
    id: Date.now() + importedCount + 1,
    desc: `Shippo shipping label${tx.tracking_number ? ` #${tx.tracking_number}` : ''}`,
    cat: 'Shipping & Postage',
    currency,
    amount,
    origCurrency: currency,
    origAmount: amount,
    fxRate: fxMissing ? null : fxRate,
    baseAmount: fxMissing ? null : roundCents(amount * fxRate),
    fxMissing,
    date,
    ref,
    receipt: localReceipt || labelUrl,
    trackingUrl: tx.tracking_url_provider || '',
    trip: '',
  };
  return enrichShippoExpense(expense, tx, context.shipment, context.shippoOrder, knownOrders);
}
```

- [ ] **Step 6: Replace skip-only deduplication with enrich-or-insert behavior**

At the beginning of `importShippoShippingFromApi`, replace `existingRefs`/`importedIds` construction with:

```js
const existingExpensesByRef = new Map((TAX_CENTER.businessExpenses || [])
  .filter(expense => String(expense?.ref || '').startsWith('shippo:'))
  .map(expense => [String(expense.ref), expense]));
const importedIds = new Set(Array.from(existingExpensesByRef.keys())
  .map(ref => ref.replace(/^shippo:/, ''))
  .filter(Boolean));
const fetchedIds = new Set();
const pendingExpenses = [];
const knownOrders = getShippingReconciliationOrders();
let enrichedCount = 0;
let contextFailureCount = 0;
```

Replace the body of the per-transaction loop, after status and `txId` validation, with:

```js
const ref = `shippo:${txId}`;
if (fetchedIds.has(txId)) { alreadyImported++; continue; }
fetchedIds.add(txId);

const existingExpense = existingExpensesByRef.get(ref);
const needsEnrichment = !existingExpense || existingExpense.shippingMatchStatus !== 'matched';
if (existingExpense && !needsEnrichment) {
  alreadyImported++;
  continue;
}

let context = { shipment: {}, shippoOrder: {} };
try {
  context = await fetchShippoContext(token, tx);
} catch (error) {
  console.warn(`Shippo context lookup failed for ${txId}`, error);
  contextFailureCount++;
}

if (existingExpense) {
  const enriched = enrichShippoExpense(existingExpense, tx, context.shipment, context.shippoOrder, knownOrders);
  Object.assign(existingExpense, enriched);
  enrichedCount++;
  alreadyImported++;
  continue;
}

const expense = await processShippoTxToExpense(
  tx, token, txId, ref, imported, context, knownOrders,
);
if (!expense) {
  skipped++;
  continue;
}
pendingExpenses.push(expense);
existingExpensesByRef.set(ref, expense);
importedIds.add(txId);
imported++;
if (expense.currency === 'USD') totalUsd += expense.amount;
```

Remove the old `validTx`/`Promise.all` block because context enrichment requires bounded, per-transaction error handling and the existing 100-row page is already paginated. Keep the confirmation dialog for `pendingExpenses`; enrichment of pre-existing expenses does not alter amounts and therefore does not require a second expense confirmation.

- [ ] **Step 7: Report enrichment and persist once**

After the confirmation branch, persist the new/enriched expenses once with:

```js
if (pendingExpenses.length > 0) TAX_CENTER.businessExpenses.unshift(...pendingExpenses.reverse());
TAX_CENTER.settings.shippoImportedObjectIds = Array.from(importedIds).slice(-10000);
TAX_CENTER.settings.shippoLastImportAt = new Date().toISOString();
await saveTaxCenter();
renderTaxCenter();
```

Then define these status suffixes:

```js
const enrichNote = enrichedCount ? ` ${enrichedCount} existing expense${enrichedCount === 1 ? '' : 's'} reconciled.` : '';
const contextNote = contextFailureCount ? ` ${contextFailureCount} label${contextFailureCount === 1 ? '' : 's'} still need review because Shippo details could not load.` : '';
```

Use the suffix in the existing status and toast assignments:

```js
const reconciliationNote = `${enrichNote}${contextNote}`;
if (statusEl) statusEl.textContent = imported
  ? `Imported ${imported} new Shippo transactions.${dupNote}${skipped ? ` ${skipped} skipped.` : ''}${totalUsd ? ` USD imported: ${totalUsd.toFixed(2)}.` : ''}${reconciliationNote}`
  : `No new Shippo transactions to import.${dupNote}${skipped ? ` ${skipped} skipped.` : ''}${reconciliationNote}`;
showToast(
  (imported
    ? `Imported ${imported} new Shippo expense${imported === 1 ? '' : 's'}`
    : (alreadyImported ? `No new Shippo expenses (${alreadyImported} already imported)` : 'No new Shippo expenses to import')) + reconciliationNote,
  imported || enrichedCount ? 'ok' : 'warn',
);
```

This preserves one persistence write per import run while giving non-blocking feedback for labels saved without order context.

- [ ] **Step 8: Run helper and importer verification tests**

Run: `npm test -- tests/shipping-reconciliation.test.js tests/main-verification.test.js`

Expected: PASS.

- [ ] **Step 9: Commit the idempotent Shippo enrichment**

```bash
git add src/main.js tests/main-verification.test.js
git commit -m "feat: reconcile Shippo expenses to orders"
```

### Task 4: Display shipping economics and add the reconciliation worklist

**Files:**
- Modify: `index.html:1604-1618`
- Modify: `src/main.js:5411-5615`
- Modify: `src/main.js:14765-15150`
- Modify: `src/style.css:1460-1475`
- Modify: `tests/html.test.js`
- Modify: `tests/main-verification.test.js`

**Interfaces:**
- Consumes: `linkedShippingSummary(order, expenses, orderRateToBase)` and reconciliation metadata from Tasks 1 and 3.
- Produces: `renderOrderShippingSummary(order, currency): string`, `renderShippingReconciliationWorklist(): void`, and `linkShippingExpense(ref): Promise<void>`.

- [ ] **Step 1: Add failing UI landmark and wiring tests**

In `tests/html.test.js`, add `import fs from 'fs';` beside the Vitest import and define this once before the describe block:

```js
const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
```

Then add inside the existing describe block:

```js
it('contains the Shippo order reconciliation worklist', () => {
  expect(html).toContain('id="shipping-reconciliation-list"');
  expect(html).toContain('Shipping reconciliation');
});
```

In `tests/main-verification.test.js`, add:

```js
it('renders and persists manual shipping links', () => {
  expect(mainContent).toContain('function renderOrderShippingSummary');
  expect(mainContent).toContain('function renderShippingReconciliationWorklist');
  expect(mainContent).toContain('async function linkShippingExpense');
  expect(mainContent).toContain("shippingMatchMethod = 'manual'");
});
```

- [ ] **Step 2: Run the UI tests and verify RED**

Run: `npm test -- tests/html.test.js tests/main-verification.test.js`

Expected: FAIL because the worklist and functions do not exist.

- [ ] **Step 3: Add the semantic worklist container**

Immediately after `#tc-shippo-status` in `index.html`, add:

```html
<section class="shipping-reconciliation" aria-labelledby="shipping-reconciliation-title">
  <div class="shipping-reconciliation-head">
    <div>
      <strong id="shipping-reconciliation-title">Shipping reconciliation</strong>
      <p>Link paid postage to its website order. Suggested matches always need your confirmation.</p>
    </div>
    <span class="pill gray" id="shipping-reconciliation-count">0 to review</span>
  </div>
  <div id="shipping-reconciliation-list" aria-live="polite"></div>
</section>
```

- [ ] **Step 4: Add shared shipping summary rendering**

Add before `renderHist()` in `src/main.js`:

```js
function shippingRateToBase(currency) {
  const code = normalizeCurrencyCode(currency, 'CAD');
  return code === 'CAD' ? 1 : (_fxRateCache[`${code}_CAD`] || 0);
}

function renderOrderShippingSummary(order, currency) {
  const expenses = (TAX_CENTER.businessExpenses || []).filter(expense => String(expense?.ref || '').startsWith('shippo:'));
  const summary = linkedShippingSummary(order, expenses, shippingRateToBase(currency));
  const customer = `<span class="shipping-money customer">Customer paid ${fmt(summary.customerPaid, currency)}</span>`;
  if (summary.postageBase == null) {
    if (summary.linkedCount > 0) {
      return `<span class="shipping-summary">${customer}<span class="shipping-money postage">Postage linked</span><span class="shipping-money unlinked">Margin unavailable · FX rate needed</span></span>`;
    }
    return `<span class="shipping-summary">${customer}<span class="shipping-money unlinked">Postage not linked</span></span>`;
  }
  if (summary.marginBase == null) {
    return `<span class="shipping-summary">${customer}<span class="shipping-money postage">Postage cost ${fmt(summary.postageBase, 'CAD')}</span><span class="shipping-money unlinked">Margin unavailable · FX rate needed</span></span>`;
  }
  const marginClass = summary.marginBase > 0 ? 'positive' : summary.marginBase < 0 ? 'negative' : 'neutral';
  const marginSign = summary.marginBase > 0 ? '+' : '';
  return `<span class="shipping-summary">${customer}<span class="shipping-money postage">Postage cost ${fmt(summary.postageBase, 'CAD')}</span><span class="shipping-money margin ${marginClass}">Shipping margin ${marginSign}${fmt(summary.marginBase, 'CAD')}</span></span>`;
}
```

In `renderOrders()`, replace `shippingBadge` with:

```js
const shippingBadge = renderOrderShippingSummary(o, listCur);
```

In `renderHist()`, replace the `paymentInfo`/`notesCell` block with:

```js
const paymentInfo = paymentSummary(h.payment, book);
const shippingInfo = isWebsite ? renderOrderShippingSummary(h, cur) : '';
const notesText = escapeHtml(h.notes) || '—';
const notesCell = [
  notesText,
  paymentInfo ? `<span style="font-size:11px;color:var(--text4);">${escapeHtml(paymentInfo)}</span>` : '',
  shippingInfo,
].filter(Boolean).join('<br>');
```

This keeps the reconciliation visible after the pending card disappears.

- [ ] **Step 5: Add the worklist renderer and manual-link handler**

Add near the Shippo import functions in `src/main.js`:

```js
function renderShippingReconciliationWorklist() {
  const list = $('shipping-reconciliation-list');
  const count = $('shipping-reconciliation-count');
  if (!list || !count || isAuthor()) return;
  const expenses = (TAX_CENTER.businessExpenses || []).filter(expense =>
    String(expense?.ref || '').startsWith('shippo:') && expense.shippingMatchStatus !== 'matched'
  );
  const knownOrders = getShippingReconciliationOrders();
  count.textContent = `${expenses.length} to review`;
  if (!expenses.length) {
    list.innerHTML = '<div class="shipping-reconciliation-empty">All imported postage is linked to an order.</div>';
    return;
  }

  list.innerHTML = expenses.map(expense => {
    const domId = String(expense.ref).replace(/[^A-Za-z0-9_-]/g, '-');
    const suggested = normalizeShippingOrderNumber(expense.shippingSuggestedOrderNumber);
    const options = knownOrders.map(order => {
      const number = normalizeShippingOrderNumber(order.num || order.orderNum);
      return `<option value="${escapeHtml(number)}"${number === suggested ? ' selected' : ''}>${escapeHtml(number)} · ${escapeHtml(order.shipName || order.customer || 'Customer')}</option>`;
    }).join('');
    const context = [expense.recipientName, expense.recipientPostal, expense.trackingUrl ? 'Tracking saved' : ''].filter(Boolean).join(' · ');
    return `<div class="shipping-reconciliation-row">
      <div class="shipping-reconciliation-copy">
        <strong>${fmt(expense.amount || 0, expense.currency || 'CAD')}</strong>
        <span>${escapeHtml(expense.date || 'Date unavailable')} · ${escapeHtml(context || 'Recipient unavailable')}</span>
        <small>${escapeHtml(expense.shippingMatchStatus || 'unmatched')}</small>
      </div>
      <label for="${domId}">Order<span class="sr-only"> for ${escapeHtml(expense.ref)}</span></label>
      <select id="${domId}"><option value="">Select an order</option>${options}</select>
      <button class="btn gold sm" type="button" data-ref="${escapeHtml(expense.ref)}" onclick="linkShippingExpense(this.dataset.ref)">Link postage</button>
    </div>`;
  }).join('');
}

async function linkShippingExpense(ref) {
  const expense = (TAX_CENTER.businessExpenses || []).find(item => String(item.ref) === String(ref));
  if (!expense) { showToast('Shipping expense was not found', 'err'); return; }
  const domId = String(expense.ref).replace(/[^A-Za-z0-9_-]/g, '-');
  const number = normalizeShippingOrderNumber($(domId)?.value);
  if (!number) { showToast('Choose an order before linking postage', 'warn'); return; }
  expense.shippingOrderNumber = number;
  expense.shippingMatchMethod = 'manual';
  expense.shippingMatchStatus = 'matched';
  delete expense.shippingSuggestedOrderNumber;
  delete expense.shippingCandidateOrderNumbers;
  await saveTaxCenter();
  renderShippingReconciliationWorklist();
  renderOrders();
  renderHist();
  renderTaxCenter();
  showToast(`Postage linked to ${number}`);
}
```

Call `renderShippingReconciliationWorklist()` once near the end of `renderTaxCenter()`. Add `linkShippingExpense` and `renderShippingReconciliationWorklist` to `exposeLegacyInlineHandlers()` so the inline button remains callable.

- [ ] **Step 6: Add responsive, accessible styles**

Add to `src/style.css` beside the order-card rules:

```css
.shipping-summary{display:inline-flex;align-items:center;gap:var(--space-2);flex-wrap:wrap;}
.shipping-money{display:inline-flex;align-items:center;min-height:28px;padding:.25rem .55rem;border:1px solid var(--border2);border-radius:999px;background:var(--cream);font-size:11px;font-weight:700;color:var(--text2);}
.shipping-money.postage{background:var(--cream2);}
.shipping-money.unlinked{border-style:dashed;color:var(--amber);}
.shipping-money.margin.positive{color:var(--green);background:var(--green-bg);border-color:rgba(42,99,72,.24);}
.shipping-money.margin.negative{color:var(--red);background:var(--red-bg);border-color:rgba(154,55,47,.24);}
.shipping-money.margin.neutral{color:var(--text3);}
.shipping-reconciliation{margin-top:var(--space-3);padding:var(--space-4);border:1px solid var(--border);border-radius:var(--r2);background:rgba(255,255,255,.04);}
.shipping-reconciliation-head{display:flex;align-items:flex-start;justify-content:space-between;gap:var(--space-3);margin-bottom:var(--space-3);}
.shipping-reconciliation-head p{margin:.25rem 0 0;font-size:11px;line-height:1.5;color:var(--text3);}
.shipping-reconciliation-row{display:grid;grid-template-columns:minmax(190px,1fr) auto minmax(220px,1fr) auto;align-items:center;gap:var(--space-3);padding:var(--space-3) 0;border-top:1px solid var(--border2);}
.shipping-reconciliation-copy{display:flex;flex-direction:column;gap:.2rem;min-width:0;}
.shipping-reconciliation-copy span,.shipping-reconciliation-copy small{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--text3);}
.shipping-reconciliation-row select{min-height:44px;}
.shipping-reconciliation-empty{padding:var(--space-3);border:1px dashed var(--border);border-radius:var(--r2);font-size:12px;color:var(--text3);text-align:center;}
@media(max-width:760px){.shipping-reconciliation-row{grid-template-columns:1fr;}.shipping-reconciliation-row .btn{min-height:44px;justify-content:center;}}
```

- [ ] **Step 7: Run the UI and helper tests**

Run: `npm test -- tests/html.test.js tests/main-verification.test.js tests/shipping-reconciliation.test.js`

Expected: PASS.

- [ ] **Step 8: Commit the reconciliation experience**

```bash
git add index.html src/main.js src/style.css tests/html.test.js tests/main-verification.test.js
git commit -m "feat: show per-order shipping reconciliation"
```

### Task 5: Tag future Shippo shipments and verify the complete feature

**Files:**
- Modify: `src/main.js:14795-15070`
- Modify: `src/main.js:22390-22545`
- Modify: `src/main.js:22835-22890`
- Modify: `tests/main-verification.test.js`

**Interfaces:**
- Consumes: normalized Big Cartel order number selected in `#ship-prefill-dest`.
- Produces: Shippo shipment `metadata: 'order_number:#ORDER-123'` and Tax Center expense references containing the linked order number.

- [ ] **Step 1: Add failing metadata and export-context assertions**

Add to `tests/main-verification.test.js`:

```js
it('tags Shippo shipments with the selected Big Cartel order', () => {
  expect(mainContent).toContain('orderNumber: h.num');
  expect(mainContent).toContain('select.dataset.orderNumber');
  expect(mainContent).toContain('payload.metadata = `order_number:${selectedOrderNumber}`');
});

it('includes a linked order number in Tax Center shipping expense exports', () => {
  expect(mainContent).toContain('e.shippingOrderNumber ? `${e.ref} · ${e.shippingOrderNumber}` : e.ref');
});
```

- [ ] **Step 2: Run the verification test and verify RED**

Run: `npm test -- tests/main-verification.test.js`

Expected: FAIL because shipment metadata and linked export context are absent.

- [ ] **Step 3: Carry the order number through destination prefill**

In the Recent Orders `addrObj` created by `initShippingTab()`, add:

```js
orderNumber: h.num,
```

In `onShippoPreFillDestChange()`, immediately after parsing `addr`, add:

```js
select.dataset.orderNumber = normalizeShippingOrderNumber(addr.orderNumber);
```

Because consignment-store prefills have no `orderNumber`, selecting one clears the dataset to an empty string and cannot accidentally reuse a previous order.

- [ ] **Step 4: Attach order metadata to future Shippo shipments**

Immediately after the shipment `payload` is created in `calculateShippoRates()`, add:

```js
const selectedOrderNumber = normalizeShippingOrderNumber($('ship-prefill-dest')?.dataset.orderNumber);
if (selectedOrderNumber) payload.metadata = `order_number:${selectedOrderNumber}`;
```

This stays below Shippo's 100-character metadata limit and makes future label transactions exactly reconcilable when they retain their shipment association.

- [ ] **Step 5: Include the linked order in Tax Center ledger/CSV context**

In the `TAX_CENTER.businessExpenses` ledger mapping inside `renderTaxCenter()`, change the `ref` assignment to:

```js
ref: e.shippingOrderNumber ? `${e.ref} · ${e.shippingOrderNumber}` : e.ref || '',
```

The existing Tax Center CSV exporter consumes `allLedger`, so this one canonical mapping updates both the screen and exported audit trail.

- [ ] **Step 6: Run the focused feature suite**

Run:

```bash
npm test -- tests/shipping-reconciliation.test.js tests/cashflow.test.js tests/main-verification.test.js tests/html.test.js tests/shippo.test.js
```

Expected: PASS with no warnings or unhandled rejections.

- [ ] **Step 7: Run repository-wide verification**

Run:

```bash
npm test
npm run lint
npm run build
git diff --check
```

Expected: all Vitest files pass; ESLint exits 0; Vite production build exits 0; `git diff --check` prints nothing.

- [ ] **Step 8: Verify responsive UI and interaction behavior**

Start the app:

```bash
npm run dev -- --host 127.0.0.1
```

Using the frontend testing workflow, inspect the Web Orders and Tax Center views at 375 px, 768 px, and 1200 px or wider. Confirm:

- badges wrap without overlapping View/Apply actions;
- positive, negative, zero, unavailable, and unlinked states include readable text rather than color alone;
- every reconciliation select and button has at least a 44 px mobile touch target;
- long order numbers, customer names, and tracking context truncate without horizontal overflow;
- selecting a suggested order and clicking `Link postage` updates the order summary immediately;
- a simulated Shippo context failure preserves the expense as `unmatched` and shows non-blocking feedback.

Expected: no console errors, clipped controls, horizontal page scrolling, or inaccessible unlabeled form controls.

- [ ] **Step 9: Commit final integration and verification fixes**

```bash
git add src/main.js tests/main-verification.test.js
git commit -m "feat: tag Shippo shipments with order references"
```

If responsive verification required CSS or markup adjustments, include `src/style.css` or `index.html` in the same commit.

## Completion Checklist

- [ ] Customer-paid shipping is included exactly once in gross income.
- [ ] Shippo postage remains included exactly once in operating expenses.
- [ ] Exact metadata matches link automatically; recipient matches require confirmation.
- [ ] Unmatched postage remains visible and accounted for.
- [ ] Cards and history show customer paid, postage cost, and margin when available.
- [ ] Manual links persist through `saveTaxCenter()` and survive rerender/reload.
- [ ] Future Shippo shipments carry normalized Big Cartel order metadata.
- [ ] Tax Center display and CSV contain the linked order reference.
- [ ] Focused tests, full tests, lint, build, diff check, and responsive UI checks pass.
