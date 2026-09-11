# Canada Post Shipping API 8.0.0 — Standing Rules

> [!CAUTION]
> **This API spends money.** Rating answers "what would this cost". Shipping
> *creates real shipments and money-bearing labels* against a real account.
> Treat every change here with more care than a read-only rates lookup: a bug in
> rating shows a wrong number, a bug here buys the wrong postage or quietly
> earns a surcharge.

Pairs with [`canada-post-rating-api.md`](canada-post-rating-api.md) — same
portal, same OAuth app, same conventions. Read that one first.

## 1. The rules, in one place

1. **Never invent a path, field name, media type or scope.** Paths are recorded
   in [`src/lib/canadapost-endpoints.js`](../src/lib/canadapost-endpoints.js).
   Anything not there comes from the app's OpenAPI spec or the portal guides —
   never from memory, a blog post, or a plausible-looking pattern.
2. **REST + JSON only, OAuth 2.0 bearer tokens mandatory** since 2026-04-30.
   Any SOAP/XML shipping example — `davecap/canadapost`, `soa-gw`,
   `/rs/{customer}/ncshipment` — targets the retired service. Disregard it.
3. **A created label is not a finished job.** If the shipment says *manifest
   required*, it must be transmitted before drop-off or Canada Post surcharges
   it. See §4.
4. **Never point automated tests at a Production app.** Test apps return
   stubbed data and never bill. `createShipment`, `transmitShipments` and
   `voidShipment` against production credentials must be behind a deliberate,
   human-approved action — not an environment variable that could be set by
   accident.
5. **App type is immutable.** A Test app cannot become a Production app; you
   create a new one. The **API Secret is shown once, at creation** — it can only
   be reset, never retrieved.
6. **Respect the rate limits** (§6). They differ per product; Rating's headroom
   says nothing about Shipping's.
7. **Your own database is the durable record.** Canada Post keeps shipments and
   manifests for **90 days**. A 404 on an old ID is expected, not a bug.

## 2. Vocabulary — use these words in code and comments

| Term | Meaning |
| :--- | :--- |
| **Shipment** | One physical item Canada Post will carry. |
| **mailedBy** | Path parameter — the billing customer number responsible for payment. |
| **mobo** | "Mailed on behalf of". For a single-merchant shop this is the same customer number; it exists for platforms mailing for many merchants. Opt-in. |
| **Group** | A bucket of shipments bundled for one manifest run. Auto-created; empty ones deleted overnight. |
| **Manifest** | Proof-of-payment document covering a batch, produced by Transmit Shipments. Segregated by payer and by destination geography. |
| **Contract number** | Enterprise shipping agreements only. Not needed for non-contract flows. |

Hierarchy: simple is `Customer → Manifests → Shipments`. Advanced (multi-tenant)
is `Customer → MOBO Customer → Groups → Manifests → Shipments`. This app is the
simple case; keep the advanced parts opt-in.

## 3. Endpoints

Base: `https://api.canadapost-postescanada.ca/prod/devportal-portaildesdeveloppeurs/`
— the path segment is generated per app, so check casing against your own app's
page before assuming a path is wrong.

**Shipping**

| Call | Method & path |
| :--- | :--- |
| Create Shipment | `POST /{mailedBy}/{mobo}/shipments` |
| Get Shipment | `GET /{mailedBy}/{mobo}/shipments/{id}` |
| Get Shipment Price | `GET /{mailedBy}/{mobo}/shipments/{id}/price` |
| Get Shipment Details | `GET /{mailedBy}/{mobo}/shipments/{id}/details` |
| Get Artifact (label) | `GET /artifacts/{consumerId}/shipping/{artifactId}/{index}` |
| Void Shipment | `DELETE /{mailedBy}/{mobo}/shipments/{id}` |
| Request Refund | `POST /{mailedBy}/{mobo}/shipments/{id}/refund` |

**Manifest**

| Call | Method & path |
| :--- | :--- |
| Transmit Shipments | `POST /{mailedBy}/{mobo}/manifests` |
| Get Manifest | `GET /{mailedBy}/{mobo}/manifests/{id}` |
| Get Manifest Details | `GET /{mailedBy}/{mobo}/manifests/{id}/details` |

Returns labels are a **separate API** (Returns 2.0.0), not covered here.

## 4. The workflow, including the step everyone skips

1. **Create Shipment** → shipment id, tracking PIN, artifact link.
2. **Get Artifact** → the printable label. Format is content-negotiated; trust
   the response's own `Content-Type`, do not assume PDF.
