# UX Component Patterns — reuse before inventing

> [!NOTE]
> This is the concrete companion to `.agents/AGENTS.md`. AGENTS.md sets the *principles*
> (shadows, motion curves, Fitts's/Hick's law, mandatory checklist). This file maps those
> principles to the **actual classes and snippets already proven in this codebase**, so new
> UI converges on one system instead of drifting toward one-off CSS every session.
>
> **Rule of thumb:** before writing a new class for a button, pill, table, dropdown, or empty
> state, grep `src/style.css` for the patterns below. Extend an existing one (a modifier class,
> a new `.pill.<color>`) before creating a parallel pattern.

---

## Buttons — `.btn`
Base: `.btn` (`style.css:1578`) — uppercase Syne, 11px, `border-radius:var(--r2)`, `padding:8px 16px`, 44px+ touch target once padding + line-height are counted.

Modifiers (compose, don't reinvent):
- `.btn.gold` — primary action (gold fill, ink text)
- `.btn.ink` — secondary dark action
- `.btn.danger-btn` — destructive (delete, void, remove)
- `.btn.sm` — compact, for inline row actions (`padding:5px 11px`)
- `.btn.lg` — 44px-tall hero CTA
- `:disabled` is already styled (`opacity:.35`) — never build a custom disabled look.

```html
<button class="btn gold">+ Add store</button>
<button class="btn sm ink" onclick="switchBook('${book.id}')">Manage →</button>
<button class="btn danger-btn sm" onclick="voidEntry('${id}')">Void</button>
```

Row-level icon actions (edit/manage buttons that appear on hover) use `.edit-btn` —
see `.tbl tbody tr:hover .edit-btn` (`style.css:1821`) for the reveal-on-hover convention.

---

## Status & count badges — `.pill`
Base: `.pill` (`style.css:1569`) — full-pill radius, 11px, always paired with a semantic color modifier: `.green` `.amber` `.red` `.gray` `.blue` `.gold`.

Convention: **amber = active/needs-attention, green = settled/good, gray = neutral/inert,
red = error/void, gold = highlighted/primary count.** Keep a leading glyph (`●` active, `✓`
settled, `✕` void) — it's how users scan a whole column of pills without reading text.

```html
<span class="pill amber">● Active</span>
<span class="pill gray">✓ Settled</span>
<span class="pill gold">10 accounts</span>
```

Chip variant for inline counts/filters (not status): `.pile-chip` (`style.css:1632`) —
bordered, neutral background, optional colored `.dot`.

### Reporting stock on a surface that spends it

Any screen that moves inventory (POS register, manual entry, a future shipment form) should say
what it is about to do to on-hand *before* it does it. Two pure helpers already encode this —
`orderStockPreview()`/`orderStockPreviewCopy()` in [src/lib/inventory.js](../src/lib/inventory.js)
for the manual-entry form, and `posStockView()`/`posOversellSummary()` in
[src/lib/pos-stock.js](../src/lib/pos-stock.js) for the register. Four rules they share:

- **Report, never recompute.** These helpers read a stock figure and describe it. The ledger keeps
  sole ownership of the number — no rounding, re-tallying, or writing back.
- **A book's `threshold` is a REORDER alarm, not a screen-level one.** It is sized against a whole
  print run (15, 30…), so on a register card it would paint nearly every title amber and mean
  nothing. Pick a cutoff that matches the surface's question; `POS_LOW_STOCK_AT` is the fair-table
  one.
- **Warn, don't block.** A seller may genuinely have brought copies the records don't know about,
  and a refused sale at a fair table is worse than an off-by-two stock count. Say what will happen
  ("on-hand stops at 0 and your count stops matching") and let them decide.
- **Never print a negative count.** Keep the true arithmetic in the returned object so the shortfall
  is reportable, and show `Math.max(0, …)` — a stock count below zero is the bug being reported, not
  a number to render.

Untracked things say nothing at all. A POS-only guest title has no catalog stock, so its card gets
no pill — a `0` there would read as "out of stock" and stop a perfectly good sale.

---

## Tables / lists — `.tbl`
Base: `.tbl` (`style.css:1540`) — dark header (`.tbl thead{background:var(--ink)}`), uppercase
9px th labels at `.14em` tracking, 13px body, right-aligned numeric columns via `th.r`/`td.r`
(and `td.r` gets `font-family:'DM Mono',monospace` — numbers are always mono in this app).

Row states to reuse rather than re-derive:
- `tbody tr:hover td` → `background:var(--cream2)` (built into `.tbl` itself)
- `.voided` → struck-through + faded (`style.css:1818`)
- Zebra + accent-bar + grouped/nested rows: see `.all-consignment-table` block
  (`style.css:2627-2662`) for the fullest example — nth-child zebra, `is-active`/`is-settled`
  row classes, a `box-shadow: inset 3px 0 0 var(--gold2)` left-accent for the active state,
  collapsible `.con-group-row` headers with a `.con-group-chevron`, and `.con-nested-row` for
  indented children. Copy this pattern for any other "grouped ledger" table before inventing
  a new grouping mechanism.
- Clickable data-viz cell inside a row (e.g. a mini progress bar that navigates): give it
  `role="button" tabindex="0"`, an `onclick` **and** an `onkeydown` handler for Enter/Space,
  and a `title` describing the destination — see `.con-row-progress-link` (`style.css:2660`)
  and `conAccountRowHtml()` in `main.js` for the reference implementation.

**Narrowing a long ledger:** the consignment ledger's filter bar (`.ledger-filter-bar`,
`renderLedgerFilterBar()` in `main.js`, pure helpers in
[src/lib/consignment-ledger-filter.js](../src/lib/consignment-ledger-filter.js)) is the
reference. Four rules it encodes, worth keeping on any other filtered money table:
- **Filter the rows the totals are taken over, never re-tally them.** The footer still calls
  `consignmentLedgerTotals()`; the filter only decides which entries it is handed, so a
  per-store total is the same arithmetic over a smaller set and adds back up to the whole.
