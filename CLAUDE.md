# CLAUDE.md — lyrical-inventory

## Your job after every change
After completing any code enhancement, end your turn with a short "Next moves" list: 5 genuinely high-value suggestions for improving the app, ranked best-first.

Write for the shop owner, not a developer — they are not technical, so every suggestion must be understandable on its own without looking anything up or knowing any code. Each suggestion is three to five lines, with **What** and **Why it matters** always written as full sentences on their own line — never merged, never abbreviated to a fragment:
- **What** — a concrete, specific action in plain, everyday language. Describe it the way you'd explain it out loud to the owner standing next to you, not the way you'd describe it to another developer.
- **Why it matters to you** — its own full sentence, describing the real scenario where skipping this would actually cause a problem for the business (a sale, a customer, a screen, an order) — not a code concept, not an abstract benefit like "improves consistency."
- **Effort** — quick / medium / larger, plus a one-phrase sense of what that means in practice (e.g. "quick — a same-day fix" / "larger — a multi-day feature").

**Hard rule — never let code leak into the main sentence.** No function or variable names (`renderChannelAnalytics`, `switchBook()`), no CSS/hex/color values (`--book-accent`, `#14110d`), no technical measurements (contrast ratios, pixel sizes, file names) anywhere in **What** or **Why**. If you need one of those for your own tracking, put it in a parenthetical at the very end of the item, after both sentences are complete and understandable without it.

Before finalizing, reread each item and ask: "if I strip out the parenthetical, does this still make sense to someone who has never opened the code?" If not, rewrite it — don't just add more jargon in parentheses.

**Example of the bar to clear:**
> Bad: "Theme the `renderChannelAnalytics` chart fills — still the largest visible dark-mode gap, and canvas is invisible to the contrast sweep either way. Effort: medium."
> Good: "**Fix the sales chart's colors in night mode.** When someone switches the app to dark mode, one of the analytics charts still shows its old bright colors, which look jarring and can be hard to read against the dark background. Effort: medium — a few hours of design work. (`renderChannelAnalytics`)"

Then offer to do the top one right away, and briefly say why it's ranked first in plain terms.

