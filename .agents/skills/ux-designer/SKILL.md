---
name: ux-designer
description: UX/UI design reference for this codebase — the Riso Press design system (flat inks, hard edges, Anton/Archivo/DM Mono, day newsprint and warm-grey night) plus the platform primitives, interaction and accessibility patterns that hold up here. Read before building, auditing or restyling any screen.
---

# UX/UI Design Reference (/ux-designer)

Reach for this when building, auditing, polishing, or refactoring user interfaces in this project. The app has ONE design system — **Riso Press** — and every screen follows it. The rest of this file is a toolbox of patterns that have worked well here.

A few things below are real constraints rather than style preferences (marked), because getting them wrong causes an actual bug or harms someone's ability to use the app, not just a visual inconsistency.

---

## 0. A few things worth holding to

1. **Vanilla JS, no runtime dependencies.** No React/Vue/Svelte. Reach for native platform primitives (`<dialog>`, `popover="auto"`, `field-sizing: content`, `content-visibility: auto`, `inert`) before adding a JS library. Vite stays a thin bundler.

2. **Use the tokens that actually exist — never invent one, never write a raw hex.** Palette in `src/style.css` `:root`, the semantic layer (surfaces, content, borders, status roles), elevation, motion, z-index and focus in `src/styles/system.css`, night values in `src/styles/theme-dark.css`. An undefined token silently falls back to nothing (a card has gone invisible that way); a literal hex is wrong in one of the two themes. `node scripts/check-tokens.mjs` ratchets raw values and `tests/no-undefined-tokens.test.js` catches invented names.

3. **`.modal` owns `padding: 0 var(--space-6)` only** — no vertical padding on modal sub-classes. `.modal-title` and `.modal-footer` own the top/bottom padding. `tests/modal-shell-seams.test.js` enforces it; `UX_PATTERNS.md` has the mechanics.

4. **Financial and data-integrity rules** (these protect against a wrong number reaching a customer or a ledger):
   - Money, quantities and timestamps are DM Mono with tabular figures, right-aligned — but the number itself must come from the existing calculation, never recomputed for display.
   - Don't rewrite or simplify the data-assembly functions (`buildOrderTimeline`, `deriveOnHand`, `inventoryBreakdown`, etc.) during a styling pass — style the output, leave the pipeline alone.
   - Wrap dynamic template output defensively (`${row.after ?? row._after ?? '—'}`) so a missing field renders a dash, not `undefined`.
   - Customer-paid shipping is natively CAD and never goes through FX conversion — see the ledger-auditor skill.

5. **Touch targets.** Recovery and checkout actions pressed on a phone get a full 44px target (`.sys-target`, `btn lg`, `--target-min`). Plain `.btn` deliberately stays ~33px — a settled decision in `UX_PATTERNS.md` → Decisions on record; do not add `min-height` to `.btn`.

Section 6 (contrast, focus, reduced motion, live regions) is the same category — real accessibility requirements.

---

## 1. The design system — Riso Press

**Where it lives.** The code is the source of truth: the three stylesheets above. The brand book — every token with a usage note, both themes, the component kit with live previews, the marks — is the owner's claude.ai design system, *Riso Press* (https://claude.ai/artifact/MvJwSgL7vE4vExRKaC9Gph), built from these stylesheets. Component classes and when to reach for each are in [.agents/UX_PATTERNS.md](../../UX_PATTERNS.md). The redesign's history and landmines are in `docs/riso-redesign-handoff.md`.

**Day — newsprint.** Flat risograph inks on newsprint, hard edges, nothing soft. The rules that make it work:

- **Two inks shout, four report.** Flare (`--gold`, which is red — the name is historical) marks the one action; press blue, settled green and needs-you yellow report state. Nothing else gets colour.
- **A fill and its ink are different values.** Riso hues are fills, illegal as text (flare 3.7:1 on newsprint, green 3.1:1, yellow 1.4:1). Surfaces take the `-light` / `-bg` grade; text takes the base (`--gold-text`, `--green`, `--red`, `--amber`, `--blue`). Text on a flare fill is `--ink`. Swapping them caused 23 contrast failures in one sweep.
- **Bold chrome, calm data.** The 2px ink outline (`--stroke` in `--rule-ink`, alias `--border-strong`) is for objects: cards, buttons, KPI tiles, tables, dialogs. Inside lists and forms, rules drop to the hairline (`--stroke-hair` in `--border` / `--border2`). Never an ink outline per table row.
- **Squared.** `--r` / `--r2` are 0; `--r3` (4px) only on cards and dialogs; `--r-pill` only on status pills and the round close button.
- **Depth is an offset, never a blur.** `--elev-1` … `--elev-4` and `--elev-hover` are flat blocks of ink offset down-right. Never write your own `box-shadow`, never a glow, never `backdrop-filter` (and never a full-viewport one — it measured 55ms/frame; `tests/no-fullviewport-blur.test.js`).
- **Type split.** Anton (`--font-display`) for names and titles, always uppercase; Archivo (`--font-ui`) for the interface — buttons 800 uppercase, labels 9px uppercase tracked; DM Mono (`--font-mono`) for every figure. Sizes from `--text-3xs` … `--text-3xl`, never a raw px.
- **Status mapping** (reuse, never add a hue): amber = active / needs you, green = settled, red = owed / voided / error, blue = info, grey = draft / pending. Every status carries a glyph and a word — green and red differ by hue alone.
- **Role tokens first:** `--surface-page / -raised / -sunken / -inset / -inverse`, `--content-primary / -secondary / -muted / -faint / -on-inverse`, `--border-subtle / -default / -strong`, `--status-*`. Text on permanently dark chrome is `--on-inverse*`, never `--cream`.

