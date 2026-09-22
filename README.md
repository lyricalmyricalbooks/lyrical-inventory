# Lyricalmyrical Inventory

Inventory, sales and bookkeeping for Lyricalmyrical Books: a point-of-sale for
markets and fairs, per-book ledgers, consignment, author payouts, invoices,
shipping labels, receipts and the tax centre.

It is an offline-first Progressive Web App. It works with no signal and syncs
when the connection comes back.

## How it fits together

| Piece | What it is |
| --- | --- |
| **App** | Vanilla JavaScript, no framework. The code is in `index.html`, `src/main.js`, `src/features/*.js` (the larger screens) and `src/lib/*.js` (pure logic, each with tests). Vite bundles it and builds the service worker. |
| **Data** | Firebase: **Firestore** (books under `books/{bookId}/data/{part}`, config under `settings/{name}`), the **Realtime Database** (older fallback), **Auth** (Google sign-in) and **Storage** (receipt files). The SDK is loaded from `www.gstatic.com` in `src/firebase.js` and precached so the app starts offline. |
| **Offline saving** | Changes show on screen at once, then save to Firestore. When the device is offline, the latest state of each book waits in an on-device queue and uploads later. If another device changed the same book in the meantime, the two versions are merged, not overwritten. |
| **Outside services** | Canada Post, Big Cartel and outgoing email go through your deployed Google Apps Script (`apps-script/Code.gs`). Stripe, the Gmail receipt finder and AI receipt scanning are called from the browser. |
| **Hosting** | GitHub Pages. `.github/workflows/deploy.yml` builds and publishes on every push to `main`. |
| **Access rules** | `firestore.rules`, `database.rules.json`, `storage.rules`. Only the publisher account reads everything. An author reads and writes only their own book, plus the few settings their screens need. |

`backend/server.js` is a **local development helper only**. When the app runs
on `localhost`, it relays Canada Post, Zonos and newsletter sends. Nothing in
production uses it, and it never holds book data.

## Run it locally

Needs Node 22 or newer (see `.nvmrc`).

```bash
npm ci
npm run dev            # the app, at http://localhost:5173
npm run dev:all        # the app plus the local API helper (for Canada Post / Zonos / campaign sends)
```

To use the helper, copy `backend/.env.example` to `backend/.env` and fill in
the values it asks for.

## Checks

Run these before pushing. CI (`.github/workflows/ci.yml`) runs all of them on
every pull request except `lint:tokens`:

```bash
npm run lint           # ESLint
npm run lint:contrast  # text contrast in both light and dark themes
npm run lint:tokens    # stylesheets don't add new hard-coded design values
npm test               # Vitest (jsdom)
npm run build          # production build + service worker
```

## Deploying

- **The app:** merge to `main`. The Pages workflow does the rest.
- **Access rules:** the Pages deploy does *not* publish them. After changing any
  of the three rules files, publish them with the Firebase CLI:
  `firebase deploy --only firestore:rules,database,storage`. You can also paste
  each file into the Firebase console.
- **Apps Script:** when `apps-script/Code.gs` changes, the build copies it to
  `public/gas-code.txt`. Paste it into your Apps Script project and redeploy.
  See `CLAUDE.md` for the version-bump rule.

## More

- `CLAUDE.md`: project rules for anyone (or any AI assistant) changing the code.
- `memory.md`: architecture notes, data shapes and past decisions.
- `.agents/`: design system, UX patterns and the offline-sync and ledger rules.
- `docs/`: Canada Post integration rules and feature plans.
