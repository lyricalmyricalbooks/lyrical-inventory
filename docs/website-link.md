# Website ↔ inventory app link

The shop (this repo, Firebase project `lyricalmyrical-web-v2`) and the inventory app
(`lyricalmyricalbooks/lyrical-inventory`, Firebase project `lyricalmyrical-37c46`) exchange
three things:

1. **Website sales → inventory app.** Each paid website order (and every later refund or
   dispatch) is written to an inbox, `websiteOrders/{orderId}`, in the **inventory** project.
   The inventory app turns it into ledger rows through its own save path.
2. **Inventory count → website.** After each saved change, the inventory app publishes
   `websiteStockFeed/{inventoryBookId}`. Once the owner has applied a first preview and switched on
   automatic updates, the website sets linked editions' stock from that feed every 15 minutes.
   Big changes, books not counted on the website and books with no print run wait for the
   owner's preview. Stock is never set while any recent website sale is still unrecorded.
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
| `pendingSince` | website | When the order started waiting for the app (kept while `pending` stays true). The app never writes it. |
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
  onHand: 12,      // ON HAND as the app shows it, author-held copies included (deriveStockBreakdown().totalOnHand), >= 0
  webCopies: 30,   // copies on non-voided website rows (webOrderId set) in this book
  base: 42,        // unfloored deriveOnHand + webCopies (may be negative)
  derived: true,   // false when the book has no print run (maxPrint), so the count is not trustworthy
  at: "ISO", build: "<app build>",
}
```

**How the website sets stock for an edition linked to inventory book B:**

```
target = max(0, min(feed.base − webTotal(B), feed.onHand))
```

- **ON HAND in the inventory app is what the website sells from**, copies held by the author included.
- **A book with no count stays as it is** (hold `no-feed`). The app publishes counts only for books in its new
  (Firestore) storage. A book added after the app's one-time move was left in the old storage; the app now moves
  such a book over by itself when it opens online (`_fbAdoptBook`, `src/lib/storage-mode.js` in the inventory app),
  unless both storages hold a copy.
- **The owner's confirmed Apply switches counting on** for a matched book that isn't counted yet, even when its
  number is already right.
- `webTotal(B)` is the sum of `net[B]` over the website's own `inventoryPushes`.
- **Editions that are the same copies share one pile.** Two editions of one website book (The Hound's Signed and
  Unsigned hardcovers) may be linked to the same inventory book; two different website books may not. Both editions
  get the same target, a sale or refund of either moves both (`functions/stockPools.js`, read from `links` inside
  `readBooks`), and checkout holds count both editions' lines against the one pile.
- Importing an order lowers `onHand` and raises `webCopies` by the same amount, so `base` does
  not move. The target is right whether or not the app has imported the order yet.

### `websiteLink/website` and `websiteLink/app`

- `website`: `{ at, serviceAccount, version, pastFrom, pastFromAt }`. A heartbeat the website writes on every sweep.
  `pastFrom`/`pastFromAt` are written when the owner moves the start day earlier, before the start day changes
  (informational; the app no longer waits on them).
- `app`: `{ importConsentAt, lastImportAt, lastFeedAt, build }`. Written by the app. `importConsentAt` is when website
  orders first came in; the app records it by itself on its first import, in a server-read transaction that keeps a
  day already recorded (`_fbMarkLinkSwitchedOn`), so a device with a stale cache never moves it later.

**Orders come in by themselves.** The app adds every website order it can match for certain without asking: new ones
as sales, ones already entered by hand (same order number, Stripe charge or uid) linked, never counted twice. Anything
unclear waits under **Needs you** (Website orders tab) and on the app's To-do list. Nothing is guessed.

**Books move to the new storage safely.** A book still in the old (Realtime Database) storage is copied into Firestore,
the copy is read back and compared record by record with the old one (`compareCopies`, `src/lib/storage-mode.js`), and
only an identical copy switches the book over (`_fbAdoptBook`); otherwise the copy is removed and the book stays put.
The switch is written to the server before this device uses it; then the old copy is read again, and any sale another
device saved there meanwhile is added through the normal (add-only) save. The old copy is never deleted. The Website
orders card's **Storage check** compares every book's old copy with the new storage as the server holds it (never this
device's cache) and lists any record only the old copy has, with **Copy these over** (add-only) for the owner to decide.

**Keeping watch both ways.**

- **The link going quiet.** The website's heartbeat (`websiteLink/website.at`) is written every five minutes. When it is more
  than an hour old and the device is online, the app's Website orders card says **Website quiet** and its To-do list adds
  *Your website has stopped checking in* (`websiteQuietSince`, `src/lib/website-link.js`), judged only from a heartbeat the
  server confirmed (never from this device's saved copy). A dropped connection, or a publish error that
  needs the owner (rules, old storage), shows on the To-do list too; a one-off failure only shows on the card. The website side already alerts when its own sweep stalls, the connection fails,
  sales can't be sent, or orders wait over a day for the app.
- **New books to match.** Once a book is matched, the website sweep checks once an hour for unmatched, unarchived printed
  editions it can pair by ISBN or exact title (`newMatchList`, the same rule as the panel's `suggestLinks`;
  `inventoryLinkSuggest.parity.test.ts`). It stores them as `newMatches { at, count, items }`. An admin alert
  (`inventory-link-new-books`) and step 2's **New books to match** box offer one-click **Match these** (op `acceptMatches`:
  adds the stored suggestions to the links as saved now and refuses to change any existing match) or **Not these**
  (`ignoredMatches { editionKey: inventoryBookId }`, op `ignoreMatches`). Only open suggestions are offered (`openMatches`:
  edition unmatched, inventory book unused, pair not left out; none once every match is removed).
- **Pre-orders promised.** Rows with `preorder: true` that are not voided, refunded, given away or shipped count as copies
  promised (`promisedPreorders`). The app shows them on the book's strip and under **Pre-orders promised** on the Website
  orders card. They are already taken off on hand.

## Documents in the website project

- `systemStatus/inventoryLink` (admin-read, server-write) holds:
  - `links { [websiteBookId]: { "_" | variantId: inventoryBookId } }`
  - options: `startDay` (can move earlier, never later; a move restarts the past-order backfill), `autoSync`, `rehearsalUntil`
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

## Switching between the apps

Both apps carry the same **Website · Inventory** switch, for the publisher only (the website admin is the owner's alone;
the inventory app shows it only in a publisher session, never in author view). It lives in the website's
`src/app/admin/appSwitch.ts` and the app's `src/lib/app-switch.js`; change both together.

- **Addresses.** Website admin: `https://lyricalmyrical-web-v2.web.app/admin`, an order is `#orders/<orderId>`. Inventory
  app: `https://lyricalmyricalbooks.github.io/lyrical-inventory/`, a website order is `#website-order=<orderId>` (URL-encoded).
  When the inventory app was opened from the website, it sends its deep links to the website origin it came from.