**Night — warm grey.** Night mode is its own quieter treatment, modelled on the Claude app's dark theme (PR #996): one warm-grey family that gets lighter as things rise (page → card → raised control), warm off-white text, flare warmed to clay, soft shadows, and a deliberately quiet outline ink. Same classes, same shapes. It lives entirely in `theme-dark.css`, keyed off `data-theme="dark"` plus the `.theme-dark` class on `<html>`. Never add a `prefers-color-scheme` block to `style.css` (`tests/tokens.test.js` blocks it). A component filled with `--cream` renders with no fill at night — `UX_PATTERNS.md` → "Working in a themed codebase" has the fix.

**Documents stay light.** The printed invoice, the email preview, carrier logo plates and the sign-in poster are artwork, not chrome: they keep their own raw colours and sit on the `DOCUMENT_BUILDERS` list in `scripts/check-contrast.mjs`.

**Not adopted:** migrating the palette to `oklch()`, CSS anchor positioning, scroll-driven animations and wired View Transitions were each considered and ruled out for now — see the "Considered and rejected" table in `docs/ux-daily-log.md` before proposing any of them.

**Contrast.** The gate is WCAG AA, checked in both themes by `node scripts/check-contrast.mjs` and `tests/theme.test.js`. APCA ($L_c$ ≥ 75 body, ≥ 60 labels) is a useful second opinion on saturated pairs, not the gate.

---

## 2. Platform primitives worth reaching for before a JS library

**`field-sizing: content`** — auto-expanding textareas without a `scrollHeight` listener:
```css
textarea.auto-expanding-input { field-sizing: content; min-height: 2.5lh; max-height: 12lh; }
```

**Native `popover="auto"` / `<dialog>`** — avoids z-index wars and gets light-dismiss for free:
```html
<button popovertarget="order-filter-menu" class="btn">Filter</button>
<div id="order-filter-menu" popover="auto" class="filter-popover"><!-- Content --></div>
```
Entry/exit via `@starting-style`, on the motion tokens:
```css
[popover] {
  opacity: 0;
  transform: translateY(-8px);
  transition: opacity var(--dur-base) var(--ease-entrance), transform var(--dur-base) var(--ease-entrance),
    display var(--dur-base) allow-discrete, overlay var(--dur-base) allow-discrete;
}
[popover]:popover-open { opacity: 1; transform: translateY(0); }
@starting-style { [popover]:popover-open { opacity: 0; transform: translateY(-8px); } }
```

**`inert`** — locks focus/interaction on the background while a modal is open:
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

**`content-visibility: auto`** — keeps a long ledger scrolling smoothly by skipping paint for off-screen rows:
```css
.ledger-table tbody tr { content-visibility: auto; contain-intrinsic-size: auto 44px; }
```

**Container Queries + Subgrid** — components that adapt to their own container, and rows that align across separate wrappers. Prefer `@container` over a viewport `@media` for width-dependent components:
```css
.catalog-grid { container-type: inline-size; container-name: catalog; }
@container catalog (min-width: 520px) {
  .book-card { display: grid; grid-template-columns: 120px 1fr auto; gap: var(--space-5); }
}
.card-subgrid { display: grid; grid-template-columns: subgrid; grid-column: 1 / -1; align-items: center; }
```

