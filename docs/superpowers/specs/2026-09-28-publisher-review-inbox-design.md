# Publisher Review Inbox design

Date: 2026-09-28
Status: Proposed design for user review
Scope: Publisher notifications and review, starting with receipts, postage, and refunds.

## Purpose and success criteria

The publisher needs to understand what happened, where it came from, what the app already changed, and what decision remains. Every unfinished task must remain reachable after closing a popup, reopening the app, or using another device.

Success means:
- One visible task per underlying issue, regardless of how often a background check runs.
- Opening or dismissing a notification never completes the work.
- Review opens the specific record and its supporting evidence.
- A task completes only after the underlying operation succeeds.
- Routine activity does not compete with requests for decisions.
- Existing stock, payment, receipt, and ledger calculations remain authoritative.

## Current foundations and gaps

- src/lib/attention-signals.js derives attention signals from current records. Preserve this as the authority for conditions such as missing amounts and unresolved refunds.
- src/lib/notification-log.js stores a device-local message history capped at 150. This can remain a recent activity cache, but cannot serve as durable task storage.
- src/lib/app-alert.js renders the shared popup stack. Website orders also use a separate popup in src/features/bigcartel.js.
- src/main.js renders the To-do page and bell. PR #1040 separates viewing the bell from acknowledging actionable messages, but it still uses read status rather than task completion.
- Existing receipt and shipping review screens already hold useful evidence and editing behavior. Adapt them to accept a stable record identifier.
- Actions currently stored as JavaScript strings must move to named destinations with validated parameters as each notification family migrates.

## Publisher interface

The existing To-do navigation entry becomes Review Inbox; its current internal tab route can remain for compatibility. Do not add a second task queue. Stock, catalogue, money, and setup signals remain reachable in this page while families are migrated.

The page contains:
1. A heading and a count of unresolved tasks.
2. Three tabs: Needs review, Waiting, Completed.
3. Filters for task type and book, plus search by visible record references.
4. A task list ordered by blocking problems, due date, then oldest unresolved item.
5. A review pane for the selected item.

Completed contains successful review outcomes and explicit discards. Routine automatic successes remain in Activity, accessible from the inbox and bell.

Unread is a dot indicating new information. The inbox badge counts unresolved tasks in Needs review; Waiting has its own count. Opening a task removes its new dot without changing its task state. The bell shows unseen notifications and links to the inbox; its count is explicitly labeled New updates.

### Wide layout sketch

| Review Inbox — 8 need review | |
| --- | --- |
| Needs review (8) · Waiting (2) · Completed | |
| Type: All · Book: All · Search | |
| Task list | Selected review |
| Postage amount missing · Canada Post | Source evidence |
| Receipt ready to review · Gmail | What the app has already done |
| Refund needs a decision · Stripe | Fields or decision required |
| ... | Changes that confirmation will make |
| | Save postage amount · Snooze · More |

At narrow widths, the list and review are separate views with a Back to inbox control that restores the previous filter, scroll position, and focus. The confirmation action remains reachable without covering fields.

### Example review: imported postage

Title: Postage amount missing
Reference: tracking number and linked order, when available
Source: Canada Post or the exact import channel
Evidence: receipt/label link; email sender, subject, and received time when available
Already done: State precisely whether the label, tracking, and expense were created or linked.
Needs your decision: Enter the amount shown on the receipt.
Proposed result: Update this postage expense to the entered amount in its recorded currency.
Primary action: Save postage amount
Secondary action: Snooze
More menu: Discard imported item, only when supported by the existing discard workflow.

Missing source information is labeled Source details unavailable. Never infer a sender, amount, or evidence document. Stored monetary values and current validation are reused.

### Example review: receipt

Show the original evidence beside extracted merchant, date, currency, amount, and category. Explain that extraction is a suggestion and whether the receipt is still a draft. Flag missing fields and possible duplicates with their matching records.

Primary action: File receipt, enabled only when current receipt validation passes.
Additional actions: Edit details, Snooze, Discard receipt.
Discard uses the existing remembered-discard behavior and explains whether files or expense records are affected.

### Example review: refund

Show the original sale, provider refund reference, amount, quantity, and the affected book. Distinguish a refund reported by the provider from any ledger operation already performed.

Never treat a payment refund as proof that copies returned to stock. If the existing reversal action returns copies, its review must state the exact stock and earnings effects and require the publisher to confirm those effects. Partial refunds and uncertain quantities remain manual review; they cannot use a bulk reverse action.

A reversal requires an explicit confirmation after this review. The task stays open if saving fails. Existing undo remains available only when the underlying operation supports it.

## Task and message lifecycle

Messages describe events. Tasks describe work. Each message may reference a task; several updates may belong to one task.

Task states:
- Needs review: a publisher decision or correction is required.
- Waiting: snoozed until a displayed time, or waiting for a named external condition.
- Completed: the source operation succeeded or a supported discard succeeded.

Saving is a temporary UI state, not a durable completion state. Failure restores the editable review with the entered values and a Retry action. A local-only success is labeled Saved on this device; pending cloud synchronization stays visible until acknowledged. Do not display Synced or complete cross-device delivery before confirmation.

Transitions:
- Open -> mark seen only.
- Close popup -> hide that popup only.
- Snooze -> Waiting with an explicit wake time; underlying work is retained.
- Wake time reached -> Needs review, if the underlying issue still exists.
- External condition resolves -> refresh from source records.
- Save/approve succeeds -> Completed with operation reference and timestamp.
- Discard succeeds -> Completed with outcome Discarded and the stated effects.
- Save/approve/discard fails -> Needs review with an error and retained input.
- Source record materially changes -> revalidate before applying the decision.
- A completed item acquires a genuinely new issue -> a new issue revision becomes Needs review.

