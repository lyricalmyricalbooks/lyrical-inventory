# Big Cartel Discount and Shipping Import Design

## Goal

Import Big Cartel website orders at the amounts the customer actually paid while preserving the catalog list price. Customer-paid shipping and merchandise discounts remain distinct financial values.

For the reference receipt:

- merchandise subtotal: CA$65.00;
- discount code: `LMBCOLLECTIVE`;
- discount amount: CA$32.50;
- merchandise paid: CA$32.50;
- shipping method: `International standard - 7 - 14 business days`;
- customer-paid shipping: CA$32.00; and
- order total: CA$64.50.

Applying this order removes one unit from inventory, records CA$32.50 of merchandise revenue, and records CA$32.00 of customer-paid shipping income. It does not change the book's CA$65.00 catalog price.

## Current Problem

The Gmail scanner extracts `Subtotal` as the imported item price. It derives unnamed shipping from `Total - Subtotal - Tax`. On a discounted receipt this produces a negative result because the calculation does not include the discount, so shipping becomes zero and merchandise revenue remains at the undiscounted subtotal.

## Receipt Data Model

Each scanned order may carry these normalized fields:

```js
{
  subtotal: 65,
  discountCode: 'LMBCOLLECTIVE',
  discountAmount: 32.5,
  merchandisePaid: 32.5,
  shippingMethod: 'International standard - 7 - 14 business days',
  shippingPaid: 32,
  taxPaid: 0,
  totalPaid: 64.5,
  discountSource: 'receipt'
}
```

`discountSource` is `receipt`, `code-rule`, `manual`, or blank. Existing `price` consumers receive the per-unit merchandise price actually paid so current inventory, revenue, and Sheets flows continue to record net merchandise revenue.

All financial calculations use cent rounding. For multi-quantity orders, `merchandisePaid` is the total net merchandise amount and imported unit price is `merchandisePaid / quantity`, rounded consistently with the app's existing money conventions.

## Automatic Extraction

The Apps Script scanner extracts labeled `Subtotal`, `Tax`, `Total`, and discount rows. A discount row may include a code, an amount, or both. Displayed discount amounts are normalized to positive values even when the receipt renders them with a minus sign.

Shipping follows this precedence:

1. Use a labeled `Shipping`, `Shipping and handling`, or `Postage` amount.
2. Otherwise calculate `Total - Subtotal + Discount - Tax`.
3. Record the named line between tax/discount totals and the shipping amount as `shippingMethod` when it can be identified safely.

If the receipt contains `LMBCOLLECTIVE` but omits a readable discount amount, the scanner applies the known 50% merchandise rule and marks `discountSource` as `code-rule`. The calculation affects merchandise only, never shipping.

## Review and Manual Fallback

Each pending order card shows a compact financial breakdown when a discount exists:

- `List CA$65.00`
- `LMBCOLLECTIVE −CA$32.50`
- `Merchandise CA$32.50`
- `Shipping CA$32.00`
- `Total paid CA$64.50`

If no discount was extracted, the card offers a `Contributor 50%` action. It sets the merchandise discount to 50%, marks the source as `manual`, recalculates the net merchandise amount, and leaves shipping unchanged. The action is reversible before the order is applied.

The existing Apply action remains the final confirmation. Applied history retains the discount code, discount amount, merchandise subtotal, merchandise paid, shipping method, shipping paid, tax, and total paid so the transaction can be audited later.

## Validation and Error Handling

Before application, the app checks:

`merchandisePaid + shippingPaid + taxPaid = totalPaid`

The comparison allows a one-cent rounding tolerance. A larger mismatch displays a warning and prevents silent bulk application. The user can review the source email and either use the manual contributor adjustment or leave the order unapplied.

Missing optional labels do not break scanning. Undiscounted receipts continue using their current behavior. Discounts cannot reduce merchandise below zero, and shipping is never discounted by the contributor control.

## Persistence and Accounting

- Stock decreases by the purchased quantity.
- Merchandise revenue uses the net per-unit price actually paid.
- Customer-paid shipping remains a separate shipping-income row and is not royalty-bearing merchandise revenue.
- The catalog list price is unchanged.
- Sheets synchronization uses the same deterministic Big Cartel order IDs, preventing duplicate rows.
- Backfill can enrich existing applied orders only when receipt data yields a valid, reconciled result; it must not duplicate shipping income or overwrite intentional manual values.

## Testing

Automated coverage will include:

- parsing the reference CA$65.00 / CA$32.50 discount / CA$32.00 shipping / CA$64.50 total receipt;
- explicit and calculated shipping on undiscounted receipts;
- `LMBCOLLECTIVE` 50% fallback when its amount is absent;
- manual 50% application and reversal;
- net merchandise revenue and separate shipping income when applying an order;
- multi-quantity cent rounding;
- mismatch detection and bulk-apply blocking;
- preservation of existing undiscounted import behavior; and
- parity between `apps-script/Code.gs` and `public/gas-code.txt`.

## Out of Scope

- Changing prices or discount configuration in Big Cartel.
- Applying contributor discounts to shipping.
- Replacing the existing Shippo/postage reconciliation flow.
- Supporting arbitrary promotion rules that are not represented in the receipt.

## Success Criteria

- The reference receipt imports CA$32.50 as merchandise revenue and CA$32.00 as customer-paid shipping.
- The order card clearly identifies the contributor discount before stock is applied.
- A missed receipt discount can be corrected with one reversible manual action.
- Imported components reconcile to CA$64.50 total paid.
- Existing undiscounted Big Cartel orders continue to import correctly.
