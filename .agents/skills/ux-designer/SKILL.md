---
name: ux-designer
description: State-of-the-Art Design Engineering & Elite UX/UI Architecture system. Employs OKLCH perceptual color, CSS Anchor Positioning, Popover API, field-sizing, APCA contrast, Container Queries, Subgrid, View Transitions, spring physics, and cognitive ergonomics to craft world-class, accessible, and high-converting web interfaces.
---

# State-of-the-Art UX/UI Design Engineering (/ux-designer)

Apply this skill whenever building, auditing, polishing, or refactoring user interfaces across this project.

---

## 0. Non-Negotiable Core Architectural Invariants

Every user-facing interface, component, or style change in this codebase MUST uphold these core invariants:

1. **Vanilla JS & Zero Runtime Dependencies:**
   - No React, Vue, Svelte, or external UI runtimes.
   - Leverage modern **native browser platform primitives** (CSS Anchor Positioning, native `<dialog>` and `popover="auto"`, `field-sizing: content`, `content-visibility: auto`, `inert`) instead of bloated JavaScript libraries.
   - Vite is a thin bundler and must stay thin.

2. **Canonical Semantic Surfaces Only (MANDATORY):**
   - **NEVER** invent or reference undefined tokens such as `var(--surface)`, `var(--surface2)`, `var(--surface3)`, `var(--surface4)`, or `var(--card)`.
   - Use **ONLY** canonical defined tokens from `src/styles/system.css`:
     - `var(--surface-page)`: Modal containers, drawers, and page backgrounds.
     - `var(--surface-raised)`: Elevated cards, active stepper tabs, input wells.
     - `var(--surface-sunken)`: Recessed segmented control strips, calculator wells, preset bars.
     - `var(--surface-inset)`: Inner badges, step number circles, chip pills.
     - `var(--surface-inverse)` / `var(--surface-inverse-raised)`: Fixed dark chrome.

3. **Modal Shell Scroll Architecture (MANDATORY):**
   - **NEVER** add vertical padding (`padding: 24px ... !important` or `padding-top/bottom`) to `.modal` sub-classes.
   - `.modal` MUST keep `padding: 0 var(--space-6)` with `overflow: auto`.
   - Pinned headers (`.modal-title`) and footers (`.modal-footer`) own top/bottom block padding and hairline gradient scrims (`.modal-title::after`, `.modal-footer::before`). Ad-hoc vertical padding destroys the scroll seam.

4. **Steppers & Form Contrast:**
   - Inactive tabs must use `var(--content-secondary)` on `var(--surface-sunken)` with `var(--surface-inset)` step circles.
   - Active tabs must use `var(--surface-raised)` with `var(--content-primary)` and `box-shadow: var(--elev-1)`.
   - Never use `--text3` for interactive control labels or metadata sub-headers.

5. **Financial & Data Engineering Invariants:**
   - **Tabular Figures (`tnum`):** All monetary figures, quantities, stock balances, and timestamps must use monospace tabular numbers (`font-feature-settings: "tnum" 1, "zero" 1` or `font-family: 'DM Mono', monospace`) for vertical decimal alignment.
   - **Right Alignment:** All currency figures and tabular numerical amounts must be aligned to the right.
   - **Decouple Styling from Data Pipelines:** DO NOT rewrite, simplify, or refactor underlying data aggregation functions (`buildOrderTimeline`, `deriveOnHand`, `inventoryBreakdown`). Keep data assembly 100% intact; modify ONLY CSS tokens, HTML wrapper classes, badge elements, and subtext formatting.
   - **Defensive Fallbacks:** Always wrap dynamic template outputs with nullish coalescing (`${row.after ?? row._after ?? '—'}`) to prevent `'undefined'` text rendering.
   - **Shipping Fees Currency Invariant:** All customer shipping values are natively in CAD and must NEVER undergo FX rate conversion.

---

## 1. Perceptual Color Science & Visual Engine (OKLCH, P3 Gamut & APCA)

