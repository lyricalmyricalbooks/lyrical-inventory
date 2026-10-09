# Chit Chats shipping

API reference: https://chitchats.com/docs/api/v1

## Connect

1. Deploy the updated **Apps Script v52** from Connect your Google Sheet. Update the existing web-app deployment, keeping its URL.
2. Open **Tax Centre → Integrations → Chit Chats API**. Enter your numeric Client ID and API access token, enable the service, and save.
3. Use **Test Connection** to verify the selected account. **Use staging account** targets `staging.chitchats.com`; staging needs its own account/token.
4. Open **Shipping**, fill in the destination, package, number of copies and declared value per copy, then choose **Chit Chats** under "Or quote one carrier directly".
5. For parcels leaving Canada, enter the country where the books were printed and check the customs tariff code. Set the expected Chit Chats drop-off date: today or up to a week ahead, on your own calendar.
6. Choose **Buy label** and review the purchase confirmation. Download the official PDF and print it from your PDF viewer. Take the parcel to Chit Chats.

## Behavior

- Rates create an unpaid shipment with `postage_type: unknown` (Chit Chats status `pending`). Asking again for unchanged details reads that draft and re-prices it with `PATCH /shipments/{id}/refresh`; a new draft that comes back without rates gets one refresh too. The quoted figure is the API's `payment_amount`.
- If the saved draft was deleted in Chit Chats it is replaced; if it was bought on the website the app refuses to quote it and points to **Refresh shipments**, so it cannot be bought twice.
- Changing the parcel creates a new draft and deletes the replaced unpaid one (`DELETE /shipments/{id}`, Apps Script v52+). Chit Chats refuses to delete anything with postage, and a draft tied to a saved purchase is never deleted. On v51 the cleanup is skipped silently.
- Only documented create fields are sent: no `order_store`, and customs `line_items` carry `quantity`, `description`, `value_amount`, `currency_code`, `hs_tariff_code` and `origin_country`. Canada and US addresses need a province/state and postal/ZIP code before rates are requested.
- Buying uses `PATCH /shipments/{id}/buy`, followed by GET checks. A purchase intent is saved locally before sending the charge. **Check purchase** reads the same shipment and never repeats the buy request after a lost response or reload.
- A buy that Chit Chats refuses outright (a 4xx such as a low balance, not a timeout or rate limit) charged nothing: the saved intent is released and the draft kept so **Buy label** can be tried again after topping up. A shipment still in `pending` after every check is treated the same way. Anything else stays as **Check purchase**.
- A rejected token (401/403) and an unknown client ID on **Test Connection** (404) get plain messages; other errors show Chit Chats' own message from `error`, `errors` or `message`.
- Only paid shipment states enter the expense ledger. A shipment's `purchase_amount` is only the postage, so the booked cost is the shipment's `payment_amount` when present, otherwise `postage_fee` + `insurance_fee` + `delivery_fee` + `federal_tax` + `provincial_tax`, otherwise `purchase_amount` (all CAD). A delivery fee that appears after drop-off updates the cost on the next refresh. A label with no amounts at all books the price confirmed at purchase, flagged as unconfirmed; with no quote either it is flagged for review. Known orders get a postage link and tracking.
- After a purchase, a charge that differs from the confirmed quote is called out on the Shipping card; the books keep the charged amount.
- Quotes older than an hour can't be bought (Chit Chats charges the current price): the Buy buttons are hidden and the owner is asked to get rates again.
- **Import paid shipments** (Tax Centre) reads the whole account; **Refresh shipments** (Shipping) reads only the last 120 days (`from_date`) once a full import has run. Both use 500-shipment pages and deduplicate by account, environment and shipment ID, with tracking-number matching for existing receipts. The result shows on the Shipping card as well as in Tax Centre.
- Staging records are kept for practice on the device and never mark real orders shipped or enter real expenses.
- **Request refund** asks Chit Chats to refund the label. A request is not a confirmed credit. Choose **Refund arrived** only after the money appears in your account.
- Purchase and shipment recovery records remain on the device if cloud saving fails. Reopening Shipping or reconnecting replays them into the normal saved records without sending a purchase. Downloaded official PDFs are cached in IndexedDB for offline reprints.
- Rates, purchases, imports and refund requests require internet; paid labels already downloaded remain available offline. Device recovery does not reserve an order across multiple devices.

## Proxy and secrets

The static Pages app uses the existing Google Apps Script relay. Requests carry the normal `version: 2` envelope as `text/plain` to avoid a browser CORS preflight. Only documented shipment routes and official PDF-label paths on Chit Chats production/staging hosts are accepted. Redirects are disabled. User-supplied tokens travel in the API's raw `Authorization` header; no credentials are embedded in source. Signed label URLs are excluded from persisted recovery metadata.

## Validation

Carrier, proxy and portal behavior tests use fake credentials and responses. No production label, refund or account charge is part of automated testing. Desktop and portrait phone rendering were checked in both themes. Live authentication and postage still need the owner's account and the deployed Apps Script.
