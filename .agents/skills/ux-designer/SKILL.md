---
name: ux-designer
description: UX/UI design reference for this codebase. OKLCH color, modern CSS platform primitives (Anchor Positioning, Popover API, field-sizing, Container Queries, Subgrid, View Transitions), spring-based motion, and accessibility patterns — offered as a toolbox to draw from, not a checklist to satisfy.
---

# UX/UI Design Reference (/ux-designer)

Reach for this when building, auditing, polishing, or refactoring user interfaces in this project. It's a reference of patterns and conventions that have worked well here, not a gate every change has to clear — use judgment about how much of it applies to the change in front of you.

A few things in here are real constraints rather than style preferences (marked below), because getting them wrong causes an actual bug or harms someone's ability to use the app, not just a visual inconsistency. Everything else is "here's the house convention, and why it tends to hold up" — deviate when the situation calls for it.

---

## 0. A few things worth holding to

Most of this file is optional taste; these aren't, because the failure mode is a real bug rather than an aesthetic one:

1. **Vanilla JS, no runtime dependencies.** No React/Vue/Svelte. Reach for native platform primitives (CSS Anchor Positioning, `<dialog>`, `popover="auto"`, `field-sizing: content`, `content-visibility: auto`, `inert`) before adding a JS library. Vite stays a thin bundler.

2. **Use the surface tokens that are actually defined** (`--surface-page`, `--surface-raised`, `--surface-sunken`, `--surface-inset`, `--surface-inverse` / `--surface-inverse-raised` in `src/styles/system.css`) rather than inventing a new one (`--surface2`, `--card`, etc.). An undefined token silently falls back to nothing, which is how a card has gone invisible before — see `UX_PATTERNS.md` for the specifics of which token fits which surface.

3. **`.modal` owns `padding: 0 var(--space-6)` only** — no vertical padding on modal sub-classes. Pinned headers/footers (`.modal-title`, `.modal-footer`) own the top/bottom padding and their own gradient scrims. Adding padding directly to `.modal` breaks the pinned-scroll seam; `UX_PATTERNS.md` has the full mechanics if you're touching this.

4. **Financial and data-integrity rules** (these protect against a wrong number reaching a customer or a ledger, not just a look-and-feel issue):
   - Money, quantities, and timestamps read better in tabular figures (`font-feature-settings: "tnum" 1` or `'DM Mono'`), right-aligned — but the number itself must come from the existing calculation, never recomputed for display.
   - Don't rewrite or simplify the underlying data-assembly functions (`buildOrderTimeline`, `deriveOnHand`, `inventoryBreakdown`, etc.) while doing a styling pass — style the output, leave the pipeline alone.
   - Wrap dynamic template output defensively (`${row.after ?? row._after ?? '—'}`) so a missing field renders a dash, not the literal text `undefined`.
   - Customer-paid shipping is natively CAD and must never go through FX conversion — this one has its own invariant documented in the ledger-auditor skill.

5. **Touch targets ≥ 44×44px.** This is Fitts's-law-as-accessibility: below this, misclicks during a checkout or ledger edit turn into real mistakes, not just annoyance. Pad the hit area even if the visible glyph is smaller.

Section 6 below (contrast, focus visibility, reduced motion, live regions) is the same category — real accessibility requirements, not style choices.

---

## 1. Color — OKLCH as the house convention

The palette here is built in **OKLCH** (`oklch(L C H / alpha)`) rather than RGB/HSL, because lightness stays perceptually consistent across hues — useful for a UI that has to work in both light and dark mode. If you're adding new color, reaching for OKLCH keeps it consistent with what's already there:

```css
:root {
  /* Surface Layers (OKLCH) */
  --surface-canvas: oklch(0.14 0.02 260);
  --surface-base: oklch(0.18 0.025 260);
  --surface-raised: oklch(0.22 0.03 260);
  --surface-overlay: oklch(0.28 0.035 260 / 0.7);
  --surface-glass: oklch(0.20 0.025 260 / 0.65);

  /* Borders & Highlights */
  --border-subtle: oklch(1 0 0 / 0.08);
  --border-active: oklch(1 0 0 / 0.16);
  --border-glow: oklch(0.65 0.24 270 / 0.35);

  /* Semantic Intent Tokens */
  --brand-primary: oklch(0.62 0.22 265);
  --brand-accent: oklch(0.68 0.24 300);
  --brand-glow: oklch(0.62 0.22 265 / 0.25);

  --success: oklch(0.72 0.19 155);
  --success-bg: oklch(0.72 0.19 155 / 0.12);
  --warning: oklch(0.78 0.18 75);
  --warning-bg: oklch(0.78 0.18 75 / 0.12);
  --danger: oklch(0.65 0.22 25);
  --danger-bg: oklch(0.65 0.22 25 / 0.12);

  /* Text hierarchy */
  --text-primary: oklch(0.98 0.005 260);
  --text-secondary: oklch(0.78 0.015 260);
  --text-muted: oklch(0.58 0.02 260);
}
```