### A. Perceptually Uniform Color Architecture (OKLCH)
Never rely on RGB or legacy HSL where hue shifts distort perceived luminance. Use **OKLCH** (`oklch(L C H / alpha)`) for mathematically uniform perceptual lightness across light/dark themes:

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

  /* Semantic Intent Tokens (High Perceptual Uniformity) */
  --brand-primary: oklch(0.62 0.22 265);
  --brand-accent: oklch(0.68 0.24 300);
  --brand-glow: oklch(0.62 0.22 265 / 0.25);
  
  --success: oklch(0.72 0.19 155);
  --success-bg: oklch(0.72 0.19 155 / 0.12);
  --warning: oklch(0.78 0.18 75);
  --warning-bg: oklch(0.78 0.18 75 / 0.12);
  --danger: oklch(0.65 0.22 25);
  --danger-bg: oklch(0.65 0.22 25 / 0.12);

  /* Text Contrast Hierarchy (APCA & WCAG 2.2 AAA Compliant) */
  --text-primary: oklch(0.98 0.005 260);
  --text-secondary: oklch(0.78 0.015 260);
  --text-muted: oklch(0.58 0.02 260);
}
```

### B. WCAG 3.0 APCA (Accessible Perceptual Contrast Algorithm)
Legacy WCAG 2.x 4.5:1 ratios fail human visual perception on saturated hues and dark backgrounds. Apply the **APCA Lightness Contrast ($L_c$)** model:
- **$L_c \ge 90$**: Mandatory for fine print, secondary labels, and monospace tabular data (< 14px or font-weight < 400).
- **$L_c \ge 75$**: Minimum threshold for standard body copy (16px regular / 14px medium).
- **$L_c \ge 60$**: Minimum for prominent section headers (> 24px regular / > 18px bold) and primary interactive button labels.
- **$L_c \ge 45$**: Minimum for non-text icons, active border boundaries, or decorative graphical chips. Never render content under $L_c 30$.

### C. Relative Color Blending & Dynamic Theming (`color-mix` & `light-dark`)
Use modern CSS color functions to dynamically derive hover states and theme variants without repetitive class overrides:
```css
:root {
  color-scheme: light dark;

  /* Native light-dark() declarative mapping */
  --surface-primary: light-dark(var(--surface-page), oklch(0.14 0.02 260));
  --text-primary: light-dark(oklch(0.18 0.02 260), oklch(0.98 0.005 260));

  /* Dynamic alpha-tinting via color-mix */
  --brand-surface-tint: color-mix(in oklab, var(--brand-primary) 12%, transparent);
  --brand-hover-border: color-mix(in oklch, var(--brand-primary) 80%, white);
}
```

### D. Apple & Linear Surface Aesthetics: Glassmorphism & Inset Edges
Combine hardware-accelerated backdrop filters, linear top-edge internal highlights, and ambient border glows:
```css
.glass-panel {
  background: var(--surface-glass);
  backdrop-filter: blur(20px) saturate(190%);
  -webkit-backdrop-filter: blur(20px) saturate(190%);
  border: 1px solid var(--border-subtle);
  box-shadow:
    0 1px 2px oklch(0 0 0 / 0.12),
    0 8px 24px -4px oklch(0 0 0 / 0.25),
    inset 0 1px 0 oklch(1 0 0 / 0.10); /* Crisp top-edge light catch */
}
```

---

## 2. Modern CSS Specifications & Platform Primitives (2025/2026)

### A. CSS Anchor Positioning
Anchor tooltips, popovers, and contextual action menus directly to trigger elements without fragile JavaScript bounding box calculations or external positioning libraries:
```css
/* Anchor target element */
.action-trigger {
  anchor-name: --action-menu-anchor;
}

/* Positioned dropdown/menu */
.action-popover {
  position: fixed;
  position-anchor: --action-menu-anchor;
  top: anchor(bottom);
  left: anchor(start);
  position-try-fallbacks: flip-block, --flip-inline;
  margin-top: 4px;
}

