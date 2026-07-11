# Shippo Reconciliation Controls Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a close control and a safe clear-list control to the Shippo reconciliation worklist.

**Architecture:** Keep the panel in the existing Tax Center markup. Closing is transient UI state; clearing persists `shippingMatchStatus: 'dismissed'` on imported Shippo expenses so ledger records remain intact while dismissed rows leave the worklist.

**Tech Stack:** Vanilla HTML, CSS, ES modules, Vitest.

## Global Constraints

- Vanilla JS: no framework, no new build step.
- Offline resilience: persist the dismissal through the existing Tax Center save path.
- Financial ledger precision: never delete imported expenses when clearing the list.

---

### Task 1: Add safe Shippo worklist controls

**Files:**
- Modify: `index.html:1618-1627`
- Modify: `src/main.js:16307-16335` and the export/window wiring near the end of the file
- Test: `tests/shippo-reconciliation-controls.test.js`

**Interfaces:**
- Produces `closeShippingReconciliation()` and `clearShippingReconciliationList()` for inline handlers.
- Uses the existing `saveTaxCenter()`, `renderTaxCenter()`, `showToast()`, and `confirmDialog()` helpers.

- [ ] **Step 1: Write the failing test**

Assert that the panel contains close and clear controls, that the renderer excludes dismissed expenses, and that both handlers are exposed.

- [ ] **Step 2: Run the focused test and verify it fails**

Run: `npm test -- --run tests/shippo-reconciliation-controls.test.js`
Expected: FAIL because the controls and dismissal behavior do not yet exist.

- [ ] **Step 3: Implement the controls and persistence**

Add header buttons, a transient `hidden` state for close/reopen, filter out dismissed expenses, and implement a confirmation-gated clear action that marks only currently visible Shippo reconciliation expenses as dismissed and saves through `saveTaxCenter({ rethrow: true })`.

- [ ] **Step 4: Run focused and full verification**

Run: `npm test -- --run tests/shippo-reconciliation-controls.test.js`
Expected: PASS.

Run: `npm test -- --run`
Expected: all tests pass.

- [ ] **Step 5: Review the diff**

Run: `git diff --check; git diff --stat`
Expected: no whitespace errors and only the planned files changed.
