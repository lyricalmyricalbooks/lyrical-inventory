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
   `manifestRequired()` in
   [`canadapost-shipment.js`](../src/lib/canadapost-shipment.js) checks both and
   **treats an ambiguous answer as required**. A needless manifest costs an extra
   call; a missed one costs money on every parcel it covered.
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

## 8. The one thing still unverified

The **exact JSON schema for the Create Shipment request body** — sender,
receiver and parcel field names, required vs optional, service and option code
format — is published only inside the app's OpenAPI spec, which needs a
logged-in portal account.

Until that spec is committed to this repo:

- The payload is built by `buildNonContractShipmentJson()`, whose shape derives
  from the previous API. It is the best available reading, **not a verified
  contract**.
- A rejection in the `1128`–`1743` validation range most likely means a field
  name needs remapping, not that the shop owner typed something wrong — say so
  in the message rather than blaming their address.
- **Action:** follow [`getting-the-shipping-api-spec.md`](getting-the-shipping-api-spec.md)
  — a plain-language walkthrough written for the shop owner — to download the
  Shipping API OpenAPI definition, commit it as
  `docs/shipping-api-openapi.yaml`, and regenerate the request/response shapes
  from it. Verify service and option codes with the Rating API's
  `GET /services` and `GET /options/{optionCode}`, which return the live list,
  rather than trusting hardcoded legacy codes like `DOM.RP`.

## 9. Where this lives in this repo

- [`src/lib/canadapost-endpoints.js`](../src/lib/canadapost-endpoints.js) — every path, scope and product bucket.
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
