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

Any user-facing interface, component, or style change MUST follow the full `/elite-ux-design` standards below.

---

#### 1. Perceptual Color Science & Visual Engine (OKLCH, P3 Gamut & APCA)

**A. Perceptually Uniform Color Architecture (OKLCH)**
Never rely on RGB or legacy HSL where hue shifts distort perceived luminance. Use **OKLCH** (`oklch(L C H / alpha)`) for mathematically uniform perceptual lightness across light/dark themes:

```css
:root {
  --surface-canvas: oklch(0.14 0.02 260);
  --surface-base: oklch(0.18 0.025 260);
  --surface-raised: oklch(0.22 0.03 260);
  --surface-overlay: oklch(0.28 0.035 260 / 0.7);
  --surface-glass: oklch(0.20 0.025 260 / 0.65);

  --border-subtle: oklch(1 0 0 / 0.08);
  --border-active: oklch(1 0 0 / 0.16);
  --border-glow: oklch(0.65 0.24 270 / 0.35);

  --brand-primary: oklch(0.62 0.22 265);
  --brand-accent: oklch(0.68 0.24 300);
  --brand-glow: oklch(0.62 0.22 265 / 0.25);

  --success: oklch(0.72 0.19 155);
  --success-bg: oklch(0.72 0.19 155 / 0.12);
  --warning: oklch(0.78 0.18 75);
  --warning-bg: oklch(0.78 0.18 75 / 0.12);
  --danger: oklch(0.65 0.22 25);
  --danger-bg: oklch(0.65 0.22 25 / 0.12);

  --text-primary: oklch(0.98 0.005 260);
  --text-secondary: oklch(0.78 0.015 260);
  --text-muted: oklch(0.58 0.02 260);
}
```

**B. WCAG 3.0 APCA Contrast Thresholds**
- **Lc >= 90**: Fine print, secondary labels, monospace tabular data (< 14px or font-weight < 400).
- **Lc >= 75**: Standard body copy (16px regular / 14px medium).
- **Lc >= 60**: Section headers (> 24px regular / > 18px bold) and primary interactive button labels.
- **Lc >= 45**: Non-text icons, active border boundaries, decorative chips. Never render content under Lc 30.

**C. Relative Color Blending (`color-mix` & `light-dark`)**
```css
:root {
  color-scheme: light dark;
  --surface-primary: light-dark(#ffffff, oklch(0.14 0.02 260));
  --text-primary: light-dark(oklch(0.18 0.02 260), oklch(0.98 0.005 260));
  --brand-surface-tint: color-mix(in oklab, var(--brand-primary) 12%, transparent);
  --brand-hover-border: color-mix(in oklch, var(--brand-primary) 80%, white);
}
```

**D. Glassmorphism & Inset Edges**
```css
.glass-panel {
  background: var(--surface-glass);
  backdrop-filter: blur(20px) saturate(190%);
  -webkit-backdrop-filter: blur(20px) saturate(190%);
  border: 1px solid var(--border-subtle);
  box-shadow:
    0 1px 2px oklch(0 0 0 / 0.12),
    0 8px 24px -4px oklch(0 0 0 / 0.25),
    inset 0 1px 0 oklch(1 0 0 / 0.10);
}
```

---

#### 2. Modern CSS Specifications & Platform Primitives (2025/2026)

**A. CSS Anchor Positioning**
Anchor tooltips, popovers, and contextual menus directly to trigger elements without fragile JavaScript positioning:
```css
.action-trigger { anchor-name: --action-menu-anchor; }
.action-popover {
  position: fixed;
  position-anchor: --action-menu-anchor;
  top: anchor(bottom);
  left: anchor(start);
  position-try-fallbacks: flip-block, --flip-inline;
  margin-top: 4px;
}
@position-try --flip-inline { left: auto; right: anchor(end); }
```

**B. Native Auto-Expanding Fields (`field-sizing: content`)**
Replace JavaScript `scrollHeight` hacks with native field auto-sizing:
```css
textarea.auto-expanding-input {
  field-sizing: content;
  min-height: 2.5lh;
  max-height: 12lh;
}
```

**C. Native Popover API & `<dialog>` with Discrete Transitions**
Use the native HTML top-layer to prevent z-index wars and handle light-dismiss natively:
```html
<button popovertarget="order-filter-menu" class="btn btn-secondary">Filter</button>
<div id="order-filter-menu" popover="auto" class="filter-popover"><!-- Content --></div>
```
```css
[popover] {
  opacity: 0;
  transform: translateY(-8px) scale(0.96);
  transition:
    opacity 0.2s cubic-bezier(0.16, 1, 0.3, 1),
    transform 0.2s cubic-bezier(0.16, 1, 0.3, 1),
    display 0.2s allow-discrete,
    overlay 0.2s allow-discrete;
}
[popover]:popover-open { opacity: 1; transform: translateY(0) scale(1); }
@starting-style {
  [popover]:popover-open { opacity: 0; transform: translateY(-8px) scale(0.96); }
}
```

