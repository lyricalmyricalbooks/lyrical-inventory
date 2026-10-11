# Website ↔ inventory app link

The shop (this repo, Firebase project `lyricalmyrical-web-v2`) and the inventory app
(`lyricalmyricalbooks/lyrical-inventory`, Firebase project `lyricalmyrical-37c46`) exchange
three things:

1. **Website sales → inventory app.** Each paid website order (and every later refund or
   dispatch) is written to an inbox, `websiteOrders/{orderId}`, in the **inventory** project.
   The inventory app turns it into ledger rows through its own save path.
2. **Inventory count → website.** After each saved change, the inventory app publishes
   `websiteStockFeed/{inventoryBookId}`. Every 15 minutes the website sets the stock of every
   linked edition from that feed.
3. **Postage bought in the inventory app → website.** The app writes the label onto
   `websiteOrders/{orderId}.app`. The website attaches it to the order and, once the parcel is
   marked shipped, dispatches the order with the same safety checks as Orders › Dispatch.

**Who can do what:**

- **The inventory app is the master count** for every linked book. The website changes stock
  only through its own orders (payment, refund, restock), exactly as before.
- **Nothing here is a payment path.** It never marks an order paid, refunds it, or touches
  Stripe or PayPal.

## Transport

Website Cloud Functions open a second Admin SDK app:
`initializeApp({ projectId: "lyricalmyrical-37c46" }, "inventory")` (`functions/inventoryLinkStore.js`).

- **Credentials.** It uses the Functions' default service account
  (`<project-number>-compute@developer.gserviceaccount.com`). The owner grants that account
  **Cloud Datastore User** on `lyricalmyrical-37c46` once.
- **Rules.** The Admin SDK bypasses the inventory project's rules. Ownership of each field is
  therefore by convention, listed below.
- **Inventory app access.** The inventory app (browser, signed in as the publisher) reads and
  writes these documents under its own `firestore.rules`.

## Documents in the inventory project

### `websiteOrders/{orderId}`

| Field | Owner | Meaning |
| --- | --- | --- |
| `web` | website | The order as the website sees it now. Replaced as a whole on every push. |
| `pending` | both | `true` when the app has something to look at (website sets it on a new `web.hash` or a new `shipmentReply`); the app sets `false` when done. |
| `shipmentReply` | website | The website's answer to the last `app.shipment`. |
| `imported` | app | What the app last applied: `{ hash, at, device, effect: { [invBookId]: copies }, decisions }`. |
| `app` | app | `{ shipment, shipmentWaiting }` (the website only ever sets `app.shipmentWaiting = false`, in the same transaction as its `shipmentReply`). |

**`web`** (version 1):

```js
{
  v: 1,
  orderId: "ABCD-123456-WXYZ",
  number: "#ABCD-123456-WXYZ",       // manual-payment orders (24 hex): "#WEB-<24HEX>" (the app needs a hyphen)
  sourceUpdatedAt: "2026-10-11T15:04:05.000Z", // the order's last update the push was built from
  hash: "<sha256 hex>",               // of `web` without hash/sourceUpdatedAt; changes whenever anything below changes
  test: false,                        // true = Stripe test-mode rehearsal order: the app shows it, never records it
  paidAt: "2026-10-11T15:00:00.000Z",
  paidDay: "2026-10-11",              // Toronto calendar day
  paymentMethod: "Stripe",            // "Stripe" | "PayPal" | "Free" | manual method name
  paymentStatus: "paid",              // "paid" | "refund_pending" | "refunded"
  refundState: "none",                // "none" | "partial" | "full"
  refund: null,                       // { amountMinor, currency } when refunded (partly or fully)
  stripePaymentIntentId: "pi_…" | null,
  paypalCaptureId: "…" | null,
  totals: { subtotal, discount, discountCode, shipping, tax, total, giftCard }, // CAD dollars
  charged: { currency: "CAD" | "USD" | "EUR", amountMinor },                     // what the customer paid
  customer: { name, email, phone, address: { street, unit, city, state, zip, country } },
  fulfillment: {
    method: "shipping" | "pickup" | "local_delivery",
    status: "paid" | "processing" | "shipped" | "out_for_delivery" | "delivered" | "collected" | …,
    trackingNumber, trackingCarrier, trackingUrl, // "" when none
    shippedDay: "YYYY-MM-DD" | null,
    labelSource: "website" | "inventory-app" | null,
  },
  books: {
    [inventoryBookId]: {
      net: 2,          // copies that left the shelf and stayed gone (sold − restocked, never below 0)
      sold: 2,         // copies sold
      restocked: 0,    // copies put back on the shelf by refunds/returns
      unitCAD: 40,     // average CAD price per sold copy, before the order discount
      merchCAD: 80,    // unitCAD × sold
      preorder: false,
      titles: ["The Hound — Paperback"],
    },
  },
  firstBook: "<inventoryBookId>" | null, // the row that carries the order's shipping/tax/discount/totals
  unlinked: [{ title, qty }],            // physical copies of website editions not linked to an inventory book
}
```

