## 2024-06-07 - Add aria-label to icon-only buttons
**Learning:** Found icon-only buttons (`🗑️`, `-`, `+`) lacking `aria-label`s in `src/main.js`. This is a common accessibility issue for components that rely on visual cues (icons) without providing text alternatives for screen readers.
**Action:** Always ensure icon-only buttons have descriptive `aria-label` attributes to ensure they are accessible. For example, `aria-label="Delete entry"`, `aria-label="Decrease quantity"`, and `aria-label="Increase quantity"`.
