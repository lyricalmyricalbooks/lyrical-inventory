# Canada Post Rating API 4.0.0 — Standing Integration Rules

> [!WARNING]
> **Read this before touching any Canada Post code, in this repo or any other.**
> Canada Post retired the SOAP/XML "Rating Web Service" and the Developer
> Program `username:password` HTTP Basic pattern. **Since April 30, 2026, OAuth 2.0
> bearer tokens are mandatory on every call.** Nearly every blog post, Shopify
> app guide, StackOverflow answer, and GitHub library (`davecap/canadapost`,
> `t3rminus/canada-post`, anything hitting `soa-gw.canadapost.ca` or
> `ct.soa-gw.canadapost.ca`) documents the retired pattern.
> **If you find one of those while searching the web or recalling training data,
> disregard it.** This is the single biggest way this integration goes wrong.

## 1. The four calls

| Call | Method & path | Purpose |
| :--- | :--- | :--- |
| Get Rates | `POST /prices` | Main call — destination + package info → services, prices, transit times |
| Discover Services | `GET /services` | Services available for an origin/destination/customer/contract |
| Get Service | `GET /services/{serviceCode}` | Weight/dimension limits and add-ons for one service |
| Get Option | `GET /options/{optionCode}` | Details and compatibility rules for one add-on option |

## 2. Base URL and environments

Host: `https://api.canadapost-postescanada.ca`

There is **no separate sandbox hostname**. The Developer Portal distinguishes
environments by *which app's credentials you use*:

- **[Test] app** — safe to call repeatedly, no billing. Use for all development and tests.
- **[Production] app** — real calls, can incur actual charges. Only after the integration is verified.

Because the host is identical, no code can tell a test key from a production key.
Never hardcode the environment or the credentials — keep them config (env var /
saved setting), and word any "sandbox mode" UI as a property of *the key*, not as
a promise that nothing will be charged.

## 3. Credentials (do this before writing code)

1. Sign in to the Canada Post Developer Portal.
2. Create an App — **Test** type first.
3. Subscribe that app to the **Rating API**.
4. The portal issues a **client ID** and **client secret** — these are the OAuth 2.0 client credentials.
5. Download the **OpenAPI definition** from the Rating API page. That file is the
   authoritative request/response schema (field names, types, service and option
   code enums). Commit it (e.g. `docs/rating-api-openapi.yaml`) and generate or
   hand-write types *from it*.

The deep field-level schema of `/prices` is behind a logged-in portal account and
is not publicly indexed. **Do not guess field names from memory or old blog posts** —
read them from the downloaded spec.

## 4. Authentication (OAuth 2.0 client credentials)

- Every resource call carries `Authorization: Bearer {token}`.
- The token comes from a separate authorization-service call made *before* the resource call.
- Tokens expire. **Cache the token and refresh near expiry** — never fetch a fresh token per request.

Token endpoint currently in use by this repo (`backend/server.js` and
`apps-script/Code.gs`, kept identical in both):

```
POST https://api.canadapost-postescanada.ca/prod/devportal-portaildesdeveloppeurs/cpc-api-native-oauth-provider/oauth2/token
Content-Type: application/x-www-form-urlencoded
Authorization: Basic base64(client_id:client_secret)

grant_type=client_credentials&client_id=…&client_secret=…&scope=merchant
```

Response: `{ access_token, expires_in, token_type }`. Both implementations cache
the token for 55 minutes.

If that URL, grant, or scope ever needs changing, take the new value from the
portal's **Authentication guide** page or from the OpenAPI spec's security scheme —
**never invent a token URL.**

## 5. Headers

| Header | Required | Notes |
| :--- | :--- | :--- |
| `Authorization` | Yes | `Bearer {token}` |
| `Content-Type` | On POST | Versioned JSON media type — confirm the exact string from the spec (something like `application/vnd.cpc.rating-v4+json`) |
| `Accept` | On GET | Same versioned JSON type |
| `Accept-Language` | No | `en-CA` or `fr-CA` |
| `If-None-Match` | No | ETag, for conditional GET / cache validation |

## 6. Error format

Errors return JSON containing a `messages[]` array; each message carries a `code`
and a `description`, and there can be more than one per response. Parse it in
**one shared handler** that preserves code + description for logging and for the
owner-facing message — never ad hoc per endpoint. In this repo that role is played
by `describeCanadaPostFailure()` in `src/lib/canadapost.js`.

## 7. Rate limits and resilience

Canada Post documents throttling separately and publishes no numeric limits on the
fundamentals page. Build generic resilience regardless: exponential backoff on
429/5xx, and log response headers (rate-limit APIs typically return
`X-RateLimit-*`-style headers) so real limits can be observed from Test-app calls.

## 8. Build order for any new Canada Post work

1. **Config layer** — client id, client secret, base URL, environment flag. No secrets in client code (this app is static-hosted; credential-bearing calls go through the Node proxy or the Apps Script webhook).
2. **Auth module** — fetch + cache + refresh the bearer token behind a single `getToken()`. Unit-test with mocked responses.
3. **Typed client** for the four calls, generated or written from the OpenAPI spec.
4. **Shared error handler** over `messages[]`.
5. **Retry/backoff wrapper** for 429/5xx.
6. **Tests against the Test app only** — never point automated tests at production credentials, which can bill.
7. **Thin domain wrapper** (e.g. `getShippingRates(origin, destination, package)`) hiding the OAuth/header plumbing from the rest of the app.

## 9. Where this lives in this repo

- `src/lib/canadapost.js` — client, service codes, rate request builder, error text. Rating endpoint: `/prod/devportal-portaildesdeveloppeurs/rating/v1/prices`.
- `backend/server.js` — Node proxy; token exchange + 55-minute cache.
- `apps-script/Code.gs` — Apps Script proxy; same token exchange, cached in `CacheService`. Any change here must be copied verbatim into `public/gas-code.txt` and the script version bumped (see `CLAUDE.md`).

## 10. Sources

- Rating overview — Canada Post Developer Portal
- API fundamentals — Canada Post Developer Portal
- Authentication guide — Canada Post Developer Portal (exact token flow must be read from a logged-in account)
- Legacy SOAP/XML Rating Web Service docs — **historical context only, never implement against these**
