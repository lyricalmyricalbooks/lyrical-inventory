# Open Call Command Centre Design

## Goal

Transform the publisher-only Open Call workspace from a dense all-in-one screen into an action-first campaign command centre. The page should make the next safe action obvious while retaining every existing contributor, Gmail, template, queue, and offline-sync capability.

## Scope

This is a UX/UI and rendering-structure enhancement for the Open Call tab only. It does not change the contributor data model, Open Call persistence format, Firebase/LocalStorage sync strategy, Apps Script, backend, or email-sending behavior.

## Experience principles

- Start with decisions that unblock the campaign, not configuration.
- Give each contributor one unmistakable next action.
- Keep advanced tools present but visually quiet until intentionally opened.
- Preserve the editorial Lyricalmyrical character: warm paper surfaces, restrained gold emphasis, confident serif display type, and generous whitespace.
- Make every interaction understandable without relying only on emoji, colour, or hover state.

## Information architecture

### 1. Campaign header and attention rail

The upper workspace identifies the active Open Call project and its state. It contains three live action cards driven by existing inbox/outbox and contributor data:

1. **Updates to review**: number of inbox proposals waiting for approval, with a direct scroll/focus route to the review queue.
2. **Contributors waiting**: people whose next step is overdue, including the oldest waiting duration when available, with a direct filter into the contributor workboard.
3. **Ready to send**: queued emails awaiting user confirmation, with a direct scroll/focus route to the outbox.

The highest-priority non-zero card is visually promoted and supplies a plain-language CTA. Zero states remain useful but quiet, explaining that the queue is clear rather than presenting an empty number as an error.

### 2. Pipeline health bar

The five existing stages remain unchanged: Selection, Credit, CMYK, Files, and Pre-order. Their visual treatment becomes a compact pipeline bar directly under the attention rail.

- Each stage displays count and human-readable state.
- Stage controls filter the contributor list using the existing stage filtering behavior.
- The active filter receives a visible selected state and exposes a clear-filter action.
- Controls are semantic buttons with `aria-pressed`; Enter and Space match pointer activation.
- On narrow screens, the bar scrolls horizontally without clipping labels.

### 3. Priority queues

The existing review inbox and ready-to-send outbox become the first operational content after pipeline health.

- Inbox rows retain approve/dismiss behavior and explain the proposed stage change.
- Outbox rows retain send/remove behavior and state that messages are never sent without confirmation.
- Empty queues collapse to a concise, positive status line rather than consuming dashboard space.
- Queue transitions use subtle motion only when `prefers-reduced-motion` permits it.

### 4. Contributor workboard

Contributor cards become scannable work items, ordered by the selected sorting mode and filtered with the existing search/stage controls.

- **Header:** avatar, contributor name, email/deliverability state, current waiting status, and compact stage progress.
- **Primary action:** one context-aware CTA matching the existing next stage email or review task.
- **Secondary actions:** scan, email-status, edit, and destructive removal move into a labelled overflow/details affordance. Remove never competes visually with the primary action.
- **Details:** selected photos, the full interactive stage timeline, Gmail thread controls, notes, and supporting actions appear only when the user opens the contributor details.
- Long names, email addresses, and photo filenames wrap safely without breaking actions.

### 5. Campaign tools

The project switcher, contributor intake, Gmail import/scan, sender configuration, templates, search/filter controls, bulk actions, and CSV export remain available in a dedicated secondary layer.

- Desktop presents a calm, sticky campaign rail with project and intake controls.
- Tablet/mobile turns this rail into a labelled disclosure above the workboard; it never creates a nested-scroll trap.
- The email template designer is collapsed initially. Its summary states the active stage and template status.
- Opening the designer creates a focused full-width editor/preview composition. Existing subject/body/preview IDs, merge-token functions, and stage switching remain compatible.
- Merge fields become an intentional insert control with accessible labels; missing fields are described in preview and before sending.

## Visual system

Use existing Open Call styling as the base, consolidated through the final scoped `#opencall-body` CSS layer.

- Define or reuse CSS custom properties for warm canvas, paper surface, ink, muted text, gold action, success, danger, border, low/high elevation, radius, and motion.
- Use a restrained elevation hierarchy: cards are separated by surface and soft shadow, not dense outlines.
- Limit strong gold to primary action, current stage, and active filters. Reserve premium rose/red for destructive actions.
- Establish deliberate typography for every control; no browser-default button/input text.
- Maintain WCAG AA contrast for text and selected/focus states.

## Interaction and feedback

- Preserve every existing inline handler and ID unless its companion logic is updated in the same change.
- Project changes, queue actions, contributor edits, stage movement, import, and template saves continue through the existing persistence path, including offline fallback and queued sync.
- Buttons expose disabled, hover, active, focus-visible, and loading/pending states where asynchronous work already exists.
- Keyboard focus is never moved unexpectedly. A keyboard-initiated queue action may move focus to the relevant queue heading after rendering; pointer actions do not.
- Use the existing toast system for user feedback; no native alerts or confirms.

## Responsive behaviour

- **Desktop (1100px+):** persistent campaign rail, action-focused central workspace, two-column queue treatment where width permits.
- **Tablet (761px–1099px):** campaign rail becomes a top disclosure; cards retain a structured header/action row without overflow.
- **Mobile (375px–760px):** single column; full-width primary CTAs; pipeline is horizontally scrollable; campaign tools and contributor details use disclosures; email preview follows editor.
- All primary controls meet a 44px minimum touch target on touch layouts.

## Files and integration boundaries

- Modify `src/main.js` within `renderOpenCall()` and only the related Open Call UI helpers needed for semantic controls or disclosure state.
- Modify `src/style.css` in the final scoped Open Call override layer to avoid unintended global regressions.
- Preserve `src/lib/opencall.js` and its existing tests unless a new UI-derived helper is genuinely needed.
- Do not modify `apps-script/Code.gs`, `public/gas-code.txt`, backend services, or Open Call persistence schema for this redesign.

## Verification

1. Run `npm run lint`, `npm run lint:contrast`, `npm run test`, and `npm run build`.
2. Run the app and inspect the Open Call tab at desktop, tablet, and 375px mobile widths.
3. Exercise project switching, contributor add/import, search/filter/sort, pipeline filtering, inbox review, outbox confirmation, template editing/preview, Gmail scan entry points, contributor details, photo curation, and bulk actions using the established dry-run path where available.
4. Verify empty, loading, long-content, bounced/unsubscribed, and mixed-stage contributor states.
5. Keyboard-test all controls, focus treatment, disclosure behaviour, and modal Escape handling.
6. Compare the rendered command centre to the selected visual concept and record a fidelity ledger covering hierarchy, layout, typography, palette, controls, responsive behavior, and visible copy.

## Intentional exclusions

- No change to email copy, message delivery rules, contributor stages, Firestore rules, Apps Script, backend APIs, or author role permissions.
- No new framework, server, secret, or third-party runtime dependency.