- **Skip rows inside the original index walk** rather than mapping a filtered copy — row
  actions like `openEditLedger(i)` are keyed on the real array index.
- **Say what is hidden, not just what is shown.** An empty filtered table must state that the
  other rows exist and the filter is hiding them, or it reads as "this book has no history".
- **A live region has to be a permanent node.** `#con-ledger-status` sits outside the part of
  the bar that is rebuilt, because a region replaced wholesale announces nothing.

**Searching a long ledger:** Order History's box (`.ledger-filter-bar` + `.ledger-filter-input`,
`renderHistSearchBar()` in `main.js`, pure helpers in
[src/lib/order-history-search.js](../src/lib/order-history-search.js)) is the reference for free-text
search. It shares the filter bar's furniture — reuse `.ledger-filter-input` rather than styling a new
`<input type="search">`. Five rules on top of the filter-bar ones above:
- **The field is permanent markup, never part of the render.** A field rebuilt by `innerHTML` on
  every keystroke drops the caret mid-word. Only write `input.value` when it *disagrees* with state,
  so a render triggered while someone is typing can't reset them.
- **Debounce at 200ms**, matching `tcLedgerSearchInput()`. Repainting a fifty-row table between two
  keystrokes is wasted work.
- **Search what is on screen, not what is stored.** Rows hold `POS` but the table paints
  "In Person"; a search that only matches the stored value looks broken to anyone who has not seen
  the raw records. `channelSearchWords()` carries the alias list — keep it in step with
  `formatChannelBadge()`.
- **Text only — no dates, no amounts.** Someone typing `12` wants order 12, and folding dates in
  buries it under every order placed on the 12th of any month.
- **Scope the query to the book it was typed on.** A query carried across a book switch opens the
  next book on a table that looks empty for no visible reason.