- **Tabs.** The website admin's tab is named `lm-website-admin`, the inventory app's `lm-inventory-app`. A click on the
  other app goes, in order, to the tab this page opened before, else `window.open("", <other name>)` (which also finds the
  tab that opened this one), else a new tab. Never `window.opener.focus()`: browsers ignore a page raising its opener. The
  opener is kept on purpose (same browser group for the name lookup).
- **No reloads.** A deep link changes only the `#fragment`; both apps follow `hashchange` and tidy the hash away once
  handled. The inventory app drops a leftover `?mode=admin` from its address so its address stays what deep links expect.
- **Installed apps** (home screen, the Android app, "Install app"): the plain link opens instead, so the phone hands it to
  the other installed app or a browser tab.
- **Counts.** The website's Inventory half shows `pendingImport.count` (website orders waiting for the app; no badge when
  the link isn't connected). The app's Website half shows website orders paid and not yet sent.
- **Order links.** The website offers "See it in the inventory app" only for orders the link sent (the server's
  `countsForInventory`: real, accepted payment, paid on or after `startDay`). The app offers "Open on the website" on
  website sales.

## One to-do list and new books (25 October 2026)

Each app's to-do list also shows what waits in the other, and a book added in one app is offered to the other.
Everything below is publisher-only, plain words, and never moves stock or money by itself.

### `websiteLink/website.todo` (written by the website on every sweep, replaced whole)

```js
{ at: "ISO", items: [ { id: "stock-held" | "new-matches" | "app-books", count: 2,
  title: "Stock for 2 books waits for your OK on the website", href: "https://<website>/admin#inventory/link" } ] }  // ≤ 10 items
```

The app lists these on its To-do list as they are (text only), each with a button that opens `href` through the app switch.
It shows only items whose `href` is on a website origin. "Website orders not sent yet" is counted by the app itself
(see *Switching between the apps*), not sent here.

### `websiteLink/catalog` (written by the website, at most hourly, replaced whole)

```js
{ v: 1, at: "ISO", books: [ {            // ≤ 200: printed website editions not linked, not archived,
  key: "<bookId>|<variantId or ''>",     // with no match suggestion, not dismissed in the app
  bookId, variantId: null | "…", title, edition: "" | "Signed", author: "", isbn: "",
  price: 40 | null,                       // CAD, the regular price (no sale), null when none
  cover: "https://…" | "",                // a small copy of the first photo
  status: "published" | "draft" | "scheduled",
} ] }
```

The app lists them as **On the website, not in this app yet** with **Add to the app** (opens its Add new book form filled
with title, author, ISBN, price in CA$; the owner adds the print run and saves) and **Not a book for the app** (dismiss).

### `websiteLink/app` additions (written by the app)

```js
todo: { at: "ISO", items: [ { id: "needs-you" | "storage" | "…", count, title: "2 website orders need your decision", hash: "#website-orders" } ] }, // ≤ 10
linkRequests: { "<key>": { inventoryBookId, at: "ISO" } },   // "Add to the app" saved: link this website edition to that book
dismissedShopBooks: { "<key>": "ISO" },                       // "Not a book for the app"
```

- **The website shows `todo` items** as admin alerts with **Open the inventory app** (the app switch, `INVENTORY_APP_URL + hash`).
  It keeps only items whose `hash` is `#` followed by letters, digits, `-`, `_`, `=` (≤ 100), titles ≤ 200 characters, ≤ 10.
  The app handles `#todo` and `#website-orders`.
- **Link requests are applied by the website's sweep** with the same guards as **Match these**: the edition exists, is
  printed and unmatched, the inventory book is in the app's catalog and not matched to anything, and no existing match
  changes. The answer is `websiteLink/website.linkReplies["<key>"] = { inventoryBookId, result: "linked" | "refused",
  reason: "plain sentence", at }` (kept 30 days). A request already answered for the same inventory book is not tried again.
- If the app can't write these keys (its rules not deployed yet), the new book still turns up on the website under
  **New books to match** by its ISBN or exact title.

### Inventory app books not in the shop (website only)

The website's hourly check also lists the app's books that no website edition is matched to, that aren't a match
suggestion and that the owner hasn't marked **Not for the shop** (`systemStatus/inventoryLink.appOnlyBooks
{ at, items: [{ id, title, author, isbn, price, currency }] }`, ≤ 100; `ignoredAppBooks { id: ISO }`). Inventory ›
Inventory app link lists them with **Add to the shop**: a new *draft* book filled with title, author, ISBN and price (when
the app's currency is CA$), matched to that app book once saved (op `linkNewBook`). Nothing is published by itself.
