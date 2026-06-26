# Project Memory: Lyricalmyrical Inventory

This file acts as a persistent memory of the project's architecture, patterns, key decisions, and recent changes.

## 1. Project Overview & Architecture
- **Type**: Progressive Web App (PWA) with offline capabilities.
- **Frontend**: Vanilla JS (Single Page App) in `index.html` and `src/main.js`. No framework/bundler for the client logic, although Vite is used for dev hosting and PWA building.
- **Backend**: Local Node.js server (`backend/server.js`) that persists data to `backend/data/store.json`. No active Firebase cloud backend is required for local running, though Firestore rules exist.
- **Google Sheets Integration**: Integrates with Google Sheets using Apps Script (`apps-script/Code.gs`).
  - **CRITICAL RULE**: Whenever `apps-script/Code.gs` is modified, it must be copied verbatim (no HTML-escaping) to `public/gas-code.txt`. The client fetches it via `loadGasCode()` when opening the "Connect your Google Sheet" tab. Vite's `syncAppsScriptPlugin` also copies it on build/dev change, but the updated file must be committed.

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

## 3. Recent Work & Milestones (June 2026)
- **Payment Methods Configuration**: Enabled configuring accepted payment methods (Stripe, PayPal, Interac, Cash/Card) globally for the website and per-book. Integrated this config with invoice templates, payment QR codes (all-books, single book, author views), backend validation and local-first persistence.
- **Settings Enhancements**: Renamed settings tab to "Settings", simplified the Google Sheets connection flow, and removed obsolete cards.
- **Inline Validation**: Added an unsaved changes indicator and inline validation for the artist payment link.
- **Agent Guidelines**: Added `.agents/AGENTS.md` to define senior UX/UI design system specifications.

## 4. Active Constraints & Development Workflow
- **Vite commands**:
  - `npm run dev` to start frontend dev server.
  - `npm run dev:backend` to run local Node backend.
  - `npm run dev:all` to run both frontend and backend concurrently.
  - `npm run build` to build static frontend site.
  - `npm run lint` for ESLint checks.
  - `npm test` for Vitest tests.