No generic Mark complete action may hide a financial or data-integrity task. Non-actionable advice can have an explicit Not relevant disposition, reversible from history.

## Notification delivery policy

| Trigger | Surface | Persistence |
| --- | --- | --- |
| Publisher saves a form | Inline confirmation near the action | Reflect the saved state in the page |
| Normal background success | Activity | No popup by default |
| New review work | One grouped popup and inbox | Work remains until resolved |
| Integration blocks current work | Inline warning plus inbox item | Until resolved; repeat only on meaningful change |
| Retry succeeds | Update existing task/message | Avoid a second persistent success card |
| Destructive or stock-changing decision | Confirmation inside review | Wait for explicit choice |
| Device notification | Opt-in summary with inbox link | Respect per-device preference |

Show at most one new background popup at a time; additional related items update its count. A View all link opens the relevant inbox filter. Do not auto-open review panes or move keyboard focus when background events arrive. Important actionable messages remain available until dismissed. Dismissed popups do not reappear for the same unchanged issue.

During initial loading, establish the current queue before notifying. Unavailable or partially loaded data must not produce an All clear claim, missing-record resolution, or a burst of false alerts.

## Identity, persistence, and routing

Each migrated family supplies:
- Stable task identity: publisher scope + family + source record ID + issue type.
- Source record reference and revision/fingerprint.
- Explicit source label and available evidence references.
- Current condition, urgency, title, explanation, and validated review destination.
- Operation reference when an action completes.

Use source/provider identifiers rather than titles, array positions, or timestamps as identity. Distinct records never merge solely because they share an alert kind. Grouping changes presentation only; all member IDs remain available.

Derived conditions stay in their owning domain. Store publisher task metadata in a dedicated Firestore reviewTasks collection with publisher-only read/write rules. Store one document per stable task identity, with schemaVersion, source reference, source revision, seenAt, snoozedUntil, disposition, operation reference, and update timestamps. Use bounded queries and pagination for completed metadata; open work must never be removed by the 150-message notification cap.

Do not duplicate receipt files, financial totals, or entire source records into metadata. Metadata cannot override a still-unresolved domain condition without a matching successful operation/discard reference. Missing or unloaded source data means unavailable, not resolved.

Persist pending metadata changes locally until cloud acknowledgment. Use document revisions and transactional checks where appropriate to detect competing review decisions. All financial operations must also use their existing durable duplicate checks; disabling a button or changing task metadata is insufficient to prevent duplicate effects.

A typed action registry maps a known destination plus record ID to the relevant review adapter. Validate publisher permissions, record existence, and revision before enabling an operation. Unknown actions cannot execute stored code. Legacy history remains readable; legacy mutation actions must open a safe review destination rather than replay an old action.

## Components and boundaries

- Review task model: pure identities, states, grouping, sorting, and state transitions.
- Family adapters: derive receipt, postage, and refund tasks from their authoritative records.
- Review persistence: publisher metadata synchronization, offline queue, and conflict handling.
- Review router: validated record destinations and focus restoration.
- Inbox view: list, filters, selected pane, and explicit loading/error states.
- Notification policy: decides whether an event updates a popup, activity, or badge.
- Existing feature workflows: own validation, evidence, and all financial mutations.

Keep src/main.js as wiring; place the new modules in src/lib and src/features following repository conventions. No runtime framework dependency is needed.

## Migration sequence

1. Add task model, metadata persistence, routing, and inbox shell while preserving existing attention signals.
2. Migrate receipts and postage: exact record navigation, evidence, failed-save recovery, snooze, discard, and completion.
3. Migrate refund review with record-specific effects and explicit confirmation.
4. Consolidate order, payment, and integration notifications onto the same policy.
5. Remove obsolete action-string producers and duplicate popup paths only after their replacements cover existing behavior.

First delivery includes steps 1-3. Existing unmigrated tasks remain visible and link to their current screens. The later families use the same contract, without expanding the first delivery into a rewrite of all automations.

## Verification required for implementation

- Seen status never changes completion; closing an alert never hides open work.
- Reload and second-device views reconstruct unresolved work and saved dispositions.
- Repeated scans produce one task per record/issue, while distinct records remain separate.
- Snooze wakes correctly and respects changed or completed records.
- Failed saves retain input and cannot create a completed outcome.
- Concurrent/stale review attempts cannot repeat ledger or stock effects.
- Refund review explains stock effects and rejects unsupported partial/bulk reversal.
- Old notification links handle already-resolved and unavailable records safely.
- Publisher-only rules prevent author access to metadata and actions.
- Keyboard review, focus restoration, screen-reader announcements, reduced motion, and phone layout work.
- Existing financial and import regression suites remain valid.

Use synthetic data for automated checks and clearly distinguish it from live provider verification.

## Evidence behind the interaction policy

- W3C Alert Pattern: alerts should preserve keyboard focus; avoid excessive interruptions and messages that disappear before they can be read.
  https://www.w3.org/WAI/ARIA/apg/patterns/alert/
- Carbon notification guidance: choose notification surfaces according to context and disruption; keep actionable notifications available and provide a clear action.
  https://carbondesignsystem.com/patterns/notification-pattern/

## Review decision

Approve this specification, or identify desired changes, before an implementation plan is prepared. This document defines proposed behavior; it does not claim the new inbox or synchronization is implemented.
