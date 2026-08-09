# CLAUDE.md — lyrical-inventory

## Your job after every change
After completing any code enhancement, end your turn with a short "Next moves" list: 7 genuinely high-value suggestions for improving the app, ranked best-first.
Each suggestion is one or two lines:
- **What** — a concrete, specific action (e.g. "Debounce the catalog search box" instead of "improve performance").
- **Why** — the payoff (e.g. a sale not lost, a faster screen, a bug avoided).
- **Effort** — quick / medium / larger.

Then offer to do the top one right away.

Suggestions must be tied to what just changed or was just discussed — lead with any edge case, offline-sync risk, or obvious next step the edit opened. Regenerate from scratch each turn (never repeat a prior turn's list or anything already declined this session). Name the actual file/function/screen; skip generic best-practice advice. If nothing is genuinely worth doing, say "nothing pressing" and stop.

Angles worth scanning each time: bug/edge case the change introduced · the next logical feature · offline & sync robustness · Firestore data integrity · the speed of a slow screen · keeping catalog and ledger consistent.

### Constraints every suggestion must respect
> [!IMPORTANT]
> - **Vanilla JS:** No framework (no React/Vue/Svelte) and no runtime dependencies. Vite is the bundler and must stay a thin build step — don't add framework runtimes or a heavier toolchain on top of it.
> - **Serverless Backend:** Firebase Firestore database and static hosting on GitHub Pages. No server or secret keys in client code.
> - **Offline Resilience:** Must work fully offline (PWA) and synchronize local queue states later.

## Pull Requests
- When asked for "a new pull request", "new PR", or similar: **create it immediately** from the current branch.
- Do NOT investigate merge status, git history, or ask clarifying questions.
- Action: Push branch with `git push -u origin <branch>` then create PR via GitHub MCP.
- Use a descriptive PR title based on the feature/fix being implemented.
- **After a PR is merged, start the next change on a brand-new branch and open a new PR** — never push commits onto a merged branch to revive it.

## General Principles
- Prefer action over investigation when intent is clear.
- If the user asks for something, assume they know what they want.
- Only ask clarifying questions if the request is genuinely ambiguous.

## Customizations & Style Guidelines
- **Strict Guidelines:** Always adhere to the premium UX/UI, offline-first sync, financial ledger precision, role-based security, and spreadsheet integration rules defined in [.agents/AGENTS.md](.agents/AGENTS.md).

> [!WARNING]
> **Apps Script ↔ client copy must stay in sync.** Whenever [Code.gs](apps-script/Code.gs) changes, copy it **verbatim** (no HTML-escaping) into [gas-code.txt](public/gas-code.txt) — the "Connect your Google Sheet" tab lazy-fetches that file via `loadGasCode()` in [main.js](src/main.js). Don't re-embed the script inline in [index.html](index.html).

> [!WARNING]
> **Bump the script version whenever `Code.gs`'s behavior changes** (new action, changed response shape, changed email/side-effect logic — not comment-only or pure-refactor edits), moving all three together in the same commit:
> 1. `scriptVersion`/`service` strings in the `doGet` capabilities response in [Code.gs](apps-script/Code.gs).
> 2. `EXPECTED_SCRIPT_VERSION` in [main.js](src/main.js) (what flags an out-of-date deployment on the connection card).
> 3. A new entry in the version-history comment block atop [Code.gs](apps-script/Code.gs).
> Skipping this lets a publisher's deployed script silently diverge from what the client expects, with no warning surfaced anywhere.

### Visual Refactoring & UI Enhancement Guardrails
> [!IMPORTANT]
> - **Decouple Styling from Data Pipelines:** When executing UI/UX styling tasks (e.g. `/elite-ux-design`), DO NOT rewrite, replace, or simplify underlying data aggregation functions (such as `buildOrderTimeline`, `deriveOnHand`, or `inventoryBreakdown`). Keep data assembly 100% intact and modify ONLY CSS tokens, HTML wrapper classes, badge elements, and subtext formatting.
> - **Verify Property Key Alignment:** Always inspect the underlying library or helper function output to verify exact property key names (e.g. `row._after` vs `row.after`) before referencing them in template literals.
> - **Defensive Fallback Values:** Never output raw property evaluation in HTML templates without nullish coalescing or safe fallbacks (e.g. `${row._after ?? row.after ?? '—'}`).

## App Overview & Architecture

Lyrical Inventory is a Progressive Web App (PWA) designed for Lyricalmyrical Books to manage book catalogs, sales inventory, consignment partners, invoices, expenses, and event checkouts (POS).

### Key Modules & Capabilities

| Module | Purpose | Key Details |
| :--- | :--- | :--- |
| **Catalog & Stock** | Book inventory management | Tracks list price, native currency, print runs, and stock statuses (`on-hand`, `consigned`, `sold`, etc.) |
| **Consignment** | Store partnership ledger | Handles store commissions, shipments, returns, sales, invoice drafts, and artist payout settlements |
| **POS Checkout** | Live book fairs & checkouts | Event-ready checkout panel supporting multi-currency totals, FX rate conversion, and Stripe QR codes |
| **Order History** | Timeline & stock auditing | Filterable, paginated transaction lists matching direct sales against ledger records |
| **Tax & Expenses** | Cash flow & operations | Tracks operating costs, business trips, subscription schedules, and receipt OCR scans via Gemini API |