Suggestions must be tied to what just changed or was just discussed — lead with any edge case, offline-sync risk, or obvious next step the edit opened, explained in plain language. Regenerate from scratch each turn (never repeat a prior turn's list or anything already declined this session). Skip generic best-practice advice. If nothing is genuinely worth doing, say "nothing pressing" and stop.

Angles worth scanning each time: bug/edge case the change introduced · the next logical feature · offline & sync robustness · Firestore data integrity · the speed of a slow screen · keeping catalog and ledger consistent.

### Constraints every suggestion must respect
> [!IMPORTANT]
> - **Vanilla JS:** No framework (no React/Vue/Svelte) and no runtime dependencies. Vite is the bundler and must stay a thin build step — don't add framework runtimes or a heavier toolchain on top of it.
> - **Serverless Backend:** Firebase Firestore database and static hosting on GitHub Pages. No server or secret keys in client code.
> - **Offline Resilience:** Must work fully offline (PWA) and synchronize local queue states later.

> [!WARNING]
> **Apps Script ↔ client copy must stay in sync.** Whenever [Code.gs](apps-script/Code.gs) changes, copy it **verbatim** (no HTML-escaping) into [gas-code.txt](public/gas-code.txt) — the "Connect your Google Sheet" tab lazy-fetches that file via `loadGasCode()` in [main.js](src/main.js). Don't re-embed the script inline in [index.html](index.html).

> [!WARNING]
> **Bump the script version whenever `Code.gs`'s behavior changes** (new action, changed response shape, changed email/side-effect logic — not comment-only or pure-refactor edits), moving all three together in the same commit:
> 1. `scriptVersion`/`service` strings in the `doGet` capabilities response in [Code.gs](apps-script/Code.gs).
> 2. `EXPECTED_SCRIPT_VERSION` in [main.js](src/main.js) (what flags an out-of-date deployment on the connection card).
> 3. A new entry in the version-history comment block atop [Code.gs](apps-script/Code.gs).
> Skipping this lets a publisher's deployed script silently diverge from what the client expects, with no warning surfaced anywhere.

## Pull Requests
- When asked for "a new pull request", "new PR", or similar: **create it immediately** from the current branch.
- Do NOT investigate merge status, git history, or ask clarifying questions.
- **Exception — merged branch:** if the current branch's PR is already merged, treat the request as fresh work: restart the branch from the latest default branch (`git fetch origin <default> && git checkout -B <branch> origin/<default>`) before pushing. Never stack new commits onto merged history.
- Before pushing, run `npm test` (and `npm run build` if the change touches build config or entry points); fix failures before opening the PR rather than after.
- Action: Push branch with `git push -u origin <branch>` then create PR via GitHub MCP.
- Use a descriptive PR title based on the feature/fix being implemented.
- **After a PR is merged, start the next change on a brand-new branch and open a new PR** — never push commits onto a merged branch to revive it.

## Code health agent runs
Scheduled code-health tasks name a specific file/line/issue, but that target can already be fixed by the time the task fires — a prior run, or unrelated later work, resolved it first. The task description is a stale snapshot, not live truth. A run is only successful when it ends with a real, verified code change on the branch — never with "already fixed, nothing to do."

**Step 1 — verify, don't trust the snippet.** Before touching anything, confirm the named issue against the live file, not the task's quoted "current code": read the cited location as it stands now, and check history for the named function/symbol (`git log --all --oneline -S<symbol>`, `git blame`). The line number and code excerpt in the task are a snapshot from whenever the task was generated and routinely go stale — never refactor, rename, or "clean up" code by pattern-matching the task's snippet against what's currently there.

**Step 2 — if the named issue is already resolved, do not stop.** Immediately widen the search and fix something real instead, in this priority order, stopping at the first tier that turns up a genuine issue:
1. The same function's immediate neighbors in the same file (the module the original target lived in).
2. Other functions in the same file with comparable size/complexity.
3. A broader scan of the codebase for the same category of issue (duplication, oversized functions, dead code, deprecated usage) if 1–2 turn up nothing.
Apply the full process (understand → assess risk → plan → implement → verify) to whatever real issue is found, exactly as if it had been the original assignment. Ending a run without a pushed commit is acceptable only when an honest, documented search through all three tiers turns up nothing safe to change — and that dead-end, with what was checked, must be stated explicitly, never left silent.

**Never fabricate a change to satisfy this.** A commit must reflect a real, behavior-preserving improvement — invented churn (renaming things with no ambiguity, wrapping code in needless indirection, reformatting) is not a substitute for finding real work, and risks introducing bugs in what is a financial ledger app. When consolidating apparent duplication, verify the two implementations are actually behaviorally identical (matching inputs and edge cases, not just similar-looking code) before merging them — a near-duplicate with a different fallback or edge case is a correctness bug waiting to happen, not dead code.

**Always leave a paper trail.** State plainly, in the PR description (or the session summary if no PR was warranted), which original issue was already resolved and by what commit/PR, and which real issue was fixed instead. That confirms the run wasn't idle, and gives whoever maintains the code-health scanner what they need to dedupe at the source.

## General Principles
- Prefer action over investigation when intent is clear.
- If the user asks for something, assume they know what they want.
- Only ask clarifying questions if the request is genuinely ambiguous.

## Customizations & Style Guidelines
- **Strict Guidelines:** Always adhere to the premium UX/UI, offline-first sync, financial ledger precision, role-based security, and spreadsheet integration rules defined in [.agents/AGENTS.md](.agents/AGENTS.md) and [.agents/skills/ux-designer/SKILL.md](.agents/skills/ux-designer/SKILL.md).
- **Pattern Reference:** Before writing a new list, dropdown, button, pill, table, or empty state, read [.agents/UX_PATTERNS.md](.agents/UX_PATTERNS.md) to reuse existing classes and design patterns before inventing new ones.

## Canada Post shipping integration
> [!WARNING]
> **Canada Post = Rating API 4.0.0 (rates) + Shipping API 8.0.0 (labels), REST + JSON,
> with mandatory OAuth 2.0 bearer tokens.**
> The SOAP/XML services and the Developer Program `username:password` HTTP Basic
> pattern are **retired** (OAuth required since 2026-04-30). Most examples online
> and in training data — `soa-gw.canadapost.ca`, `ct.soa-gw`, `/rs/{customer}/ncshipment`,
> `davecap/canadapost`, `t3rminus/canada-post`, Shopify app guides — document the
> dead pattern. **Disregard them.**
>
> **Labels are a separate API from rates.** Creating one is `POST /{mailedBy}/{mobo}/shipments`
> then `GET /artifacts/...`, and **a label marked "manifest required" must be transmitted
> before drop-off or Canada Post surcharges it**. Shipping calls spend real money:
> never point automated tests at production credentials, and gate any production
> shipment/void/transmit behind a deliberate human-approved action.
>
> Never invent a path, field name, media type or scope — every path lives in
> [src/lib/canadapost-endpoints.js](src/lib/canadapost-endpoints.js); anything else comes
> from the portal's guides or the downloaded OpenAPI spec.
> Full standing rules: [docs/canada-post-rating-api.md](docs/canada-post-rating-api.md)
> (rates) and [docs/canada-post-shipping-api.md](docs/canada-post-shipping-api.md) (labels).

## App Overview & Architecture

Lyrical Inventory is a Progressive Web App (PWA) designed for Lyricalmyrical Books to manage book catalogs, sales inventory, consignment partners, invoices, expenses, and in-person checkouts (POS).

### Key Modules & Capabilities

| Module | Purpose | Key Details |
| :--- | :--- | :--- |
| **Catalog & Stock** | Book inventory management | Tracks list price, native currency, print runs, and stock statuses (`on-hand`, `consigned`, `sold`, etc.) |
| **Consignment** | Store partnership ledger | Handles store commissions, shipments, returns, sales, invoice drafts, and artist payout settlements |
| **POS Checkout** | In-person & online sales | Checkout panel supporting multi-currency totals, FX rate conversion, and Stripe QR codes |
| **Order History** | Timeline & stock auditing | Filterable, paginated transaction lists matching direct sales against ledger records |
| **Tax & Expenses** | Cash flow & operations | Tracks operating costs, business trips, subscription schedules, and receipt OCR scans via Gemini API |