- **What counts.** `books` covers physical copies of **linked** editions only. Box sets count
  as the books inside them. Gift cards and e-books are never included.
- **Order pushed, but unlinked.** An order with only unlinked copies is still pushed, so the
  app can say so.
- **Refunds.**
  - **Full refund, books came back:** `net` is 0.
  - **Full refund, books did not come back** (`restocked` < `sold`): `net` stays above 0 and the
    copies remain gone.
  - **A refund the bank rejected** returns the order to `paid` with its old numbers.

**`app.shipment`** (written by the app):

```js
{
  carrier: "Canada Post", service: "Expedited Parcel",
  trackingNumber: "1234567890123456", trackingUrl: "https://…",
  labelCostCAD: 18.42 | null,
  labelSource: "canadapost" | "chitchats" | "shippo" | "hand",
  boughtAt: "ISO" | null,
  shippedAt: "YYYY-MM-DD" | ISO | null,   // null = label bought, parcel not marked shipped yet
  hash: "<deterministic string of trackingNumber|carrier|shippedAt>",
}
```

The app sets `app.shipmentWaiting = true` whenever it writes a new `hash`.

**`shipmentReply`** (written by the website, echoes the shipment `hash` it answered):

```js
{ hash, result: "attached" | "dispatched" | "refused" | "checked", reason: "plain sentence", at: "ISO" }
```

| `result` | What the website did |
| --- | --- |
| `attached` | Tracking put on the order while the parcel is still in the shop. |
| `dispatched` | Order marked shipped; the customer gets the usual shipped email. |
| `refused` | Nothing changed. `reason` says why (open return, dispute, hold, pre-order not released, already shipped with another label…). |
| `checked` | A rehearsal test order: `reason` says whether it would have dispatched. Test orders are never changed. |

### `websiteStockFeed/{inventoryBookId}` (written by the app)

```js
{
  bookId, title,
  onHand: 12,      // publisher-held copies now (deriveStockBreakdown().publisherOnHand), >= 0
  webCopies: 30,   // copies on non-voided website rows (webOrderId set) in this book
  base: 42,        // unfloored deriveOnHand + webCopies − author-held copies (may be negative)
  derived: true,   // false when the book has no print run (maxPrint), so the count is not trustworthy
  at: "ISO", build: "<app build>",
}
```

**How the website sets stock for an edition linked to inventory book B:**

```
target = max(0, min(feed.base − webTotal(B), feed.onHand))
```

- `webTotal(B)` is the sum of `net[B]` over the website's own `inventoryPushes`.
- Importing an order lowers `onHand` and raises `webCopies` by the same amount, so `base` does
  not move. The target is right whether or not the app has imported the order yet.

### `websiteLink/website` and `websiteLink/app`

- `website`: `{ at, serviceAccount, version }`. A heartbeat the website writes on every sweep.
- `app`: `{ importConsentAt, lastImportAt, lastFeedAt, build }`. Written by the app.

## Documents in the website project

- `systemStatus/inventoryLink` (admin-read, server-write) holds:
  - `links { [websiteBookId]: { "_" | variantId: inventoryBookId } }`
  - options: `startDay`, `autoSync`, `rehearsalUntil`
  - the run lease, backfill cursor, connection check and last sync result
- `inventoryPushes/{orderId}` (server-only) holds:
  - `net { [inventoryBookId]: copies }`
  - `lineLinks` (the link used for each order line, frozen once set)
  - `hash`, `sourceUpdatedAt`, `delivered`, `error`, `unlinkedCount`, `paidAt`

## Rows the inventory app writes (for reference)

**One `hist` row per order and inventory book:**

- **Identity:** `uid` = `sheetsId` = `web-<orderId>-<inventoryBookId>`, `webOrderId`, `chan: "Website"`, `num`, `fulfilledOnWebsite: true`.
- **Money:** `price: unitCAD`, converted for books priced in another currency. Order money (shipping, tax, discount, totals) goes on `firstBook`'s row only.
- **Refunded, all copies back on the shelf:** the row is voided.
- **Refunded, copies gone:** the row becomes `gratuity: true, price: 0`.
