---
name: ledger-audit
description: State-of-the-Art Financial Ledger & Reconciliation procedure. Audits double-entry ledger equations, currency precision, multi-currency FX rates, customer shipping CAD invariants, consignment payouts, and balance continuity.
---

# State-of-the-Art Financial Ledger & Reconciliation Audit (/ledger-audit)

Use this skill whenever verifying, auditing, debugging, or modifying financial calculations, ledger rows, currency conversions, consignment settlements, or order history in this project.

---

## 1. Mathematical Invariants & Precision Rules

### A. Floating-Point Rounding (`roundCents`)
- **No Float Accumulation:** Never use raw `+` or `-` on floats for financial sums.
- **Enforce Cent Rounding:** Always wrap intermediate and running totals in `roundCents()`:
  ```javascript
  import { roundCents } from '../lib/money.js';
  const total = roundCents(subtotal + tax);
  ```

### B. Customer Shipping CAD Invariant
> [!IMPORTANT]
> **All customer-paid shipping values (`shippingPaid` or `customerShipping`) are natively in CAD.**
> - Consume directly as CAD.
> - **Never** apply FX rate conversion (e.g. from USD, EUR, GBP) to customer shipping.

### C. Multi-Currency Stamping
- Sales must permanently store `entry.cur` and `payment.rate`.
- A change to a book's default currency must **never** retroactively alter historical entries.

---

## 2. Double-Entry Reconciliation Equations

1. **Consignment Balance Conservation:**
   $$\text{Stock Consigned} = \sum \text{Shipments} - \sum \text{Returns} - \sum \text{Reported Sales}$$
2. **Consignment Revenue Due:**
   $$\text{Store Commission} = \text{roundCents}(\text{Gross Sales} \times \text{Commission Rate})$$
   $$\text{Publisher/Artist Net Due} = \text{roundCents}(\text{Gross Sales} - \text{Store Commission})$$
   $$\text{Balance Unpaid} = \sum \text{Net Due} - \sum \text{Payouts Settled}$$
3. **Ledger Sequence Continuity (`_after` / `after`):**
   - Verify that sequential stock mutation events chain unbroken: $\text{OnHand}_{t} = \text{OnHand}_{t-1} + \Delta\text{Stock}_t$.
   - Voided entries must have zero effect on $\text{OnHand}$ while preserving the audit row.

---

## 3. Step-by-Step Audit Execution Protocol

### Step 1: Run Dedicated Financial Unit Tests
```bash
npm.cmd test -- tests/money.test.js tests/consignment.test.js tests/shipping-reconciliation.test.js tests/earnings.test.js tests/cashflow.test.js tests/recompute-afters.test.js tests/artist-payout-request.test.js tests/taxcentre-ledger.test.js
```

### Step 2: Code Inspection Checklist
- [ ] Check that `roundCents` is imported from `src/lib/money.js` and used for all price and fee math.
- [ ] Confirm no FX rate conversion is applied to shipping fees.
- [ ] Confirm template literals use defensive fallbacks: `${row.amount ?? 0}`.
- [ ] Confirm all numbers and currency amounts render with tabular figures (`font-feature-settings: "tnum" 1` or `font-family: 'DM Mono', monospace`).
- [ ] Verify `IS_PUBLISHER` checks isolate author views from global financial mutations.
