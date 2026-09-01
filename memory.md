# Project Memory: Lyricalmyrical Inventory

This file acts as a persistent memory of the project's architecture, patterns, key decisions, and recent changes.

## 1. Project Overview & Architecture
- **Type**: Progressive Web App (PWA) with offline capabilities.
- **Frontend**: Vanilla JS (Single Page App) in `index.html` and `src/main.js`. No framework/bundler for the client logic, although Vite is used for dev hosting and PWA building.
- **Backend**: Local Node.js server (`backend/server.js`) that persists data to `backend/data/store.json`. No active Firebase cloud backend is required for local running, though Firestore rules exist.
- **Google Sheets Integration**: Integrates with Google Sheets using Apps Script (`apps-script/Code.gs`).
  - **CRITICAL RULE**: Whenever `apps-script/Code.gs` is modified, it must be copied verbatim (no HTML-escaping) to `public/gas-code.txt`. The client fetches it via `loadGasCode()` when opening the "Connect your Google Sheet" tab. Vite's `syncAppsScriptPlugin` also copies it on build/dev change, but the updated file must be committed.

- **Canada Post**: Rating API 4.0.0 (REST+JSON) with mandatory OAuth 2.0 client-credentials bearer tokens; the SOAP/XML service and username:password Basic auth are retired. Standing rules live in `docs/canada-post-rating-api.md` — read it before any Canada Post change.

---

## 2. Key Decisions & Architectural Lessons

### Technical & Performance (from `.jules/bolt.md`)
- **Parallel Network I/O**: When importing or performing bulk operations (such as Firebase RTDB to Firestore migrations or backup restores), avoid sequential `await` inside loops. Use `Promise.all()` to execute network requests concurrently and reduce latency.
- **Unbounded Promises Caution**: Avoid wrapping large mapped arrays directly in `Promise.all()` for major operations, as browsers throttle concurrent connections (approx. 6 per origin). For very large datasets, use a concurrency limiter or chunking to avoid socket exhaustion.

### Accessibility (from `.jules/palette.md`)
- **Icon-Only Buttons**: Always ensure that buttons showing only icons (e.g., trash icons, +/-) have descriptive `aria-label` attributes (e.g., `aria-label="Delete entry"`) so screen readers can interpret them correctly.

### Role & UI/UX Guidelines (from `.agents/AGENTS.md`)
- Adhere to the **Elite UX/UI Architect** guidelines **only when necessary** (when creating, editing, or enhancing user-facing screens and components):
  - Curated HSL or Tailwind-like color systems (no raw defaults like `#ff0000`).
  - Strict theme/dark-mode adaptability.
  - Modern typography pairing (Inter/Outfit/etc. via Google Fonts) and strict font scales.
  - Generous target sizing (at least 44px x 44px for primary interactive elements).
  - Micro-transitions using custom bezier curves (e.g., `transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1)`).

---

## 3. Core Data Schemas & Models

### Book Catalog Object Schema (`BOOKS`)
Each book within the catalog is a structured object mapped by its unique ID. Key fields include:
- `id` (string): Unique identifier (e.g., `'gatsby'`).
- `title` (string): Title of the book (whitespace-trimmed).
- `author` (string): Book author.
- `isbn` (string): ISBN-10 or ISBN-13 identifier (defaults to `'—'`).
- `maxPrint` (number): Max print run capacity (default `100`).
- `listPrice` (number): Default list price (default `40`).
- `currency` (string): Currency symbol (e.g., `'€'`, `'$'`).
- `threshold` (number): Low stock trigger threshold (default `10`).
- `productionCost` (number): Manufacturing/printing cost per unit.
- `pubGratuity` (number) / `authorGratuity` (number): Percentage profit split for the publisher and author.
- `paymentLink` (string): Author-direct or default Paypal/Interac payment link.
- `stripeLink` (string): Stripe Checkout URL for book purchase.
- `acceptedMethods` (array): Configured payment channels for the book (`['stripe', 'paypal', 'interac', 'cash_card']`).
- `useGlobalMethods` (boolean): Flag indicating whether the book inherits payment options from the website level (default `true`).

### Settings Config Keys
The app stores global configurations via Firebase settings and local storage:
- `paymentLinks`: Map of book ID to custom payment link.
- `websitePaymentMethods`: Array of active global website-level payment methods (`['stripe', 'paypal', 'interac', 'cash_card']`).
- `invoiceSettings`: Object containing global invoice sequences, company logos, bank transfer details, and tax defaults.

---

## 4. Key API & Integration Workflows

### Stripe Payment Reconciliation Flow
1. **Sync Action (`reconcileSync`)**: Pulls recent payments using the user's saved Stripe restricted key.
2. **Auto-Matching Rules**:
   - Parses payment descriptions for invoice numbers (e.g. matching `INV-` patterns).
   - Resolves SKU codes mapped to catalog entries.
   - Automatically processes matched items and displays confirmation alerts.
3. **Manual Worklist**:
   - Payments without direct matches are placed in the Reconciliation list.
   - Publishers manually select the corresponding book, adjust quantities, and record the sale (deducting stock and documenting earnings) or dismiss it.

