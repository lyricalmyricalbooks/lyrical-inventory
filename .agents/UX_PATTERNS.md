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