@position-try --flip-inline {
  left: auto;
  right: anchor(end);
}
```

### B. Native Auto-Expanding Fields (`field-sizing: content`)
Replace bulky JavaScript `input` listeners and `scrollHeight` hacks with native browser field auto-sizing:
```css
textarea.auto-expanding-input {
  field-sizing: content;
  min-height: 2.5lh;
  max-height: 12lh;
}
```

### C. Native Popover API & `<dialog>` with Discrete Transitions
Use the native HTML top-layer to prevent z-index wars and handle light-dismiss natively:
```html
<button popovertarget="order-filter-menu" class="btn btn-secondary">Filter</button>
<div id="order-filter-menu" popover="auto" class="filter-popover">
  <!-- Content -->
</div>
```
Animate entry and exit smoothly using `@starting-style` and discrete transition behaviors:
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

[popover]:popover-open {
  opacity: 1;
  transform: translateY(0) scale(1);
}

@starting-style {
  [popover]:popover-open {
    opacity: 0;
    transform: translateY(-8px) scale(0.96);
  }
}
```

### D. Background Lockdown with the `inert` Attribute
Lock interaction, focus traversal, and assistive technology for inactive background DOM trees when presenting modals or slide-overs:
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

### E. Zero-Dependency High-Density Rendering (`content-visibility`)
Keep dense inventory tables, ledger grids, and transaction timelines scrolling at 60/120fps by skipping layout and paint passes for off-screen rows:
```css
.ledger-table tbody tr {
  content-visibility: auto;
  contain-intrinsic-size: auto 44px;
}
```

### F. Container Queries & Subgrid Alignment
Components must adapt to their immediate parent container rather than viewport dimensions:
```css
.catalog-grid {
  container-type: inline-size;
  container-name: catalog;
}

@container catalog (min-width: 520px) {
  .book-card {
    display: grid;
    grid-template-columns: 120px 1fr auto;
    gap: 1.25rem;
  }
}

/* CSS Subgrid: align row items across separate card wrappers */
.card-subgrid {
  display: grid;
  grid-template-columns: subgrid;
  grid-column: 1 / -1;
  align-items: center;
}
```

### G. Fluid Typography & Balanced Text Wrapping
Avoid awkward orphan words and uneven headline wraps:
```css
.section-headline {
  font-size: clamp(1.25rem, 1rem + 1.2cqi, 2rem);
  text-wrap: balance;
}

.section-summary {
  font-size: clamp(0.875rem, 0.8rem + 0.4cqi, 1.0625rem);
  line-height: 1.55;
  text-wrap: pretty;
}
```

---

## 3. Liquid Motion, Spring Kinetics & Micro-Interactions

### A. Physics-Based Damped Spring Curves
Avoid mechanical linear or generic cubic-bezier transitions. Damped spring kinetics model physical mass and velocity:
- **Stiffness ($k$):** $280\text{–}350$ (immediate response upon actuation).
- **Damping ($d$):** $28\text{–}35$ (critical damping eliminates endless wobble while preserving natural settlement).
- **Mass ($m$):** $1.0$.

CSS Spring Token Architecture:
```css
:root {
  --ease-spring: cubic-bezier(0.16, 1, 0.3, 1);
  --ease-bounce: cubic-bezier(0.34, 1.56, 0.64, 1);
  --ease-out: cubic-bezier(0, 0, 0.2, 1);
}

.interactive-target {
  transition:
    transform 0.2s var(--ease-spring),
    box-shadow 0.25s var(--ease-spring),
    background-color 0.15s var(--ease-out);
}

.interactive-target:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 24px -4px var(--brand-glow);
}

.interactive-target:active {
  transform: scale(0.975);
}
```

### B. View Transitions API (`document.startViewTransition`)
Provide seamless, native-app morphing transitions during tab switches, list filtering, and detail expansions:
```javascript
function switchView(updateDomCallback) {
  if (!document.startViewTransition) {
    updateDomCallback();
    return;
  }
  document.startViewTransition(() => {
    updateDomCallback();
  });
}
```