3. **Check for "manifest required".** Canada Post signals this inconsistently —
   a boolean on some responses, wording on the label on others — so
   `manifestSignal()` in
   [`canadapost-shipment.js`](../src/lib/canadapost-shipment.js) checks both and
   returns `required` / `not-required` / `unknown`, with **unknown treated as
   required**. A needless manifest costs an extra call; a missed one costs money
   on every parcel it covered.

   > [!IMPORTANT]
   > **A real label prints the ABBREVIATED, bilingual form**, confirmed against
   > an actual Expedited Parcel label:
   >
   > ```
   > MANIFEST NOT REQ
   > MANIFESTE NON REQ
   > ```
   >
   > The first version of this check matched only the spelled-out English
   > "manifest required", so a label reading `MANIFEST REQ` was read as *not*
   > required — the parcel would have shipped untransmitted and earned the exact
   > surcharge the check exists to prevent. Any future change here must keep
   > matching the abbreviation (`REQ`), the French (`REQUIS` / `NON REQ`), and
   > the negation. A manifest check that is reassuring and wrong is worse than
   > none at all.
4. **Transmit Shipments** → manifest.
5. **Get Manifest + Get Artifact** → the document handed to the driver.
6. Optionally Get Shipment Price / Details for records; **Void** before transmit
   if cancelled; **Request Refund** afterwards.

## 5. Authentication

Token endpoint is `POST /oauth2/token` on the gateway. Credentials go in
**headers**, not the body:

```
X-IBM-Client-Id: <client id>
X-IBM-Client-Secret: <client secret>
accept: application/json

scope=merchant&grant_type=client_credentials
```

Response: `token_type` (`Bearer`), `access_token`, `scope`, `expires_in`
(**3600s**), `consented_on`. Use `Authorization: Bearer {access_token}` on every
call; refresh before expiry or calls return 401. Cache the token — never fetch
one per request.

Both proxies (`backend/server.js`, `apps-script/Code.gs`) send the `X-IBM-*`
headers **and** a Basic header, because Basic is what has actually been minting
working tokens against this gateway. Dropping a working mechanism to match a
document exactly is how a live integration goes dark; both agree, so whichever
the gateway reads is correct.

## 6. Rate limits

- Rolling window **60 seconds**; keep **≥250ms between calls**.
- Limits are **per product** — Rating, Shipping and Tracking have separate
  buckets, so the client limiter is keyed by product.
- Test limits may be *lower* than production.
- A throttle rejection ("Server Rejected by SLM Monitor") means **wait 60
  seconds**, not retry immediately.
- Higher limits: `developer.program@canadapost.postescanada.ca`.

## 7. Errors

Shape is `{"messages":[{"code","description"}]}`, same as Rating.

| Code range | Meaning |
| :--- | :--- |
| `AA001`–`AA006` | Authentication — bad or expired key/token |
| `AA007`–`AA010` | Platform registration / authorization |
| `003`–`008` | Tracking / lookup |
| `1128`–`1743` | Validation — missing mandatory fields, bad address, conflicting options |
| `7000`–`7322` | Service / rating — unavailable, weight limits, currency |
| `8064`–`9208` | Shipment operations — creation, transmission, manifest, void |

| Status | Do |
| :--- | :--- |
| `202` | Pending — retry with backoff, minimum 1s |
| `400` | Surface the description; do not retry blindly |
| `401` | Refresh the token, retry **once** |
| `403` | Do not retry — app/customer misconfiguration |
| `404` | Not found, or aged past the 90-day window |
| `500` | Retry with backoff |

`9153` is listed as retry-worthy, but `9153`/`9154` can also mean **no default
payment method on the account** — which no amount of retrying fixes. Retry it a
bounded number of times, then surface it as an account problem.

## 8. The request body — settled by the committed spec

The OpenAPI definition is committed at
[`shipping-api-openapi.yaml`](shipping-api-openapi.yaml). Read field names from
there, never from memory. Points that cost a refused shipment if missed:

- **The spec declares version `1.0.0` / `shipping-service-v1`**, not the 8.0.0
  of the older Web Services product, and the gateway path carries
  **`/shipping/v1`**. Leaving that segment out produces a 404 that reads like a
  credentials problem.
- **The body wraps everything in `deliverySpec`.** Sending a bare delivery spec
  — which this app did — is refused.
- **Exactly one of `transmitShipment: true` or `groupId` is required**, never
  both, never neither. `transmitShipment` sends the shipment for manifesting
  immediately, which is what produces a label marked `MANIFEST NOT REQ` and
  removes the unmanifested surcharge risk entirely. A `groupId` holds it for a
  later manifest run.
- **`deliverySpec.settlementInfo` is required**, and inside it
  `intendedMethodOfPayment` — `CreditCard` (a card saved and defaulted on the
  Canada Post profile), `Account` (an existing contract), or `SupplierAccount`.
- Other required fields: `serviceCode`, `sender`, `destination`,
  `parcelCharacteristics` (`weight`; `dimensions` needs all three of length,
  width, height together), `preferences.showPackingInstructions`;
  `sender.company`, `sender.contactPhone`, `sender.addressDetails.countryCode`
  (always `CA`), and `destination.addressDetails.countryCode`.
- **`printPreferences`** takes `outputFormat` `8.5x11` or `4x6`, and `encoding`
  `PDF` or `ZPL`. The letter-size PDF is what this shop prints.
