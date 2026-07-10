# Order Shipping Reconciliation Design

## Purpose

Document and account for both sides of shipping on every website order:

- the shipping amount the customer paid at Big Cartel checkout; and
- the actual postage or label cost paid through Shippo.

The app must show the relationship between those amounts without duplicating income or expense records.

## Current State

Big Cartel Gmail scanning already extracts `shippingPaid`, saves it on an applied order history entry, displays it when present on a scanned order card, and exports it as a separate Google Sheets shipping row. The Tax Center gross-sales calculation does not currently include this customer-paid shipping.

Shippo transaction import already records non-refunded label purchases in `TAX_CENTER.businessExpenses` under `Shipping & Postage`. Those expenses are included in operating expenses, but they are identified only by a `shippo:<transaction-id>` reference and are not linked to a Big Cartel order.

## Accounting Model

Customer-paid shipping is income. It remains stored once on the order as `shippingPaid` in the order's native currency.

Actual postage is an operating expense. The existing Shippo business-expense row remains the single source of truth for its amount, currency, historical conversion rate, CAD base amount, transaction reference, receipt, and tracking details.

Linking an expense to an order adds reconciliation metadata to the expense; it does not copy the expense amount into a second ledger record. Order displays derive actual postage from the linked expense.

For reporting in the configured base currency:

- gross income includes merchandise revenue plus non-voided customer-paid shipping;
- operating expenses continue to include the Shippo label expense once; and
- shipping margin is customer-paid shipping in base currency minus actual postage in base currency.

All new calculations use the repository's money helpers and cent rounding rather than unrounded floating-point totals.

## Canonical Fields

Applied order history entries continue to use:

```js
{
  num: '#ORDER-123',
  shippingPaid: 12.00
}
```

Imported Shippo business expenses gain normalized source and reconciliation metadata:

```js
{
  ref: 'shippo:<transaction-id>',
  shippoTransactionId: '<transaction-id>',
  shippoShipmentId: '<shipment-id>',
  shippingOrderNumber: '#ORDER-123',
  shippingMatchMethod: 'metadata',
  shippingMatchStatus: 'matched'
}
```

`shippingMatchMethod` is one of `metadata`, `shippo-order`, `recipient`, or `manual`. `shippingMatchStatus` is one of `matched`, `suggested`, `ambiguous`, or `unmatched`.

Legacy Shippo expenses remain valid. A later Shippo import or reconciliation pass can enrich them in place by their stable `ref` without creating another expense.

## Matching Rules

Matching is deterministic and conservative:

1. Normalize Big Cartel order numbers to a leading `#` and case-insensitive alphanumeric/hyphen form.
2. Prefer an exact order number from Shippo transaction metadata, shipment metadata, or a Shippo Order association.
3. If there is no exact reference, compare recipient email first, then recipient name plus postal code, within seven days after the order date.
4. A recipient-based match becomes `suggested`; it is never automatically finalized.
5. Multiple candidate orders produce `ambiguous` and require manual selection.
6. No candidate produces `unmatched`; the expense remains fully accounted for.
7. Refunded, invalid, or errored Shippo transactions are not imported as expenses, matching current behavior.

Future Shippo shipments created by this app include the Big Cartel order number in Shippo metadata whenever an order is selected, making subsequent matching exact.

## User Experience

### Scanned order cards

Each card uses explicit financial labels instead of a generic shipping badge:

- `Customer paid CA$12.00`
- `Postage cost CA$9.35` when matched
- `Shipping margin +CA$2.65` when both sides are known
- `Postage not linked` when no Shippo expense is linked

Positive, zero, and negative margins receive distinct accessible treatments. Currency is always printed as text; color is supplemental.

### Applied order history

Applied website orders retain the same three-value shipping summary. The history remains useful after scanned orders disappear from the pending list.

### Shipping reconciliation worklist

The Tax Center Shippo area includes a compact reconciliation worklist for `suggested`, `ambiguous`, and `unmatched` postage expenses. Each row shows transaction date, amount, recipient or tracking context, suggested order when available, and actions to link or change the order.

Manual confirmation writes only reconciliation metadata to the existing expense and persists through the normal offline-first Tax Center save path.

## Import and Data Flow

1. Gmail scan extracts customer-paid shipping from the Big Cartel receipt.
2. Applying the order persists `shippingPaid` on the history entry and syncs the existing customer-shipping income row to Sheets.
3. Shippo import retrieves each valid transaction and its shipment/order context when required.
4. The importer creates or enriches one `Shipping & Postage` business expense keyed by `shippo:<transaction-id>`.
5. Pure reconciliation helpers classify the expense as matched, suggested, ambiguous, or unmatched.
6. Order-card, history, Tax Center, cash-flow, and CSV views read from the linked canonical records.

Network or enrichment failures do not discard a paid label. The base expense is saved as unmatched, and the UI explains that accounting succeeded while order linkage needs attention.

## Google Sheets and Exports

The existing customer-paid shipping Sheets row remains an income row tied to the order's stable Sheets ID.

The Tax Center ledger and CSV export continue to include actual Shippo postage as an expense. Reconciliation fields add the linked order number to its description/reference context so exported records can be audited from either side.

No rebuild creates duplicate shipping income or Shippo expense rows.

## Offline and Persistence Requirements

Reconciliation operates on locally available order history and Tax Center expenses. Manual link changes update local state immediately and use the existing Firestore/offline save mechanism. Shippo enrichment requires a network connection, but failure leaves existing local expenses and matches untouched.

## Error Handling

- Missing Shippo credentials show the existing non-blocking warning.
- Shippo transaction or shipment lookup failures are logged and summarized without stopping other transactions from importing.
- Invalid money values are not linked or included in margin calculations.
- Currency conversion failures keep the original amount visible and mark the base-currency margin unavailable instead of assuming parity.
- Duplicate Shippo transaction IDs enrich the existing expense rather than adding a new one.

## Security and Privacy

Shippo credentials remain in the current publisher-only settings flow. Reconciliation controls are publisher-only. UI and logs avoid exposing full street addresses; matching can use normalized postal codes internally while displaying only limited recipient context.

## Testing

Pure helper tests cover:

- order-number normalization;
- exact transaction/shipment/order metadata matching;
- unique recipient suggestions;
- ambiguous and unmatched results;
- cent-rounded positive, zero, and negative shipping margins;
- currency conversion failure behavior;
- gross-sales inclusion of non-voided customer-paid shipping;
- exclusion of voided customer-paid shipping;
- Shippo transaction idempotency and legacy-expense enrichment; and
- refunded, invalid, and errored transaction exclusion.

Integration-oriented tests verify that order cards and history render both amounts, unmatched costs remain visible, and Shippo expenses are not duplicated.

Before completion, run the focused tests, full Vitest suite, ESLint, production build, and responsive UI checks at 375 px, 768 px, and at least 1200 px.

## Out of Scope

- Automatically purchasing a Shippo label from the order card.
- Modifying Big Cartel checkout prices.
- Estimating future shipping charges; the existing Shipping Specs predictor remains separate.
- Treating customer-paid shipping as artist royalty-bearing merchandise revenue.
- Automatically accepting fuzzy recipient matches.

## Success Criteria

- Every customer-paid shipping amount is included once in income accounting.
- Every imported Shippo label is included once in operating expenses even when unmatched.
- Matched orders show customer paid, actual postage, and shipping margin.
- Ambiguous matches require confirmation and never silently alter financial links.
- Existing order and expense data remains backward compatible.