### C. Optimistic UI & Transactional States (The Linear Model)
1. **Synchronous Mutation:** Mutate UI state immediately on user click/tap before sending the asynchronous network payload.
2. **Transient Affordance:** Render a discrete mutation indicator (e.g. subtle 75% opacity, trailing pulse tick) without locking the screen.
3. **Reconciliation & Rollback:** On API error, roll back the local change with a gentle micro-shake animation and trigger an actionable toast with a "Retry" CTA.

### D. Zero-CLS Skeleton Shimmer Loaders
- Never use generic spinner GIFs or full-card pulsing blocks.
- Mirror exact geometric heights and border-radiuses with an animated horizontal gradient shimmer.
- Set explicit `min-height` on containers to ensure **Cumulative Layout Shift (CLS) = 0** when data resolves.

### E. Semantic Multi-Tier Haptic Feedback
On mobile/touch devices, provide tactile feedback matching the interaction tier:
- **Selection / Tick (10ms):** Stepper increment, segmented notch switch.
- **Commit / Action (20ms):** Primary button press, modal confirm.
- **Success (Crescendo Double-Tap):** Checkout completion, successful cloud sync.
- **Error (Triple Sharp Pulse):** Validation failure, destructive action warning.

---

## 4. Cognitive Ergonomics & High-Velocity Interaction

### A. Keyboard-First Ergonomics
- **Command Palette (`Cmd/Ctrl + K`):** Quick jump to any book, partner, invoice, or setting.
- **Roving `tabindex` vs `aria-activedescendant`:**
  - Use roving `tabindex` on button strips, segmented tabs, and tables (`tabindex="0"` on selected item, `-1` on siblings).
  - Use `aria-activedescendant` on search inputs and command palettes to keep focus in the text field while navigating suggestions.

### B. Form Validation Ergonomics: "Reward Early, Punish Late"
1. **Initial Input:** NEVER display validation error messages while the user is actively typing in a clean field.
2. **On Blur (First Pass):** Validate upon blur. If invalid, display a clear, conversational error message adjacent to the field.
3. **On Input (Fix Pass):** As soon as an invalid field becomes valid during typing, **immediately clear the error state** to provide instant reassurance.

### C. Touch Target Geometry & Slop Heuristics
- **Minimum Interactive Bounds:** $\ge 44\text{px} \times 44\text{px}$ for all touch targets (even if visible graphic is 24px, expand the click area with hit-slop padding or pseudo-elements).
- **Touch Slop Threshold (8–10px):** Prevent accidental button clicks when a user begins a swipe or scroll gesture. Use `touch-action: pan-y`.
- **Mobile Thumb Zone:** Anchor primary actions and key CTAs in the bottom 35% of handheld viewports. Keep destructive actions in high-friction secondary positions.

### D. Form Labeling & Input Modes
- **Persistent Top-Aligned Labels:** Always place labels 4–6px above the field. NEVER use floating labels (they drop below legible font sizes and vanish when filled).
- **Explicit Input Modes:**
  - Currency / Monetary: `<input type="text" inputmode="decimal" pattern="[0-9]*" autocomplete="off">`
  - Quantities / Integers: `<input type="text" inputmode="numeric" pattern="[0-9]*">`
  - Email: `<input type="email" inputmode="email" autocomplete="email" autocapitalize="none">`

---

## 5. Modal, Dialog & Sheet Architecture

### A. Pinned Seams & Gradient Scrims
When modal content scrolls inside a dialog, hard-clipped borders cut text characters abruptly. Prevent this with 12–16px vertical gradient scrims that smoothly fade text into the pinned header and footer:
```css
.modal-header {
  position: sticky;
  top: 0;
  background: var(--surface-page);
  border-bottom: 1px solid var(--border-subtle);
  z-index: 2;
}

.modal-header::after {
  content: '';
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  height: 14px;
  background: linear-gradient(to bottom, var(--surface-page), transparent);
  pointer-events: none;
}
```