**Balanced wrapping** — `text-wrap: balance` on headings, `text-wrap: pretty` on body copy (already applied in `system.css`'s baseline layer).

---

## 3. Motion

Use the tokens — `--dur-instant` 80ms, `--dur-fast` 140ms (press and state), `--dur-base` 220ms (panels), `--dur-slow` 360ms (screens); `--ease-standard` for state changes, `--ease-entrance` for arrivals, `--ease-exit` for departures, `--ease-spring` sparingly. Anything on these tokens collapses under `prefers-reduced-motion` automatically; a literal duration does not.

Hover is a lift, not a glow — the element rises and its ink offset grows with it:
```css
.interactive-target {
  box-shadow: var(--elev-2);
  transition: transform var(--dur-fast) var(--ease-standard), box-shadow var(--dur-fast) var(--ease-standard);
}
.interactive-target:hover { transform: translate(-1px, -1px); box-shadow: var(--elev-hover); }
.interactive-target:active { transform: scale(.975); box-shadow: var(--elev-1); }
```

View Transitions: the helper exists and is **intentionally unwired** (shipped and reverted in PR #128/#129) — check `UX_PATTERNS.md` §1 first.

**Optimistic UI** for mutations: update the UI on click, show the pending affordance (`.sys-pending`), roll back with a toast and a retry on error (`.sys-failed`), and mark concurrent edits (`.sys-conflict`) — never block the screen on the network. The app works offline; the `.sync-chip` owns the app-level story.

**Loading states**: a shimmer that mirrors the real content's geometry reads better than a spinner, and holding `min-height` keeps layout from jumping when data arrives.

---

## 4. Interaction details that tend to matter

- **Keyboard:** roving `tabindex` on button strips/tabs/table rows (`0` on the selected item, `-1` on siblings); `aria-activedescendant` for search inputs so focus stays in the field while navigating suggestions.
- **Form validation timing:** don't error while someone is still typing into a fresh field; validate on blur; clear the error the moment the field becomes valid again. Mark it with `.form-group.invalid` and `aria-invalid`, and say what is wrong in plain words.
- **Labels:** persistent, top-aligned, the 9px uppercase micro-label — never a placeholder as the only label.
- **Input modes:** `inputmode="decimal"` for currency, `inputmode="numeric"` for quantities, `type="email"` for email.
- **Feedback:** never `alert()` / `confirm()` — a toast confirms, a dialog decides.

---

## 5. Modals, dialogs, sheets

The shell is `.overlay` > `.modal` > `.modal-title` (badge + Anton title + round `.modal-close-btn`), the body, and `.modal-footer` (cancel then primary on the right; a destructive action alone on the far left). A scrolling body needs the pinned title and footer to fade the content at the seam rather than hard-clip it — the existing `.modal-title` / `.modal-footer` pseudo-elements do this; reuse them.

Focus handling: remember what was focused before opening, move focus in on open, trap Tab inside (native `<dialog>.showModal()` or `inert`), support Esc and backdrop-click to dismiss (ask first if the form is dirty), restore focus on close. `scrollbar-gutter: stable` on the root avoids a horizontal shift.

On narrow viewports (< 768px), a bottom sheet (`padding-bottom: env(safe-area-inset-bottom)`) tends to feel more native than a shrunken centred dialog.

---

## 6. Accessibility — these are real requirements, not style choices

**Focus visibility** (WCAG 2.2 SC 2.4.12) — one ring everywhere, already applied by `system.css`'s baseline layer: `outline: var(--focus-ring-width) solid var(--focus-ring-color)` (2px flare) at `var(--focus-ring-offset)`, plus `box-shadow: var(--focus-ring-halo)` on fields. Every interactive element gets a hover AND a `:focus-visible` state.

**Non-obscured focus** (WCAG 2.2 SC 2.4.11) — a focused element must not end up hidden behind a sticky header/footer; `scroll-padding-top` / `scroll-padding-bottom` on the scroll container handles this.

**Live regions** — create `aria-live="polite"` / `"assertive"` containers once at initial render and update their contents; rebuilding them via `innerHTML` breaks what assistive tech listens to.

**Colour is never the only signal** — status pills carry a glyph and a word; icons carry a label or `aria-label`.

**Reduced motion** — respected without exception; the motion tokens handle it for anything written on them.

---

## 7. A quick self-check, when it's worth running

For a new screen or a significant redesign:

- Is it Riso? Square corners, 2px ink on objects and hairlines in data, offsets not blurs, Anton / Archivo / DM Mono in their places, flare spent once.
- Does it read correctly in **night** mode too (switch themes and look — a `--cream` fill vanishes there)?
- Tokens only — no raw hex, px font size, z-index or shadow (`check-tokens.mjs`); no invented token names.
- Text meets WCAG AA in both themes (`check-contrast.mjs`).
- Modal padding structure intact? Touch targets right for where it's pressed?
- Money and quantities in DM Mono, tabular, right-aligned — and the underlying calculation untouched?
- Keyboard, focus and `prefers-reduced-motion` all work?
- Offline: what do pending, failed and conflict look like?

If most of these don't apply (a copy tweak), skip it — it's here for when it's useful, not as paperwork.
