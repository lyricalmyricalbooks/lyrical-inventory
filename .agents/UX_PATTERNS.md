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

Empty body row: always `colspan` = the real column count, wrapping `.empty-state` —
`<tr><td colspan="N"><div class="empty-state" style="padding:1rem;">No X yet.</div></td></tr>`.

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
