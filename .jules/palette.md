## 2024-06-07 - Add aria-label to icon-only buttons
**Learning:** Found icon-only buttons (`🗑️`, `-`, `+`) lacking `aria-label`s in `src/main.js`. This is a common accessibility issue for components that rely on visual cues (icons) without providing text alternatives for screen readers.
**Action:** Always ensure icon-only buttons have descriptive `aria-label` attributes to ensure they are accessible. For example, `aria-label="Delete entry"`, `aria-label="Decrease quantity"`, and `aria-label="Increase quantity"`.

## 2026-09-11 - `tabindex="-1"` toggle buttons still need an accessible name
**Learning:** The Tax Centre trip-picker dropdown toggles (`.tc-trip-dropdown-btn`, "▼") in `index.html` had `tabindex="-1"` (intentionally skipped in Tab order since the paired text input handles typing) but no `aria-label` or `title` at all. `tabindex="-1"` only removes an element from sequential Tab navigation — screen readers browsing by virtual cursor still land on it, so it still needs a real accessible name and, since it toggles a menu, an `aria-expanded` state.
**Action:** Don't assume `tabindex="-1"` makes an icon-only control's accessible name optional. When adding a disclosure/toggle button, pair `aria-label` with `aria-expanded` kept in sync in the open/close JS handlers, not just a static HTML attribute.

## 2026-09-12 - Selection swatches with only a visual `.active` class are invisible to screen readers
**Learning:** The book-accent color swatches (`.accent-swatch-btn` in `index.html`, driven by `onCustomAccentInput()` in `src/main.js`) only signaled the currently-selected color via a CSS `.active` class (border/shadow/scale) — a sighted mouse user sees which color is picked, but a screen reader tabbing through the row hears identical, unlabeled buttons with no indication of which one is already chosen.
**Action:** Any "pick one of several visually-styled options" control (color swatches, size chips, preset buttons) needs both a real `aria-label` per option (title alone is a weak fallback) and an `aria-pressed`/`aria-current` toggled in the same JS that toggles the visual `.active` class — never let the selected state live in CSS only.