- The US customs declaration goes under `customs`, never as a top-level
  `declarationId` — sent under the wrong name it is silently dropped.
  **Send it under BOTH spellings the spec declares**, because the spec declares
  two properties on the same `customs` schema for the one value:
  - **`usdeclarationid`** (all lowercase) — the name the create-shipment request
    table documents, in English and French, marked *Conditionally Required*:
    required for US destinations when no Zonos key is on the header.
  - **`usDeclarationId`** (camelCase) — declared further down the same schema as
    the number returned "if you directly submit customs data to Zonos", which is
    exactly the Prepay-app / Zonos-API case.

  Both are declared properties, so sending both is spec-valid; neither can be
  rejected as unknown. Picking one is a silent gamble — an unrecognised name is
  dropped with no error, the label prints, and the duty is simply never prepaid.
- **Who mints the Declaration ID.** Canada Post's integration guide is explicit
  that with a Zonos **Verified Account**, *Canada Post* generates it — the app
  must not, and there is no pre-purchase call to make:

  > 1. You create a shipment as per your normal process.
  > 2. Canada Post generates a Declaration ID.
  > 3. Canada Post links the Declaration ID to your shipment's tracking number.
  > 4. Canada Post issues a shipping label.
  > 5. Using the tracking number and data shared from Canada Post, Zonos pays
  >    CBP directly for the shipment.
  > 6. Zonos invoices you for the duties associated with the tracking number.

  The whole integration is the account key on the request header —
  `X-CPC-Zonos-Key` — which the guide gives verbatim as
  `X-CPC-Zonos-Key=xxxxxxxxxxx`. Never mint an id via Zonos'
  `declarationCreateWorkflow` and send that instead: that mutation belongs to
  Zonos' Landed Cost / Checkout product, and a self-minted id sent on the
  request overrides the one Canada Post links to the tracking number — the link
  that *is* the proof of prepayment.
- `customs.usdeclarationid` is therefore for the OTHER route only: no account
  key, and the declaration bought by hand in the Zonos Prepay app. Both routes
  are legitimate; the account key is the one Canada Post recommends.
- Billing, per the same guide: Zonos invoices after U.S. Customs clears the
  parcel, so there is a lag; a label created but never dispatched is **not**
  charged; a CBP reassessment appears as a "CBP adjustment" on a later invoice.
- The response is **not** documented to echo `customs` back, so a created
  shipment that returns no declaration is the ordinary case, not a failure.
  Treat it as a three-state signal (`issued` / `sent` / `missing`), the same way
  the manifest signal is handled — a warning that fires on every US parcel is one
  nobody reads on the day it is real.
- Sandbox testing: promo code **`DEVPROTEST`** works in the sandbox
  environment, for Xpresspost (`DOM.XP`) and Xpresspost International
  (`INT.XP`) only.

**Reading the response.** It is FLAT — `shipmentId`, `shipmentStatus`,
`trackingPin`, `links` at the top level, no wrapper. `shipmentStatus` is
`created` / `transmitted` / `suspended`. `links` is an array of
`{rel, href, index, mediaType}`; `rel: "label"` is the printable document and
carries an `index` for multi-page labels.

**Two manifest signals better than any label wording**, both from the spec:
`shipmentStatus: "transmitted"` means it is already on a manifest, and a
`rel: "receipt"` link exists *only* for a shipment where no manifest is
required. Both are checked before falling back to the printed wording.

Service and option codes should still be confirmed against the Rating API's
`GET /services` and `GET /options/{optionCode}`, which return the live list,
rather than trusting hardcoded legacy codes.

## 9. Where this lives in this repo

- [`src/lib/canadapost-endpoints.js`](../src/lib/canadapost-endpoints.js) — every path, scope and product bucket.
- [`docs/shipping-api-openapi.yaml`](shipping-api-openapi.yaml) — the authoritative contract. Every field name comes from here.
- [`src/lib/canadapost-shipment.js`](../src/lib/canadapost-shipment.js) — reading a Create Shipment response; manifest-required detection.
- [`src/lib/canadapost-throttle.js`](../src/lib/canadapost-throttle.js) — per-product spacing and the 60s cooldown.
- [`src/lib/canadapost-errors.js`](../src/lib/canadapost-errors.js) — the `messages[]` classifier.
- [`src/lib/canadapost-shipment-diagnosis.js`](../src/lib/canadapost-shipment-diagnosis.js) — tells a field the owner can fix apart from a field name this app got wrong, which is the difference between a five-minute fix and a wasted afternoon.
- [`src/lib/canadapost.js`](../src/lib/canadapost.js) — the client that ties them together.
- `backend/server.js`, `apps-script/Code.gs` — the two proxies and the token exchange. An Apps Script change means bumping the script version and re-syncing `public/gas-code.txt`.

## 10. Sources

Canada Post Developer Portal: Shipping overview, Shipping backgrounder,
Developer guide, Authentication guide, Rate limits, Messages and code tables,
API catalog. Legacy SOAP/XML shipping docs are historical context only — never
implement against them.
