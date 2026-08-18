---
description: Ship one polished UX/UI improvement to the app, verified and opened as a draft PR.
---

# Daily UX/UI enhancement

Ship **exactly one** polished UX/UI improvement to Lyrical Inventory.

Work autonomously end-to-end. This is usually run on a schedule with nobody watching, so
do not ask clarifying questions — pick the strongest option and proceed.

If an area of focus was given, use it to steer the choice in step 3: $ARGUMENTS

## 1. Ground yourself in the house standards

Read these first, every run:

- [CLAUDE.md](../../CLAUDE.md)
- [.agents/AGENTS.md](../../.agents/AGENTS.md)
- [.agents/UX_PATTERNS.md](../../.agents/UX_PATTERNS.md)
- [.agents/skills/ux-designer/SKILL.md](../../.agents/skills/ux-designer/SKILL.md)

Reuse the classes and tokens already proven in `UX_PATTERNS.md` before inventing anything new.
Extend an existing pattern (a modifier class, a new `.pill` color) rather than creating a
parallel one.

## 2. Don't repeat previous runs

Before choosing today's work:

- `git log --oneline -30` to see what shipped recently.
- List recent pull requests — **open and merged** — for `lyricalmyricalbooks/lyrical-inventory`
  via the GitHub MCP tools.

Skip anything already done or already in flight. Every run must be a genuinely different
improvement.

## 3. Choose ONE improvement

Survey the app's screens and pick the single highest-value UX/UI gap you can fully finish
and verify in one session.

Bias toward what the shop owner would actually feel:

- a screen that looks unfinished or inconsistent with the rest of the app
- an empty state with no guidance or call to action
- a cramped or hard-to-tap control
- misaligned numbers in a ledger or table
- a jarring or missing transition
- a dark-mode gap
- a slow-feeling screen needing optimistic updates or a skeleton loader

Prefer high-traffic surfaces — catalog, consignment ledger, POS checkout, order history —
over rarely-seen corners. Scope it to a single session: depth on one thing beats five
shallow tweaks.

## 4. Implement it to the house standard

- **OKLCH color only.** Semantic tokens: emerald/teal success, rose/coral danger, amber
  warning, indigo/violet primary. Never raw RGB, legacy HSL, or default browser colors.
- **WCAG 2.2 AAA contrast** — primary text ≥ 7:1, secondary text ≥ 4.5:1.
- **Container queries** over viewport media queries; native Popover API for menus and
  tooltips; `:has()` for parent-aware state.
- **Spring easing curves only**, never linear. Wrap all motion in
  `@media (prefers-reduced-motion: reduce)`.
- **≥ 44×44px** interactive targets with generous hit padding.
- **Tabular figures** on every monetary value, quantity, stock balance, and timestamp.
- Guard dynamic template output with nullish coalescing so `undefined` never renders.
- Verify property key names against the real data models before referencing them.

### Hard constraints — do not violate

- **Vanilla JS only.** No framework, no runtime dependencies, no heavier toolchain on top
  of Vite.
- **Do not rewrite, simplify, or refactor data aggregation functions** (`buildOrderTimeline`,
  `deriveOnHand`, `inventoryBreakdown`, and peers). Touch only CSS tokens, HTML wrapper
  classes, badge elements, and subtext formatting.
- Must keep working **fully offline** (PWA) and sync queued state later.
- If you touch [apps-script/Code.gs](../../apps-script/Code.gs), mirror it **verbatim** into
  [public/gas-code.txt](../../public/gas-code.txt) and bump all three version markers in the
  same commit, per CLAUDE.md.

## 5. Verify before shipping

Run `npm test` and `npm run build`. Both must pass. Fix failures rather than pushing broken
work. If you cannot get them green, stop, push nothing, and report what broke.

## 6. Ship it

Always start from a **brand-new branch** off the latest default branch — never reuse or
stack onto merged history:

```sh
git fetch origin main
git checkout -B claude/ux-daily-<yyyy-mm-dd>-<short-slug> origin/main
```

Commit with a descriptive message, push with `git push -u origin <branch>`, then open a
**draft pull request** via the GitHub MCP tools. Check for a PR template first and mirror
its headings if one exists. The body should explain what changed and why it matters to the
shop owner.

## 7. Close out

Finish with the **"Next moves"** list exactly as CLAUDE.md specifies: 7 suggestions, ranked
best-first, written for a non-technical shop owner, each with **What** and **Why it matters
to you** as separate full sentences plus an **Effort** line. No code names, CSS values, or
file names in those two sentences — parentheticals at the very end only. Tie them to what
you just changed, and don't repeat suggestions from earlier runs.
