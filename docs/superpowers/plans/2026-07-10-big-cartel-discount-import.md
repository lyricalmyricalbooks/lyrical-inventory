# Big Cartel Discount and Shipping Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Import discounted Big Cartel orders at net merchandise revenue while preserving customer-paid shipping and the catalog list price.

**Architecture:** Extend the Apps Script receipt parser to return normalized receipt financials, then normalize and validate those values in a small DOM-free client module. Keep `src/main.js` responsible for rendering and persistence, using net per-unit merchandise price for existing revenue flows and `shippingPaid` for the existing separate shipping-income flow.

**Tech Stack:** Google Apps Script JavaScript, vanilla JavaScript ES modules, Vitest, Firebase/local state, Google Sheets synchronization.

## Global Constraints

- Preserve the book's catalog list price.
- Discounts apply to merchandise only, never shipping.
- Round financial values to cents and allow at most a CA$0.01 reconciliation difference.
- Keep customer-paid shipping separate from royalty-bearing merchandise revenue.
- Preserve deterministic Big Cartel Sheets IDs and offline-first local persistence.
- Keep `apps-script/Code.gs` and `public/gas-code.txt` byte-for-byte identical after Apps Script changes.
- Do not add dependencies or frameworks.

---

### Task 1: Parse Big Cartel receipt financials

**Files:**
- Modify: `apps-script/Code.gs:155-245`
- Modify: `public/gas-code.txt:155-245`
- Test: `tests/apps-script.test.js`

**Interfaces:**
- Consumes: Big Cartel plain-text receipt body and purchased quantity.
- Produces: `extractBigCartelFinancials_(body, qty)` returning `{ subtotal, discountCode, discountAmount, merchandisePaid, shippingMethod, shippingPaid, taxPaid, totalPaid, discountSource, price }`.

- [ ] **Step 1: Write failing parser tests**

Add a loader for `parseBigCartelMoney_` and `extractBigCartelFinancials_`, then assert the reference receipt:

```js
it('parses contributor discount and international shipping independently', () => {
  const extract = loadFinancialExtractor();
  const body = `Subtotal
CA$65.00
Tax
CA$0.00
International standard - 7 - 14 business days
CA$32.00
Discount: LMBCOLLECTIVE
CA$32.50
Total
CA$64.50`;

  expect(extract(body, 1)).toEqual({
    subtotal: 65,
    discountCode: 'LMBCOLLECTIVE',
    discountAmount: 32.5,
    merchandisePaid: 32.5,
    shippingMethod: 'International standard - 7 - 14 business days',
    shippingPaid: 32,
    taxPaid: 0,
    totalPaid: 64.5,
    discountSource: 'receipt',
    price: 32.5
  });
});

it('applies the known contributor rule when its amount is absent', () => {
  const extract = loadFinancialExtractor();
  const result = extract(`Subtotal\nCA$130.00\nTax\nCA$0.00\nShipping\nCA$32.00\nDiscount: LMBCOLLECTIVE\nTotal\nCA$97.00`, 2);
  expect(result.discountAmount).toBe(65);
  expect(result.merchandisePaid).toBe(65);
  expect(result.price).toBe(32.5);
  expect(result.discountSource).toBe('code-rule');
});
```

Retain the existing explicit and calculated shipping tests as regression coverage.

- [ ] **Step 2: Run the parser tests and verify RED**

Run: `npm test -- tests/apps-script.test.js`

Expected: FAIL because `extractBigCartelFinancials_` does not exist or does not return discount fields.

- [ ] **Step 3: Implement minimal receipt extraction**

Add cent rounding and label extraction. Normalize a displayed negative discount to a positive amount. Calculate unnamed shipping with:

```js
shippingPaid = roundBigCartelCents_(totalPaid - subtotal + discountAmount - taxPaid);
```

Calculate:

```js
merchandisePaid = Math.max(0, roundBigCartelCents_(subtotal - discountAmount));
price = roundBigCartelCents_(merchandisePaid / Math.max(1, qty));
```

If code `LMBCOLLECTIVE` is present without an amount, set `discountAmount` to 50% of subtotal and `discountSource` to `code-rule`. Update `scanGmail_` to spread the returned fields into each order instead of assigning subtotal directly to `price`.

- [ ] **Step 4: Synchronize the public Apps Script copy**

Run: `Copy-Item -LiteralPath apps-script/Code.gs -Destination public/gas-code.txt -Force`

Verify: `Get-FileHash apps-script/Code.gs; Get-FileHash public/gas-code.txt`

Expected: identical SHA256 hashes.