**Totalling a money table:** `.ledger-total-row` + `.ledger-total-label` / `.ledger-total-sub` /
`.ledger-total-val` (`.is-owed` amber, `.is-clear` green, `.is-neutral`) / `.ledger-total-scope`
is the shared footer furniture. `.is-end` on the label right-aligns it when it spans several
columns before its figure. Three rules every footer here follows:
- **One row per currency, never one sum across them.** Bucket by the code each row was recorded
  in (`consignmentLedgerTotals()` in [src/lib/consignment.js](../src/lib/consignment.js),
  `expenseLedgerTotals()` in [src/lib/expense-totals.js](../src/lib/expense-totals.js) — same
  shape, book's own code first then alphabetical, so the order is stable across re-renders). Add
  a `<span class="chip-status gray">CODE</span>` only once there is more than one bucket.
- **Never convert at render time.** An exchange rate belongs to the day the money moved; a rate
  invented in the footer disagrees with the per-row converted column beside it.
- **Say all-clear outright.** A bare `0.00` does not read as "nobody is waiting to be paid" —
  swap the label ("All settled", "All reimbursed") and the pill, and keep a sub-line naming what
  *has* been settled.

**A row of cards that behaves like a table** (`.invoice-card` is the reference — a CSS grid of
label/figure cells rather than a `<table>`): it loses the alignment `.tbl` gets for free from
`th.r`/`td.r`, so put it back explicitly. Four rules:
- **Right-align the money cell and give its track a floor.** `text-align:right` plus
  `minmax(<floor>, 1fr)` on that grid column is what makes every card's figure land on one
  shared edge; without the floor a long total reflows the grid and the edge moves card to card.
  Drop the right-align in the narrow stacked layout, where each cell is full width and a
  right-aligned figure just floats away from the labels above it.
- **One figure leads.** The row exists to answer one question — for an invoice, *how much* — so
  that figure goes two steps up the scale (`--text-lg` against the `--text-base` dates beside it).
  A total at the same size as a due date is the bug, whatever colour it is.
- **Captions go on the Syne micro-label scale** (`--text-3xs`, uppercase, `--tracking-caps`),
  and the figure inside must reset `letter-spacing` and `text-transform` or it inherits the
  caption's tracking. At body size a caption and its own figure read as one run of text.
- **`--gold-text`, never `--gold`, for a figure you want to sing.** Raw `--gold` is a fill/accent
  colour and does not clear AA as text on a card surface in either theme.

Empty body row: always `colspan` = the real column count, wrapping `.empty-state` —
`<tr><td colspan="N"><div class="empty-state" style="padding:1rem;">No X yet.</div></td></tr>`.

**Sticky column labels on a long ledger:** add `.sys-sticky-head` to the `.tbl-wrap`
(`system.css`, alongside `.sys-long-list`). The header cells pin just under the app header
instead of scrolling away, so row 200 of a money table is still readable as Qty / Unit price /
Total. Already on Order History, the consignment ledger and the tax ledger.

Two conditions before you add it:
- The table must scroll with the **page**. A wrap that is already its own scroll container
  (an inline `max-height` + `overflow:auto`, or one inside a scrolling modal body) resolves
  `top` against the wrong box and pushes its header down *inside* the panel.
- The header must use the flat `.tbl thead` fill. `.all-consignment-table` paints a gradient
  across the whole `thead`; moving that onto each `th` restarts the gradient per cell, so that
  table stays unsticky until someone reworks the fill.

The offset comes from `--sticky-top`, published by `src/lib/sticky-header.js` — it measures the
real `.app-header` height (which wraps to two rows on a phone and grows with the safe-area
inset) and republishes on resize. It falls back to `0px` everywhere it can't measure, and the
wrap falls back to `overflow:hidden` on engines without `overflow: clip`, so both degrade to
today's plain header rather than to a broken one.

---

## Empty states — `.empty-state`
Two tiers exist; use the richer one whenever the empty state is a primary destination
(a whole tab/panel), and the plain one only for small nested table bodies.

**Plain** (nested table body, low-stakes): `<div class="empty-state" style="padding:1rem;">No sales yet.</div>`

**Rich** (a tab or panel's main empty state) — icon + message + primary CTA, per AGENTS.md
§3 "No Blank States":
```html
<div class="empty-state">
  <div class="e-icon">🏪</div>
  No stores yet. Add your first consignment account.
  <div style="margin-top:12px;">
    <button class="btn gold" onclick="openM('add-store')">+ Add store</button>
  </div>
</div>
```
Real examples: `main.js:8389` (stores), `main.js:8899` (invoices), `main.js:18579` (Stripe
reconciliation). Grep `e-icon` before adding a new empty-state icon convention — most already
carry a single emoji that matches the section's theme (💳 payments, 📄 invoices, 🔍 filtered-empty).

---

## Dropdowns & menus
The book switcher (`index.html:311`, `#book-dropdown-menu`) is the canonical custom dropdown:
absolute-positioned panel, `var(--ink2)` background, `0 8px 32px rgba(0,0,0,.4)` shadow,
`border-radius:var(--r2)`, items highlighted via `.book-dd-item` active-state color swap
(`main.js` `switchBook()`, ~line 2593). Reuse this shell for any new custom dropdown instead
of a native `<select>` when you need rich items (color dots, icons, secondary text) — for a
plain list of strings, prefer the native `.form-group select` (already themed with the custom
arrow SVG, hover/focus states — `style.css:1592-1597`) over building a custom listbox.

Toggle buttons that hold binary view-state (e.g. "Group by book") should mirror
`.con-group-toggle-btn` (`style.css:2643`): pill-shaped, neutral by default, `.is-on` swaps to
`var(--gold-bg)` background + gold border, and the button always sets `aria-pressed` in JS —
see `toggleConGrouping()` in `main.js`.

---

## Feedback — never `alert()`/`confirm()`
Use `showToast(message, type)` for all non-blocking feedback (`type` omitted = success,
`'warn'`, or `'err'`) — `.toast` (`style.css:1812`) already has color-coded left borders and
slide-up motion. Use `confirmDialog()`/`promptDialog()` (already on `window`, see the
`Object.assign(window, {...})` export block) for anything that would otherwise be a native
`confirm()`. This is a hard rule in AGENTS.md §9 — flag it in review if you see a raw
`alert(`/`confirm(` sneak into a diff.

---

## Loading states
Use `.skeleton-line` (`style.css:2447`) for any content that loads asynchronously (Sheets
sync, Stripe pulls, Gemini OCR) instead of a spinner GIF or a bare "Loading…" string.

---

# Modern platform capabilities — the current state of the art

> [!IMPORTANT]
> **Posture: progressive enhancement, never load-bearing.** Every item below must degrade to
> the existing behaviour when unsupported. Feature-detect (`CSS.supports()`,
> `'startViewTransition' in document`, `HTMLElement.prototype.hasOwnProperty('popover')`) rather
> than assuming. All of these are native platform features — **none adds a runtime dependency**,
> so they stay inside the vanilla-JS / thin-Vite constraint.
>
> Already adopted in this codebase: `color-mix()` (33 uses), `:focus-visible` (24),
> `prefers-reduced-motion` (3), `aria-live` (4), `inert` (2). The items below are the gaps.

## 1. View Transitions — available, but DO NOT wire without asking

> [!WARNING]
> **Prior art: this was tried and rejected.** PR #128 shipped View Transitions across
> `switchTab`/`switchBook`; PR #129 reverted them **seven minutes later**. Neither PR records
> a reason, so the only durable fact is the outcome: app-wide navigation transitions were not
> wanted here.
>
> `withViewTransition()` exists in `src/lib/motion.js` and the root crossfade rules exist in
> `system.css`, but **nothing calls the helper** and that is deliberate. Do not wire it into a
> render path on your own initiative — treat it as a product decision to raise with the user,
> not a self-evident polish win. A narrow single-widget use may be fine; re-applying it to
> navigation is re-litigating a settled call.

The mechanics, for when it *is* wanted: `main.js` performs ~237 `innerHTML` assignments, each
repainting instantly with no continuity. Wrapping one in `document.startViewTransition()` gives
an automatic crossfade; naming elements with `view-transition-name` makes them *morph* rather
than pop. The helper already feature-detects and honours reduced motion, falling back to a
direct synchronous update.

```js
// Helper worth adding once, then reusing everywhere.
// Falls back to a plain call when unsupported or when the user wants reduced motion.
function withViewTransition(update) {
  if (!document.startViewTransition || _prefersReducedMotion()) return update();
  return document.startViewTransition(update);
}
// `_prefersReducedMotion()` already exists in main.js (~line 10974) — reuse it, don't duplicate.

function toggleConGrouping() {
  window._allConGrouped = !window._allConGrouped;
  withViewTransition(() => renderConsignmentTable());
}
```
Support: same-document transitions ship in Chromium and Safari; Firefox is more recent. Because
it is wrapped in a feature check, unsupported browsers simply get today's instant swap.

## 2. Popover API + `<dialog>` — delete the hand-rolled overlay plumbing
`#book-dropdown-menu` (`index.html:311`) currently hand-rolls `position:absolute`,
`z-index:999`, and manual outside-click closing via `closeBookDropdown()`. `.modal`
(`style.css:1714`) likewise hand-rolls its own backdrop and focus handling.

The platform now does all of that natively:
- **`popover`** → top layer (no z-index arms race), light-dismiss on outside click, Esc to
  close, all free. Ideal for the book switcher, the header menu, and any future filter menu.
- **`<dialog>` + `.showModal()`** → focus trap, `::backdrop`, Esc, and inert-background for
  free. Ideal for `openM()` modals and `confirmDialog()`/`promptDialog()`.

```html
<button popovertarget="book-menu">All books</button>
<div id="book-menu" popover>…</div>
```
Pair with `@starting-style` + `transition-behavior: allow-discrete` so they animate in/out from
`display:none` **without JS timers**:
```css
#book-menu {
  opacity: 0; translate: 0 -4px;
  transition: opacity .18s, translate .18s, display .18s allow-discrete;
}
#book-menu:popover-open { opacity: 1; translate: 0 0; }
@starting-style { #book-menu:popover-open { opacity: 0; translate: 0 -4px; } }
```
Migrate opportunistically — when you're already touching a menu or modal, not as a big-bang
refactor.

## 3. `:has()` — state on the parent, without JS class bookkeeping
Currently row/card states are computed in JS and stamped as classes (`is-active`,
`is-settled`, `needs-attention`). `:has()` removes a whole category of that bookkeeping:

```css
/* Row containing an active pill gets the accent bar — no is-active class needed */
.tbl tbody tr:has(.pill.amber) td:first-child { box-shadow: inset 3px 0 0 var(--gold2); }
/* Form group whose input is invalid, styled from the wrapper */
.form-group:has(input:invalid) label { color: var(--red); }
/* Card that ended up empty */
.card:has(.empty-state) { background: var(--cream2); }
```
Prefer `:has()` for *derived visual* state. Keep explicit JS classes when the state carries
domain meaning (a settled account is business state, not a styling artifact).

## 4. Container queries — component-level responsive
All responsiveness today is viewport `@media`. But `.consignment-stat-card`, `.kpi`, and
`.card` render at very different widths depending on their host panel, so viewport width is the
wrong signal. This is the correct fix for "the Sell-through column crowds on mobile":

```css
.consignment-summary-panel { container-type: inline-size; }
@container (max-width: 640px) {
  .consignment-stat-grid { grid-template-columns: 1fr; }
  .all-consignment-table th:nth-child(6),
  .all-consignment-table td:nth-child(6) { display: none; } /* Sell-through column */
}
```
Rule going forward: **new components use `@container`; leave existing `@media` blocks alone**
until you're already editing them.

## 5. `content-visibility` — long-list performance with zero dependencies
The no-runtime-deps constraint rules out virtualization libraries, but the platform has a
one-line equivalent. For long ledger/history tables (order history, tax ledger, reconciliation):

```css
.tbl tbody tr { content-visibility: auto; contain-intrinsic-size: auto 44px; }
```
The browser skips rendering off-screen rows entirely. This is the answer to "will this jank at
200+ rows" — reach for it before considering manual windowing.

## 6. Typography & layout polish — one-liners with real payoff
```css
h1, h2, h3, .sect        { text-wrap: balance; }  /* no orphaned last word in headings */
.section-subcopy, p      { text-wrap: pretty; }   /* no single-word final lines */
html                     { scrollbar-gutter: stable; }  /* no layout shift when content grows */
textarea                 { field-sizing: content; }     /* grows with input, no JS autosize */
```

## 7. Optimistic UI as a documented visual vocabulary
This is the state-of-the-art *pattern* that matters most for an offline-first PWA, and it's a
product decision, not just CSS: a queued mutation should render **immediately** in its final
position with a visible "not yet synced" affordance, rather than blocking on the network.

The app already has the sync queue; what it lacks is a consistent visual language for it.
Standardise on:
- **Pending** — `.pill.gray` with a `◌` glyph, row at ~70% opacity
- **Failed / needs retry** — `.pill.red` plus an inline retry `.btn.sm`
- **Conflict** — `.pill.amber` with an explicit "server changed this" reconcile action

Never show a queued write as fully-committed, and never make the user wait on the network to
see their own action land. When adding any new mutation path, decide which of these three states
it can enter and render all of them.

**App-level counterpart — `#sync-chip`.** The three classes above say "this row is queued"; the
chip says "the connection is why". It is fixed bottom-left (`.sync-chip` in `system.css`;
`.toast` owns bottom-right) and painted by `renderSyncChip()` in `main.js` from the pure
`describeSyncStatus()` in [src/lib/sync-status.js](../src/lib/sync-status.js). Two rules it
encodes, worth keeping if you touch it:
- **It only appears when there is something the publisher could not otherwise know** — online
  with an empty queue paints nothing at all. A permanent "all good" badge is noise.
- **Offline is reported the instant it happens**, off the `offline` window event, not at the next
  save attempt. Before this the app read "Live" until something was sold.

Copy for it goes through `describeSyncStatus()`, never inline — a test asserts the visible
strings stay free of "Firestore", "queue" and friends.

## 8. Deliberately *not* adopting yet
- **CSS anchor positioning** (`anchor-name`/`position-anchor`) — genuinely the right model for
  dropdown/tooltip placement, but support is still Chromium-led. Revisit; today the popover +
  existing absolute positioning is the safer pairing.
- **Scroll-driven animations** (`animation-timeline`) — attractive, but this is a dense
  financial tool where scroll-jacking hurts more than it delights. Skip.
- **`oklch()` colour tokens** — worth it only alongside a full palette migration; mixing
  colour spaces piecemeal in `style.css` would make the tokens harder to reason about, not
  easier.

---

## Decisions on record

Reviewed against live specimens and settled. **These are not open questions.** Each one is a
deliberate choice, and two of them look like bugs if you don't know the history — so confirm
here before "fixing" anything in this list.

| Decision | Ruling | Why it matters |
| :-- | :-- | :-- |
| **Shadows** | Keep the two-layer elevation scale. `--shadow`/`--shadow2` stay aliased onto `--elev-2`/`--elev-3`. | Reviewed on real cards and stat tiles. Prefer `--elev-*` directly in new code. |
| **Button height** | `.btn` stays at ~33px. **Overrides AGENTS.md §3's 44px minimum.** | Raising it reflows every screen, and the density is wanted. Do *not* add `min-height` to `.btn`. Apply `.sys-target` to individual controls that genuinely need a full target. |
| **Dark mode** | **Shipped** (supersedes the earlier groundwork-only ruling). Lives entirely in [src/styles/theme-dark.css](../src/styles/theme-dark.css). | Re-points the PRIMITIVES rather than waiting on the semantic migration — the aliases are defined in terms of them, so flipping the primitives carries the whole system. Add a `@media (prefers-color-scheme)` block to `style.css` and you are back to half-themed; `tests/tokens.test.js` blocks it. |
| **View transitions** | Helper stays available and unwired. | See §1 — shipped and reverted in PR #128/#129. |

Button height is a place where the codebase deliberately does *not* match `AGENTS.md`. That is
intentional. If a future change makes it worth reopening, raise it with the user rather than
silently converging on the written guideline. (Dark mode used to be the second such divergence;
the user asked for it and it now ships — the row above records what replaced the old ruling.)

### Working in a themed codebase
1. **`--cream*` and `--ink*` are surfaces, and both flip.** Text on a permanently dark surface
   (header, KPI banners, toast, sidebar) uses `--on-inverse`; text on a saturated accent fill
   uses `--on-accent`. Never `color:var(--cream)` — `tests/theme.test.js` fails on it.
2. **Reach for a token before a literal.** The accent families (`--emerald`, `--rose`,
   `--orange`, `--violet`, `--slate`) exist so a status colour themes itself. A new hardcoded
   hex is a rule that will be wrong in one of the two themes.
3. **Deliberately light things stay light.** The invoice paper, the email composer preview, and
   the carrier logo plates are documents and artwork, not chrome — the foot of
   `theme-dark.css` lists them and why.

---

## Quick pre-flight before shipping any new list/dropdown/button
1. Did I reuse `.btn`/`.pill`/`.tbl`/`.empty-state`/`.toast` instead of new ad-hoc classes?
2. Does every new interactive element have hover **and** `:focus-visible` states, and a
   touch target ≥ 44px?
3. If it's clickable-but-not-a-`<button>` (a table cell, a progress bar), does it have
   `role="button" tabindex="0"` + `onkeydown` Enter/Space handling?
4. Numbers in mono (`DM Mono`), labels in Syne uppercase — did I match the existing type split?
5. Active/settled/error states — did I reuse the amber/green/gray/red pill convention instead
   of picking new colors?
6. Empty state: rich (icon+CTA) if it's a panel's primary state, plain if it's a nested list.
7. If I re-rendered a list via `innerHTML`, did I leave it un-transitioned? View Transitions
   are available but intentionally unwired — check §1 before calling `withViewTransition()`.
8. New component with width-dependent layout — did I use `@container` rather than a viewport
   `@media` breakpoint? (§4)
9. New menu or modal — did I reach for `popover`/`<dialog>` before hand-rolling z-index,
   outside-click, and Esc handling? (§2)
10. New mutation path — did I decide how its pending / failed / conflict states render, and is
    it optimistic rather than network-blocking? (§7)
11. New table that can run past a screenful and scrolls with the page — did I add
    `.sys-sticky-head` to its wrap so the column labels survive the scroll?
