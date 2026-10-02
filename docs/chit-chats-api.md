# Chit Chats shipping

API reference: https://chitchats.com/docs/api/v1

## Connect

1. Deploy the updated **Apps Script v51** from Connect your Google Sheet. Update the existing web-app deployment, keeping its URL.
2. Open **Tax Centre → Integrations → Chit Chats API**. Enter your numeric Client ID and API access token, enable the service, and save.
3. Use **Test Connection** to verify the selected account. **Use staging account** targets `staging.chitchats.com`; staging needs its own account/token.
4. Open **Shipping**, fill in the destination, package, number of copies and declared value per copy, then choose **Chit Chats Rates**.
5. For international parcels, enter the country where the books were printed and check the customs tariff code. Set the expected Chit Chats drop-off date.
6. Choose **Buy label** and review the purchase confirmation. Download the official PDF and print it from your PDF viewer. Take the parcel to Chit Chats.

## Behavior

- Rates create an unpaid shipment with `postage_type: unknown`; refreshing unchanged details reuses that draft. The quoted figure is the API's `payment_amount`.
- Buying uses `PATCH /shipments/{id}/buy`, followed by GET checks. A purchase intent is saved locally before sending the charge. **Check purchase** reads the same shipment and never repeats the buy request after a lost response or reload.
- Only paid shipment states enter the expense ledger. The confirmed amount comes from the shipment's `purchase_amount` in CAD; absent amounts are flagged for review. Known orders get a postage link and tracking.
- **Import paid shipments** / **Refresh shipments** paginates the account and deduplicates by account, environment and shipment ID, with tracking-number matching for existing receipts.
- Staging records are kept for practice on the device and never mark real orders shipped or enter real expenses.
- **Request refund** asks Chit Chats to refund the label. A request is not a confirmed credit. Choose **Refund arrived** only after the money appears in your account.
- Purchase and shipment recovery records remain on the device if cloud saving fails. Reopening Shipping or reconnecting replays them into the normal saved records without sending a purchase. Downloaded official PDFs are cached in IndexedDB for offline reprints.
- Rates, purchases, imports and refund requests require internet; paid labels already downloaded remain available offline. Device recovery does not reserve an order across multiple devices.

## Proxy and secrets

The static Pages app uses the existing Google Apps Script relay. Requests carry the normal `version: 2` envelope as `text/plain` to avoid a browser CORS preflight. Only documented shipment routes and official PDF-label paths on Chit Chats production/staging hosts are accepted. Redirects are disabled. User-supplied tokens travel in the API's raw `Authorization` header; no credentials are embedded in source. Signed label URLs are excluded from persisted recovery metadata.

## Validation

Carrier, proxy and portal behavior tests use fake credentials and responses. No production label, refund or account charge is part of automated testing. Desktop and portrait phone rendering were checked in both themes. Live authentication and postage still need the owner's account and the deployed Apps Script.