- [ ] **Step 5: Run tests and verify GREEN**

Run: `npm test -- tests/apps-script.test.js`

Expected: PASS, including all pre-existing shipping parser tests.

- [ ] **Step 6: Commit parser changes**

```powershell
git add apps-script/Code.gs public/gas-code.txt tests/apps-script.test.js
git commit -m "feat: parse Big Cartel discounts and shipping"
```

---

### Task 2: Normalize, validate, and manually adjust scanned financials

**Files:**
- Create: `src/lib/big-cartel-order.js`
- Create: `tests/big-cartel-order.test.js`

**Interfaces:**
- Consumes: raw scanned order objects.
- Produces: `normalizeBigCartelFinancials(order, fallbackListPrice)`, `reconcileBigCartelFinancials(order)`, and `applyContributorDiscount(order, enabled)`.

- [ ] **Step 1: Write failing domain tests**

```js
import { describe, expect, it } from 'vitest';
import {
  applyContributorDiscount,
  normalizeBigCartelFinancials,
  reconcileBigCartelFinancials
} from '../src/lib/big-cartel-order.js';

describe('Big Cartel order financials', () => {
  it('normalizes the reference receipt without changing list price', () => {
    const result = normalizeBigCartelFinancials({
      qty: 1, subtotal: 65, discountCode: 'LMBCOLLECTIVE', discountAmount: 32.5,
      merchandisePaid: 32.5, shippingPaid: 32, taxPaid: 0, totalPaid: 64.5,
      discountSource: 'receipt'
    }, 65);
    expect(result.price).toBe(32.5);
    expect(result.listPrice).toBe(65);
    expect(reconcileBigCartelFinancials(result)).toEqual({ valid: true, difference: 0 });
  });

  it('applies and reverses the manual contributor discount without changing shipping', () => {
    const order = { qty: 1, subtotal: 65, shippingPaid: 32, taxPaid: 0, totalPaid: 64.5 };
    const adjusted = applyContributorDiscount(order, true);
    expect(adjusted).toMatchObject({ discountAmount: 32.5, merchandisePaid: 32.5, price: 32.5, shippingPaid: 32, discountSource: 'manual' });
    expect(applyContributorDiscount(adjusted, false)).toMatchObject({ discountAmount: 0, merchandisePaid: 65, price: 65, shippingPaid: 32 });
  });

  it('rejects differences larger than one cent', () => {
    expect(reconcileBigCartelFinancials({ merchandisePaid: 32.5, shippingPaid: 32, taxPaid: 0, totalPaid: 65 }))
      .toEqual({ valid: false, difference: -0.5 });
  });
});
```

- [ ] **Step 2: Run domain tests and verify RED**

Run: `npm test -- tests/big-cartel-order.test.js`

Expected: FAIL because `src/lib/big-cartel-order.js` does not exist.

- [ ] **Step 3: Implement the pure helpers**

Use a private `roundCents(value)` helper. Normalization must preserve the supplied catalog `listPrice`, derive `merchandisePaid` from subtotal minus discount when missing, derive per-unit `price`, and retain parser-provided metadata. Reconciliation returns a signed cent-rounded difference:

```js
const difference = roundCents(
  Number(order.merchandisePaid || 0) + Number(order.shippingPaid || 0) +
  Number(order.taxPaid || 0) - Number(order.totalPaid || 0)
);
return { valid: Math.abs(difference) <= 0.01, difference };
```

The manual toggle uses a 50% subtotal discount, sets code `LMBCOLLECTIVE`, and changes only merchandise fields.

- [ ] **Step 4: Run domain tests and verify GREEN**

Run: `npm test -- tests/big-cartel-order.test.js`

Expected: PASS.

- [ ] **Step 5: Commit domain helpers**

```powershell
git add src/lib/big-cartel-order.js tests/big-cartel-order.test.js
git commit -m "feat: normalize Big Cartel order financials"
```

---

### Task 3: Integrate financial review and net revenue persistence

**Files:**
- Modify: `src/main.js:32,5580-5705,5800-5850`
- Modify: `src/style.css`
- Test: `tests/main-verification.test.js`
- Test: `tests/html.test.js`

**Interfaces:**
- Consumes: the Task 2 functions and Task 1 scanner fields.
- Produces: pending-order financial breakdown, `toggleContributorDiscount(id)`, reconciliation warnings, and complete applied history metadata.

- [ ] **Step 1: Write failing integration assertions**

Add static wiring assertions in `tests/main-verification.test.js`:

