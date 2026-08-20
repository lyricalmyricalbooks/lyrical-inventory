# UX daily — run log

The memory for the `/ux-daily` skill. Every run reads this file **first** and appends to it in the
same commit as the change it ships.

Why it exists: dedupe used to be `git log --oneline -30` plus a pull-request listing. With several
runs merging per day and the repo past PR #577, thirty commits covers about a day — so the skill was
steadily losing sight of its own history and had no record at all of ideas it had already considered
and rejected. This file is append-only, so it never truncates.

**How to append.** Newest at the bottom. One row per run, even the runs that ship nothing — a run
that surveyed the app and decided nothing was worth a PR is a useful thing to have recorded, so
write it down rather than leaving a silent gap. Keep *What shipped* in the shop owner's language,
the same voice as the commit subject.

**The `Kind` column is load-bearing.** `visual` means the look of the screen changed — spacing,
hierarchy, type, colour, alignment, density, elevation. `behavioural` means new copy, validation,
counts, filtering or guards: useful, but not a design change. The skill reads the last five rows
and forces a visual run when three or more were behavioural, so classify honestly. A change that
did both is `visual` only if a screenshot with the words blurred out would show the difference.

---

## Shipped

| Date | Kind | Surface | What shipped | PR |
| :-- | :-- | :-- | :-- | :-- |
| 2026-08-18 | behavioural | Order History | Gave the empty table a way forward | #555 |
| 2026-08-18 | visual | POS checkout | Made the cart safe to tap at a fair | #556 |
| 2026-08-18 | behavioural | Consignment ledger | Totalled what the stores still owe | #557 |
| 2026-08-18 | visual | Catalogue | Made the stock bars readable in dark mode | #558 |
| 2026-08-18 | behavioural | Expenses | Made a missing receipt impossible to miss | #559 |
| 2026-08-18 | behavioural | Opening screen | Showed the catalogue arriving instead of nothing | #560 |
| 2026-08-19 | behavioural | Manual entry | Showed what an order does to stock before it's saved | #563 |
| 2026-08-19 | behavioural | Customers | Showed who "Email segment" is actually about to reach | #564 |
| 2026-08-19 | visual | Ledgers | Kept the column labels in view while you scroll | #565 |
| 2026-08-19 | visual | Main navigation | Made the tab labels readable on every screen | #566 |
| 2026-08-19 | behavioural | Dashboard | Showed which channel is actually carrying the book | #567 |
| 2026-08-19 | behavioural | Website orders | Showed what the Gmail scan actually found | #568 |
| 2026-08-19 | behavioural | Sync status | Said when the connection drops and what's still unsaved | #569 |
| 2026-08-19 | behavioural | Artist payouts | Showed what a payment does before you record it | #570 |
| 2026-08-19 | behavioural | Consignment store card | Explained what doesn't add up on a store card | #571 |
| 2026-08-19 | behavioural | Shipping rates | Pointed at the box that is actually empty | #574 |
| 2026-08-19 | behavioural | Dialogs | Stopped Cancel quietly throwing away what you typed | #576 |
| 2026-08-19 | behavioural | Consignment ledger | Showed one store's rows, and what that store owes | #577 |
| 2026-08-19 | behavioural | Event POS | Showed how many copies are left before you sell them | #579 |
| 2026-08-19 | behavioural | Expenses | Stopped the expense total mixing currencies into one wrong number | #580 |
| 2026-08-19 | behavioural | Order History | Made it possible to find one order without scrolling | #581 |
| 2026-08-20 | visual | POS checkout | Gave the checkout column a readable total and an even rhythm | #589 |
| 2026-08-20 | visual | Order History | Made the stock figures at the top of the page line up and lead | #590 |
| 2026-08-20 | visual | Consignment store cards | Let the shop's name lead its card instead of its numbers | #591 |
| 2026-08-20 | visual | Customers | Lined up what each buyer spent so the column can be read down | #594 |

---

## Considered and rejected

Dead ends and settled calls. Check this before proposing anything — an idea here has already been
looked at, and re-proposing it costs a run.

| Idea | Ruling |
| :-- | :-- |
| View Transitions on tab and book switching | **Rejected.** Shipped in PR #128, reverted in #129 seven minutes later. `withViewTransition()` in `src/lib/motion.js` stays deliberately unwired. A narrow single-widget use may be fine; navigation is settled. See `.agents/UX_PATTERNS.md` §1. |
| Migrating the palette to `oklch()` | **Not now.** Worth it only alongside a full palette migration — mixing colour spaces piecemeal makes the tokens harder to reason about, not easier. See `.agents/UX_PATTERNS.md` §8. |
| Raising `.btn` to a 44px minimum height | **Rejected.** Deliberately ~33px; raising it reflows every screen and the density is wanted. Use `.sys-target` on individual controls that genuinely need a full target. See `.agents/UX_PATTERNS.md` → Decisions on record. |
| CSS anchor positioning for dropdowns and tooltips | **Not yet.** The right model, but support is still Chromium-led. Revisit later. See `.agents/UX_PATTERNS.md` §8. |
| Scroll-driven animations | **Rejected.** This is a dense financial tool; scroll-jacking hurts more than it delights. See `.agents/UX_PATTERNS.md` §8. |