### Contrast: APCA over flat WCAG 2.x ratios

The plain 4.5:1 WCAG 2.x ratio undersells how hard some saturated-hue/dark-background pairings actually are to read. If you're choosing text color against a busy background, the APCA lightness-contrast model ($L_c$) is a better gut check than the flat ratio — rough targets that have worked here: fine print/tabular data around $L_c \ge 90$, body copy around $L_c \ge 75$, headers and button labels around $L_c \ge 60$, icons/borders around $L_c \ge 45$. These are guidelines to sanity-check against, not a gate — the real accessibility floor is WCAG (§6).

### `color-mix` / `light-dark()` for hover states and theming

```css
:root {
  color-scheme: light dark;
  --surface-primary: light-dark(var(--surface-page), oklch(0.14 0.02 260));
  --text-primary: light-dark(oklch(0.18 0.02 260), oklch(0.98 0.005 260));
  --brand-surface-tint: color-mix(in oklab, var(--brand-primary) 12%, transparent);
  --brand-hover-border: color-mix(in oklch, var(--brand-primary) 80%, white);
}
```

### Glass / elevated surfaces

A pattern that's read well for elevated panels — backdrop blur, a subtle top-edge highlight, layered shadow instead of one hard one:

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

## 2. Platform primitives worth reaching for before a JS library

These native CSS/HTML features cover most of what a UI library would otherwise be pulled in for — worth checking before adding a dependency.

**CSS Anchor Positioning** — anchor a popover/tooltip to its trigger without a JS positioning library:
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

**`field-sizing: content`** — auto-expanding textareas without a `scrollHeight` listener:
```css
textarea.auto-expanding-input { field-sizing: content; min-height: 2.5lh; max-height: 12lh; }
```