### Big Cartel ↔ Ledger Reconciliation
- **Problem it solves**: the Gmail scan (`fetchOrders` → `applyOne`) was the only intake path for website orders. An order whose confirmation email was filtered, deleted, or older than the `daysBack` window never entered the app at all — no history row, no stock deduction, nothing for a paid shipping label to link to.
- **Comparison**: `src/lib/bigcartel-ledger-gap.js` (pure) compares `fetchAllBigCartelOrders()` output against every order number the ledger knows (`getShippingReconciliationOrders()` + scan-memory `appliedNums`). Runs automatically once after `loadAllBooks()` resolves, cached in `localStorage` for 6 hours, and on demand from the Big Cartel tab.
- **Review queue**: missing orders appear in a panel on the Big Cartel tab; each is added with one click via `commitRecoveredWebsiteOrder()` — the same ledger write path a scanned order takes. Entries carry the **real** storefront order number and the deterministic `bc-<number>` `sheetsId`, so an added order is indistinguishable downstream from a scanned one.
- **Repair**: `findRecoveredOrderConflicts()` matches legacy `#RECOV-` placeholder rows (created by the shipping worklist's older recovery flow) to their real storefront orders, offering a renumber, or a void when the sale is recorded twice.
- **Alarm**: `syncBigCartelShippingPaid` / `triggerBigCartelShippingSync` now count storefront orders with no ledger row and warn, instead of reporting "already up to date" over them.
- **Fixed while here**: both sync loops compared `normalizeShippingOrderNumber(a) === normalizeShippingOrderNumber(b)`, which returns `''` for any number without a hyphen — so two *unidentifiable* orders compared equal and one could overwrite the other's `shippingPaid`. Now guarded by `sameOrderNumber()`.
- **No Apps Script change**: the `proxybigcartel` action already exists (`Code.gs` v35), so no `scriptVersion` bump and no `gas-code.txt` copy was required.

### Google Sheets Real-Time Sync
- Implemented as a bidirectional synchronization flow.
- Writes and appends ledger orders to Google Sheets using Apps Script endpoint calls.
- Runs bulk export tasks in batches to avoid execution timeouts.

### Local-First Persistence & Sync Queue
- Modifying state (updating books, records, cash flow) writes to the local database store (IndexedDB / LocalStorage) immediately to ensure non-blocking client interaction.
- Operations are appended to a sync queue that retries Firestore replication asynchronously, guaranteeing offline resilience.

---

## 5. Troubleshooting & Common Pitfalls

### PWA Caching & Service Worker Refresh
- **Issue**: Cached files are retained by browsers, causing users to see legacy features or missing components.
- **Solution**: Service Worker uses revision hashes in `vite-plugin-pwa` config. On dev deployments, trigger cache-clearing or prompt user reload.

### PowerShell Script Execution Policy (Windows)
- **Issue**: Running commands like `npm run test` or `npx vitest` on Windows PowerShell fails with `UnauthorizedAccess` due to disabled script execution.
- **Solution**: Bypass via `cmd.exe /c "npm run test"`, or temporarily bypass the execution policy:
  ```powershell
  powershell -ExecutionPolicy Bypass -Command "npm run test"
  ```

### Local Mock Backend Storage
- **Issue**: Offline development mode saves local database mock changes to `backend/data/store.json`.
- **Solution**: Ensure Node server (`npm run dev:backend`) is actively running alongside the Vite dev server for backend storage routing to work.

---

## 6. Agent Maintenance Protocol
To ensure this repository remains clean, transparent, and easy to maintain for future sessions, all developer agents must adhere to the following:
1. **Model Schema Updates**: If you add, remove, or modify properties in book objects, transaction ledgers, or global config settings, document the changes in **Section 3 (Core Data Schemas)**.
2. **Integration Updates**: Document any changes made to Stripe reconciliation, Sheets integration, or PWA caches in **Section 4 (Workflows)**.
3. **Setup Workarounds**: If you encounter Windows execution constraints, build issues, or environment mismatches, document the solution under **Section 5 (Troubleshooting)**.

---

## 7. Recent Work & Milestones (June 2026)
- **Payment Methods Configuration**: Enabled configuring accepted payment methods (Stripe, PayPal, Interac, Cash/Card) globally for the website and per-book. Integrated this config with invoice templates, payment QR codes (all-books, single book, author views), backend validation and local-first persistence.
- **Settings Enhancements**: Renamed settings tab to "Settings", simplified the Google Sheets connection flow, and removed obsolete cards.
- **Inline Validation**: Added an unsaved changes indicator and inline validation for the artist payment link.
- **Agent Guidelines**: Added `.agents/AGENTS.md` to define senior UX/UI design system specifications.

---

## 8. Active Constraints & Development Workflow
- **Vite commands**:
  - `npm run dev` to start frontend dev server.
  - `npm run dev:backend` to run local Node backend.
  - `npm run dev:all` to run both frontend and backend concurrently.
  - `npm run build` to build static frontend site.
  - `npm run lint` for ESLint checks.
  - `npm test` for Vitest tests.