```js
expect(mainContent).toContain("from './lib/big-cartel-order.js'");
expect(mainContent).toContain('window.toggleContributorDiscount = toggleContributorDiscount');
expect(mainContent).toContain('discountAmount: Number(o.discountAmount || 0) || 0');
expect(mainContent).toContain('merchandisePaid: Number(o.merchandisePaid || 0) || price * o.qty');
expect(mainContent).toContain('totalPaid: Number(o.totalPaid || 0) || 0');
```

Add HTML/style assertions for semantic classes `order-financials`, `order-discount`, and `order-reconciliation-warning`.

- [ ] **Step 2: Run integration tests and verify RED**

Run: `npm test -- tests/main-verification.test.js tests/html.test.js`

Expected: FAIL because the new module wiring, manual action, and financial breakdown are absent.

- [ ] **Step 3: Normalize fetched orders**

Import the Task 2 functions. After existing book and quantity resolution, call:

```js
const financials = normalizeBigCartelFinancials({ ...o, qty }, BOOKS[resolvedBookId]?.listPrice || book.listPrice);
```

Spread `financials` into the normalized order. Do not use `||` for a legitimate zero discounted price; use normalized numeric fields.

- [ ] **Step 4: Render the financial breakdown and fallback action**

For discounted orders, render list price, discount code/amount, merchandise paid, shipping, and total paid. For orders without an extracted discount, render a reversible `Contributor 50%` button. If reconciliation is invalid, render the signed mismatch and disable Apply for that card and Apply All for the batch.

Implement and export globally:

```js
function toggleContributorDiscount(id) {
  const index = orders.findIndex(order => order.id === id);
  if (index < 0) return;
  const enabled = orders[index].discountSource !== 'manual';
  orders[index] = applyContributorDiscount(orders[index], enabled);
  renderOrders();
}
window.toggleContributorDiscount = toggleContributorDiscount;
```

- [ ] **Step 5: Persist auditable fields and net revenue**

In `applyOne`, use normalized `o.price` as net per-unit merchandise revenue. Add to history:

```js
subtotal: Number(o.subtotal || 0) || 0,
discountCode: o.discountCode || '',
discountAmount: Number(o.discountAmount || 0) || 0,
discountSource: o.discountSource || '',
merchandisePaid: Number(o.merchandisePaid || 0) || price * o.qty,
shippingMethod: o.shippingMethod || '',
taxPaid: Number(o.taxPaid || 0) || 0,
totalPaid: Number(o.totalPaid || 0) || 0
```

Keep the existing separate `shippingPurchaseRowPayload` call unchanged. Include the discount code and amount in the order-row notes so Sheets retains an audit cue without changing its schema.

- [ ] **Step 6: Add focused responsive styles**

Style `.order-financials` as a compact wrapping row of labeled monetary chips, `.order-discount` with the existing purple accent, and `.order-reconciliation-warning` with the existing amber warning palette. Preserve mobile wrapping and current Apply/View alignment.

- [ ] **Step 7: Run focused tests and verify GREEN**

Run: `npm test -- tests/big-cartel-order.test.js tests/apps-script.test.js tests/main-verification.test.js tests/html.test.js tests/cashflow.test.js`

Expected: PASS.

- [ ] **Step 8: Commit UI and persistence integration**

```powershell
git add src/main.js src/style.css tests/main-verification.test.js tests/html.test.js
git commit -m "feat: review and apply discounted website orders"
```

---

### Task 4: Full verification and regression audit

**Files:**
- Verify: all changed files

**Interfaces:**
- Consumes: completed Tasks 1-3.
- Produces: a verified build with parser-copy parity and no regression in the full test suite.

- [ ] **Step 1: Verify Apps Script parity**

Run: `Get-FileHash apps-script/Code.gs; Get-FileHash public/gas-code.txt`

Expected: identical SHA256 hashes.

- [ ] **Step 2: Run the full test suite**

Run: `npm test`

Expected: all tests PASS with no unhandled errors.

- [ ] **Step 3: Run lint**

Run: `npm run lint`

Expected: exit code 0 with no new lint errors.

- [ ] **Step 4: Build production assets**

Run: `npm run build`

Expected: exit code 0 and a successful Vite production build.

- [ ] **Step 5: Review the final diff**

Run: `git diff HEAD~3 --check; git status --short`

Expected: no whitespace errors and only intentional files present.

- [ ] **Step 6: Record verification fixes if needed**

If verification requires code changes, first add a failing regression test, apply the minimal fix, rerun the affected check plus `npm test`, and commit only those verified fixes with a message naming the regression.