**D. Background Lockdown with `inert`**
Lock interaction, focus traversal, and assistive technology for background DOM when modals are open:
```javascript
function openModal(dialogEl) {
  document.getElementById('main-content').inert = true;
  dialogEl.showModal();
}
function closeModal(dialogEl) {
  dialogEl.close();
  document.getElementById('main-content').inert = false;
}
```

**E. High-Density Rendering (`content-visibility`)**
Keep dense tables and ledger grids scrolling at 60/120fps by skipping layout/paint for off-screen rows:
```css
.data-table tbody tr {
  content-visibility: auto;
  contain-intrinsic-size: auto 44px;
}
```

**F. Container Queries & Subgrid Alignment**
Components must adapt to their immediate parent container rather than viewport dimensions:
```css
.card-container { container-type: inline-size; container-name: card; }
@container card (min-width: 480px) {
  .card-layout { display: grid; grid-template-columns: auto 1fr auto; gap: 1.25rem; }
}
.card-subgrid { display: grid; grid-template-columns: subgrid; grid-column: 1 / -1; align-items: center; }
```

**G. Fluid Typography & Balanced Text Wrapping**
```css
.section-headline { font-size: clamp(1.25rem, 1rem + 1.2cqi, 2rem); text-wrap: balance; }
.section-summary { font-size: clamp(0.875rem, 0.8rem + 0.4cqi, 1.0625rem); line-height: 1.55; text-wrap: pretty; }
```

---

#### 3. Liquid Motion, Spring Kinetics & Micro-Interactions

**A. Physics-Based Damped Spring Curves**
```css
:root {
  --ease-spring: cubic-bezier(0.16, 1, 0.3, 1);
  --ease-bounce: cubic-bezier(0.34, 1.56, 0.64, 1);
  --ease-out: cubic-bezier(0, 0, 0.2, 1);
}
.interactive-target {
  transition: transform 0.2s var(--ease-spring), box-shadow 0.25s var(--ease-spring), background-color 0.15s var(--ease-out);
}
.interactive-target:hover { transform: translateY(-2px); box-shadow: 0 8px 24px -4px var(--brand-glow); }
.interactive-target:active { transform: scale(0.975); }
```

**B. View Transitions API**
```javascript
function switchView(updateDomCallback) {
  if (!document.startViewTransition) { updateDomCallback(); return; }
  document.startViewTransition(() => { updateDomCallback(); });
}
```

**C. Optimistic UI & Transactional States**
1. Mutate UI state immediately on user click/tap before sending the async network payload.
2. Render a discrete mutation indicator (e.g. 75% opacity, trailing pulse tick) without locking the screen.
3. On API error, roll back the local change with a micro-shake animation and an actionable toast with a "Retry" CTA.

**D. Zero-CLS Skeleton Shimmer Loaders**
- Never use generic spinner GIFs or full-card pulsing blocks.
- Mirror exact geometric heights and border-radiuses with an animated horizontal gradient shimmer.
- Set explicit `min-height` on containers to ensure CLS = 0 when data resolves.

---

#### 4. Cognitive Ergonomics & High-Velocity Interaction

**A. Keyboard-First Ergonomics**
- **Command Palette (Cmd/Ctrl + K):** Quick jump to any entity, tool, or setting.
- **Roving `tabindex`:** Use on button strips, segmented tabs, and tables (`tabindex="0"` on selected, `-1` on siblings).
- **`aria-activedescendant`:** Use on search inputs and command palettes to keep focus in the text field while navigating suggestions.

**B. Form Validation: "Reward Early, Punish Late"**
1. **Initial Input:** NEVER display validation errors while actively typing in a clean field.
2. **On Blur (First Pass):** Validate on blur; if invalid, show a clear, conversational error adjacent to the field.
3. **On Input (Fix Pass):** As soon as an invalid field becomes valid while typing, **immediately clear the error state**.

**C. Touch Target Geometry**
- **Minimum Interactive Bounds:** >= 44px x 44px for all touch targets (expand click area with hit-slop padding or pseudo-elements if the visible graphic is smaller).
- **Touch Slop Threshold (8-10px):** Prevent accidental clicks when a user begins a swipe/scroll. Use `touch-action: pan-y`.
- **Mobile Thumb Zone:** Anchor primary CTAs in the bottom 35% of handheld viewports; place destructive actions in high-friction secondary positions.

**D. Form Labeling & Input Modes**
- **Persistent Top-Aligned Labels:** Always place labels 4-6px above the field. NEVER use floating labels.
- **Explicit Input Modes:**
  - Currency: `<input type="text" inputmode="decimal" pattern="[0-9]*" autocomplete="off">`
  - Quantities: `<input type="text" inputmode="numeric" pattern="[0-9]*">`
  - Email: `<input type="email" inputmode="email" autocomplete="email" autocapitalize="none">`

---

#### 5. Modal, Dialog & Sheet Architecture