### B. 6-Point Focus Management Lifecycle
Every dialog implementation must execute this 6-point lifecycle:
1. **Origin Storage:** Record `document.activeElement` before launching the modal.
2. **Initial Placement:** Shift focus to the primary interactive element (or modal title for sensitive forms).
3. **Focus Trapping:** Confine Tab / Shift+Tab cycles within the active dialog using native `<dialog>.showModal()` or `inert`.
4. **Scroll Lock Stability:** Prevent horizontal page shifts by setting `scrollbar-gutter: stable` on the document root.
5. **Escape & Light Dismiss:** Support the Esc key and backdrop clicks for dismissal.
6. **Focus Restoration:** Return focus cleanly to the original invoking element upon closing.

### C. Responsive Bottom-Sheet Morphing
- **Desktop (≥ 768px):** Centered modal dialog with backdrop blur.
- **Mobile (< 768px):** Auto-morph into a bottom sheet anchored to the bottom edge with `padding-bottom: env(safe-area-inset-bottom)` and drag-down-to-dismiss gesture handling.

---

## 6. Accessibility Engineering (WCAG 2.2 & ARIA APG)

### A. Double-Ring Focus Indicator (WCAG 2.2 Success Criterion 2.4.12)
Ensure high-contrast visibility on both dark and light backgrounds without obscuring content:
```css
:focus-visible {
  outline: 2px solid var(--brand-primary);
  outline-offset: 2px;
  box-shadow: 0 0 0 4px var(--surface-page);
}
```

### B. Non-Obscured Focus (WCAG 2.2 Criterion 2.4.11)
When an element receives keyboard focus, it must never be hidden behind sticky headers, footers, or floating action bars. Use `scroll-padding-top` and `scroll-padding-bottom` on scrollable containers.

### C. Permanent Live Regions
Screen reader announcements (`aria-live="polite"` or `"assertive"`) must use a permanent DOM element created at initial application render. Never destroy and rebuild live containers via `innerHTML`, as this breaks mutation listeners in assistive software.

### D. Reduced Motion Support
Respect user preferences instantly:
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

## 7. Comprehensive 12-Point SOTA Verification Matrix

Before delivering ANY user-facing modification, verify all 12 criteria:

- [ ] **1. Aesthetic Polish:** Does the interface reflect elite standards (Linear/Vercel/Apple) with crisp borders, subtle glassmorphism, and balanced visual hierarchy?
- [ ] **2. APCA & WCAG Contrast:** Do body text ($L_c \ge 75$), fine tabular digits ($L_c \ge 90$), and controls ($L_c \ge 60$) meet APCA standards?
- [ ] **3. Canonical Semantic Surfaces:** Are surfaces strictly using `--surface-page`, `--surface-raised`, `--surface-sunken`, `--surface-inset`, or `--surface-inverse`?
- [ ] **4. Modal Shell Architecture:** Does `.modal` preserve `padding: 0 var(--space-6)` with pinned header/footer gradient scrims and zero vertical modal padding?
- [ ] **5. Touch Target Bounding Box:** Are all interactive targets $\ge 44\text{px} \times 44\text{px}$ with generous hit padding?
- [ ] **6. Responsive Fluidity:** Does layout adapt across mobile (375px), tablet (768px), and widescreen containers using Container Queries?
- [ ] **7. Tabular Figures & Right Alignment:** Are all prices, quantities, and balances formatted with `tnum` / `DM Mono` and right-aligned?
- [ ] **8. Keyboard & Focus Lifecycle:** Does Tab navigation work cleanly with high-visibility double-ring focus outlines and 6-point modal focus trapping?
- [ ] **9. Form Validation Ergonomics:** Is the "Reward Early, Punish Late" timing respected, with persistent top-aligned labels and appropriate `inputmode`?
- [ ] **10. Micro-Interactions & Spring Kinetics:** Do buttons and cards feature natural spring hover, active (`scale(0.975)`), and zero-CLS loading skeletons?
- [ ] **11. Motion Accessibility:** Does the interface respect `@media (prefers-reduced-motion: reduce)` with instant transitions?
- [ ] **12. Data Pipeline Integrity:** Are all existing financial amounts, state handlers, and calculation pipelines 100% preserved?
