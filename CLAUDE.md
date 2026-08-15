# CLAUDE.md — lyrical-inventory

## Your job after every change
After completing any code enhancement, end your turn with a short "Next moves" list: 7 genuinely high-value suggestions for improving the app, ranked best-first.

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

## General Principles
- Prefer action over investigation when intent is clear.
- If the user asks for something, assume they know what they want.
- Only ask clarifying questions if the request is genuinely ambiguous.

## Customizations & Style Guidelines
- **Strict Guidelines:** Always adhere to the premium UX/UI, offline-first sync, financial ledger precision, role-based security, and spreadsheet integration rules defined in [.agents/AGENTS.md](.agents/AGENTS.md) and [.agents/skills/ux-designer/SKILL.md](.agents/skills/ux-designer/SKILL.md).
- **Pattern Reference:** Before writing a new list, dropdown, button, pill, table, or empty state, read [.agents/UX_PATTERNS.md](.agents/UX_PATTERNS.md) to reuse existing classes and design patterns before inventing new ones.

### State-of-the-Art UX/UI Architecture & Design Engineering
Any user-facing interface, component, or style change MUST follow the design standards in [.agents/skills/ux-designer/SKILL.md](.agents/skills/ux-designer/SKILL.md):

1. **Perceptual Color Science (OKLCH & P3 Gamut):**
   - Never use raw RGB, plain browser defaults (pure red, blue, green), or legacy HSL.
   - Use **OKLCH** (`oklch(L C H / alpha)`) for mathematically uniform perceptual lightness across light and dark themes.
   - Respect semantic tokens: Emerald/Teal for success, Rose/Coral for danger/errors, Amber for warnings, Indigo/Violet for primary branding.
   - Maintain strict WCAG 2.2 AAA / APCA contrast hierarchy: primary text (≥ 7:1), secondary text (≥ 4.5:1), subtle borders (`oklch(1 0 0 / 0.08)`).
   - Use multi-layered glassmorphism (`backdrop-filter: blur(20px) saturate(190%)`) with diffuse ambient glows instead of harsh solid shadows.

2. **Modern Layout Engine (Container Queries, Subgrid & Popover API):**
   - **Container Queries:** Components must adapt to their immediate parent container (`container-type: inline-size`), not viewport media queries.
   - **CSS Subgrid:** Align columns across distinct cards or nested rows using `grid-template-columns: subgrid`.
   - **Native Popover API & `:has()`:** Use native HTML `popover="auto"` and `popovertarget` for tooltips, dropdowns, and menus to eliminate z-index bugs; use `:has()` for parent-aware component states.

3. **Liquid Motion & Spring Physics:**
   - **View Transitions:** Use `document.startViewTransition()` for smooth layout morphing during tab switches, filtering, and modal launches.
   - **Spring Physics:** Never use linear animations. Apply physical spring curves (`--ease-spring: cubic-bezier(0.16, 1, 0.3, 1)` and `--ease-bounce: cubic-bezier(0.34, 1.56, 0.64, 1)`).
   - **Micro-Interactions:** Interactive elements must have fluid hover (`translateY(-2px)`), active (`scale(0.975)`), and `:focus-visible` feedback.
   - **Accessibility:** Always wrap motion in `@media (prefers-reduced-motion: reduce)` with instant transitions.

4. **Cognitive Ergonomics & Human Interface Science:**
   - **Fitts's Law:** Minimum interactive bounding box of **≥ 44px × 44px** with generous hit padding (`padding: 10px 18px`).
   - **Miller's Chunking:** Segment dense data/ledgers into scannable cards with distinct section headings.
   - **Doherty Threshold & Zero Perceived Latency:** Use optimistic UI updates and custom shimmer skeleton loaders matching exact content dimensions (never use generic spinner GIFs).
   - **Zero Blank States:** Empty tables and lists must include custom iconography, helpful conversational context, and an explicit call-to-action button.

5. **Financial & Data Engineering Invariants:**
   - **Tabular Figures (`tnum`):** All monetary figures, quantities, stock balances, and timestamps must use monospace tabular numbers (`font-feature-settings: "tnum" 1, "zero" 1` or `font-family: 'DM Mono', monospace`) for perfect vertical alignment.
   - **Decouple Styling from Data Pipelines:** DO NOT rewrite, simplify, or refactor underlying data aggregation functions (`buildOrderTimeline`, `deriveOnHand`, `inventoryBreakdown`). Keep data assembly 100% intact and modify ONLY CSS tokens, HTML wrapper classes, badge elements, and subtext formatting.
   - **Defensive Fallbacks:** Always wrap dynamic template outputs with nullish coalescing (`${row.after ?? row._after ?? '—'}`) to prevent `'undefined'` text rendering.
   - **Property Alignment:** Always verify exact property key names against underlying models before referencing them in template literals.

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