**A. Pinned Seams & Gradient Scrims**
```css
.modal-header {
  position: sticky; top: 0;
  background: var(--surface-primary);
  border-bottom: 1px solid var(--border-subtle);
  z-index: 2;
}
.modal-header::after {
  content: ''; position: absolute; top: 100%; left: 0; right: 0; height: 14px;
  background: linear-gradient(to bottom, var(--surface-primary), transparent);
  pointer-events: none;
}
```

**B. 6-Point Focus Management Lifecycle**
Every dialog implementation must execute all 6 points:
1. **Origin Storage:** Record `document.activeElement` before launching the modal.
2. **Initial Placement:** Shift focus to the primary interactive element (or modal title for sensitive forms).
3. **Focus Trapping:** Confine Tab / Shift+Tab cycles within the active dialog using `<dialog>.showModal()` or `inert`.
4. **Scroll Lock Stability:** Prevent horizontal page shifts with `scrollbar-gutter: stable` on the document root.
5. **Escape & Light Dismiss:** Support the Esc key and backdrop clicks for dismissal.
6. **Focus Restoration:** Return focus to the original invoking element upon closing.

**C. Responsive Bottom-Sheet Morphing**
- **Desktop (>= 768px):** Centered modal dialog with backdrop blur.
- **Mobile (< 768px):** Auto-morph into a bottom sheet with `padding-bottom: env(safe-area-inset-bottom)` and drag-down-to-dismiss gesture handling.

---

#### 6. Accessibility Engineering (WCAG 2.2 & ARIA APG)

**A. Double-Ring Focus Indicator (WCAG 2.2 SC 2.4.12)**
```css
:focus-visible {
  outline: 2px solid var(--brand-primary);
  outline-offset: 2px;
  box-shadow: 0 0 0 4px var(--surface-primary);
}
```

**B. Non-Obscured Focus (WCAG 2.2 SC 2.4.11)**
When an element receives keyboard focus, it must never be hidden behind sticky headers, footers, or floating action bars. Use `scroll-padding-top` and `scroll-padding-bottom` on scrollable containers.

**C. Permanent Live Regions**
`aria-live="polite"` / `"assertive"` regions must use a permanent DOM element created at app render. Never destroy and rebuild live containers via `innerHTML`.

**D. Reduced Motion**
```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}
```

---

#### 7. Financial & Data Engineering Invariants

- **Tabular Figures (`tnum`):** All monetary figures, quantities, stock balances, and timestamps must use monospace tabular numbers (`font-feature-settings: "tnum" 1, "zero" 1` or `font-family: 'DM Mono', monospace`) for perfect vertical alignment.
- **Decouple Styling from Data Pipelines:** DO NOT rewrite, simplify, or refactor underlying data aggregation functions (`buildOrderTimeline`, `deriveOnHand`, `inventoryBreakdown`). Keep data assembly 100% intact and modify ONLY CSS tokens, HTML wrapper classes, badge elements, and subtext formatting.
- **Defensive Fallbacks:** Always wrap dynamic template outputs with nullish coalescing (`${row.after ?? row._after ?? '—'}`) to prevent `'undefined'` text rendering.
- **Property Alignment:** Always verify exact property key names against underlying models before referencing them in template literals.

---

#### 8. 12-Point SOTA Verification Matrix

Before delivering ANY user-facing modification, verify all 12 criteria:

- [ ] **1. Aesthetic Polish:** Does the interface reflect elite standards (Linear/Vercel/Apple) with crisp borders, subtle glassmorphism, and balanced visual hierarchy?
- [ ] **2. APCA & WCAG Contrast:** Do body text (Lc >= 75), fine tabular digits (Lc >= 90), and controls (Lc >= 60) meet APCA standards?
- [ ] **3. Semantic Surfaces:** Are background layers mapped to well-defined canonical surface tokens?
- [ ] **4. Modal Shell Architecture:** Are pinned headers/footers equipped with gradient scrims and zero-jump scroll mechanics?
- [ ] **5. Touch Target Bounding Box:** Are all interactive targets >= 44px x 44px with generous hit padding?
- [ ] **6. Responsive Fluidity:** Does layout adapt across mobile (375px), tablet (768px), and widescreen containers using Container Queries?
- [ ] **7. Tabular Figures & Right Alignment:** Are all prices, quantities, and balances formatted with `tnum` / monospace and right-aligned?
- [ ] **8. Keyboard & Focus Lifecycle:** Does Tab navigation work cleanly with high-visibility double-ring focus outlines and 6-point modal focus trapping?
- [ ] **9. Form Validation Ergonomics:** Is the "Reward Early, Punish Late" timing respected, with persistent top-aligned labels and appropriate `inputmode`?
- [ ] **10. Micro-Interactions & Spring Kinetics:** Do buttons and cards feature natural spring hover, active (`scale(0.975)`), and zero-CLS loading skeletons?
- [ ] **11. Motion Accessibility:** Does the interface respect `@media (prefers-reduced-motion: reduce)` with instant transitions?
- [ ] **12. Data Pipeline Integrity:** Are all existing financial amounts, state handlers, and calculation pipelines 100% preserved?

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