**Native `popover="auto"` / `<dialog>`** — avoids z-index wars and gets light-dismiss for free:
```html
<button popovertarget="order-filter-menu" class="btn btn-secondary">Filter</button>
<div id="order-filter-menu" popover="auto" class="filter-popover"><!-- Content --></div>
```
Entry/exit animation via `@starting-style`:
```css
[popover] {
  opacity: 0;
  transform: translateY(-8px) scale(0.96);
  transition: opacity 0.2s cubic-bezier(0.16, 1, 0.3, 1), transform 0.2s cubic-bezier(0.16, 1, 0.3, 1),
    display 0.2s allow-discrete, overlay 0.2s allow-discrete;
}
[popover]:popover-open { opacity: 1; transform: translateY(0) scale(1); }
@starting-style { [popover]:popover-open { opacity: 0; transform: translateY(-8px) scale(0.96); } }
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

**`content-visibility: auto`** — keeps a long ledger/inventory table scrolling smoothly by skipping paint work for off-screen rows:
```css
.ledger-table tbody tr { content-visibility: auto; contain-intrinsic-size: auto 44px; }
```

**Container Queries + Subgrid** — components that adapt to their own container, and rows that align across separate card wrappers:
```css
.catalog-grid { container-type: inline-size; container-name: catalog; }
@container catalog (min-width: 520px) {
  .book-card { display: grid; grid-template-columns: 120px 1fr auto; gap: 1.25rem; }
}
.card-subgrid { display: grid; grid-template-columns: subgrid; grid-column: 1 / -1; align-items: center; }
```

**Fluid type + balanced wrapping** — avoids orphan words on headlines:
```css
.section-headline { font-size: clamp(1.25rem, 1rem + 1.2cqi, 2rem); text-wrap: balance; }
.section-summary { font-size: clamp(0.875rem, 0.8rem + 0.4cqi, 1.0625rem); line-height: 1.55; text-wrap: pretty; }
```

---

## 3. Motion

Spring-feeling easing reads better than linear or generic cubic-bezier transitions for hover/press feedback:

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

`document.startViewTransition()` gives smooth native-feeling morphs on tab switches and filtering, with a plain fallback when unsupported:
```javascript
function switchView(updateDomCallback) {
  if (!document.startViewTransition) { updateDomCallback(); return; }
  document.startViewTransition(() => updateDomCallback());
}
```
Note: View Transitions are available as a helper but intentionally unwired in most of the app right now — check `UX_PATTERNS.md` before calling it on something new.

**Optimistic UI** for mutations tends to feel much faster than it measures: update the UI on click, show a light pending affordance, roll back with a toast + retry on error rather than blocking the screen until the network responds.

**Loading states**: a shimmer that mirrors the real content's geometry (height, radius) reads better than a spinner, and holding `min-height` keeps layout from jumping when data arrives.

---

## 4. Interaction details that tend to matter

- **Keyboard:** roving `tabindex` on button strips/tabs/table rows (`0` on the selected item, `-1` on siblings); `aria-activedescendant` for search/command-palette inputs so focus stays in the text field while navigating suggestions.
- **Form validation timing:** avoid showing an error while someone is still typing into a fresh field; validate on blur; clear the error the moment the field becomes valid again during a fix. Getting this backwards (erroring mid-type) is a common source of "the form feels broken" reports.
- **Touch target size** — see §0.5, this one's a real rule, not a preference.
- **Labels:** persistent, top-aligned, 4–6px above the field reads more reliably than a floating label (which tends to drop below legible size once filled).
- **Input modes:** match the keyboard to the data — `inputmode="decimal"` for currency, `inputmode="numeric"` for quantities, `type="email"` for email.

---

## 5. Modals, dialogs, sheets

A scrolling modal body needs a gradient scrim under the pinned header/footer, or text gets hard-clipped at the seam:
```css
.modal-header { position: sticky; top: 0; background: var(--surface-page); border-bottom: 1px solid var(--border-subtle); z-index: 2; }
.modal-header::after {
  content: ''; position: absolute; top: 100%; left: 0; right: 0; height: 14px;
  background: linear-gradient(to bottom, var(--surface-page), transparent); pointer-events: none;
}
```

Focus handling that's worked well for dialogs here: remember what was focused before opening, move focus into the dialog on open, trap Tab/Shift+Tab inside it (native `<dialog>.showModal()` or `inert` does most of this for you), support Esc and backdrop-click to dismiss, and restore focus on close. `scrollbar-gutter: stable` on the root avoids a horizontal shift when the scrollbar appears/disappears.

On narrow viewports (< 768px), morphing into a bottom sheet (`padding-bottom: env(safe-area-inset-bottom)`, drag-to-dismiss) tends to feel more native than a centered dialog shrunk down.

---

## 6. Accessibility — these are real requirements, not style choices

Getting these wrong excludes someone from using the app, so treat this section differently from the "house convention" material above it.

**Focus visibility** (WCAG 2.2 SC 2.4.12) — a double-ring keeps the indicator visible on both light and dark surfaces:
```css
:focus-visible { outline: 2px solid var(--brand-primary); outline-offset: 2px; box-shadow: 0 0 0 4px var(--surface-page); }
```

**Non-obscured focus** (WCAG 2.2 SC 2.4.11) — a focused element must not end up hidden behind a sticky header/footer; `scroll-padding-top`/`scroll-padding-bottom` on the scroll container handles this.

**Live regions** — create `aria-live="polite"`/`"assertive"` containers once at initial render and update their contents; destroying and rebuilding them via `innerHTML` breaks the mutation listener assistive tech relies on.

**Reduced motion** — respect it without exception:
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

## 7. A quick self-check, when it's worth running

Not a gate to clear on every change — but for something that touches a lot of surface area (a new screen, a significant redesign of an existing one), these are the questions worth asking before calling it done:

- Does text meet a real contrast standard, not just "looks fine to me"?
- Are surfaces using the defined tokens rather than a new one?
- If this touched a modal, is the padding/scrim structure still intact?
- Are touch targets ≥ 44px?
- Does it hold together on mobile, tablet, and wide layouts?
- Do money/quantity columns use tabular figures and right alignment?
- Does keyboard navigation and focus visibility work?
- Does `prefers-reduced-motion` still get respected?
- Are the underlying data/calculation functions untouched?

If most of these don't apply to what you're doing (a copy tweak, a one-off internal tool screen), skip the checklist — it's here for when it's useful, not as paperwork.
