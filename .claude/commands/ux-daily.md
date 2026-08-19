---
description: Ship one polished visual/design improvement to the app, verified and opened as a draft PR.
argument-hint: [area of focus]
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

In `UX_PATTERNS.md`, read two sections closely before you choose anything: the **"Decisions on
record"** table and **§8 "Deliberately *not* adopting yet"**. Both are binding. They exist because
several of the choices in this codebase look like bugs if you don't know the history, and a
scheduled run that "fixes" one of them is doing damage, not polish.

> [!IMPORTANT]
> **Precedence.** Where this file, `CLAUDE.md`/`AGENTS.md`, and `UX_PATTERNS.md` disagree,
> **`UX_PATTERNS.md` wins.** It records what was decided against live specimens in this codebase;
> the others state general principles. Reopening one of its rulings is a product decision to raise
> with the user, never something a run decides for itself.

Reuse the classes and tokens already proven in `UX_PATTERNS.md` before inventing anything new.
Extend an existing pattern (a modifier class, a new `.pill` color) rather than creating a
parallel one.

## 2. Don't repeat previous runs

- Read [docs/ux-daily-log.md](../../docs/ux-daily-log.md) **in full**. It is this skill's memory:
  every run that has shipped, plus a "Considered and rejected" list of ideas already ruled out.
  Anything in either table is off the board.
- **Count the `Kind` of the last five rows** — it decides what sort of run this is. See the balance
  rule in step 3.
- List **open** pull requests for `lyricalmyricalbooks/lyrical-inventory` via the GitHub MCP tools,
  to catch work that is in flight but not yet merged and so not yet in the log.
- Only if the log is missing or clearly stale, fall back to `git log --oneline -40`.

Every run must be a genuinely different improvement.

## 3. Choose ONE improvement — lead with how it *looks*

This is a **design** run. The default output is a screen that looks better: better hierarchy,
better spacing, better type, better colour, better density. Adding a warning, a validation
message, an explanatory line or a new count is *behavioural* work — genuinely useful, and what
almost every recent run has done, which is exactly why it is no longer the default.

> [!IMPORTANT]
> **Balance rule.** Read the run log's last five rows. If three or more of them were behavioural
> — new copy, new validation, new counts, a new guard — **this run must be visual.** Ship a change
> whose diff is mostly `style.css` / `theme-dark.css` and whose before-and-after is obvious in a
> screenshot with the words turned off.

Pick from these first — **visual and design work**:

- a screen whose spacing is uneven — inconsistent gaps, cramped padding, no vertical rhythm
- weak hierarchy: everything the same size and weight, so nothing leads and the eye has no path
- a typographic mismatch — sizes off the scale, the wrong family, headings that don't step down
- a panel that looks unfinished or unlike the rest of the app — flat where others have elevation,
  square where others are rounded, bare where others have a header
- misaligned numbers, ragged columns, or a table whose rows are hard to track across
- a dark-mode gap, or a colour that survives the sweep but still looks wrong next to its neighbours
- a component whose hover, focus, active, disabled and empty states aren't a considered set
- a card, badge, chart or icon that carries no visual weight relative to its importance
- density: a screen that wastes space at the top and crams at the bottom

Only if none of the above is worth doing — **behavioural clarity**:

- an empty state with no guidance or call to action
- a cramped or hard-to-tap control
- a slow-feeling screen needing optimistic updates or a skeleton loader
- a queued or failed offline write with no visible state (`UX_PATTERNS.md` §7)

**A visual change is allowed to be a small diff.** A run that moves the type scale and spacing on
one panel and touches nothing else is a complete run. Do not reach for a behavioural change because
it feels more substantial — a tidier screen the owner uses forty times a day is worth more than
another explanatory sentence.

**Not on the list: navigation transitions.** View Transitions shipped and were reverted (PR
#128/#129) and the helper is deliberately unwired — see `UX_PATTERNS.md` §1 before going anywhere
near `withViewTransition()`.

Prefer high-traffic surfaces — catalog, consignment ledger, POS checkout, order history —
over rarely-seen corners. Scope it to a single session: depth on one thing beats five
shallow tweaks.

**If nothing is genuinely worth a pull request today, say so and ship nothing.** Append a
"considered, nothing shipped" row to the log with your reasoning, push only that, and stop. Forcing
a change every single run is how a good backlog turns into busywork.

## 4. Implement it to the house standard

### The visual quality bar

The rules further down are all *don't break this*. These are *what good looks like* — judge the
screen against them before and after, and be able to say which one you moved:

- **Hierarchy.** Exactly one thing leads each panel. If the heading, the figure and the label all
  read at the same weight, nothing is the entry point and the eye wanders. Step size, weight and
  colour together — not size alone.
- **Spacing rhythm.** Gaps should come from a consistent scale, not from whatever looked fine at
  the time. Space between groups must exceed space within a group, or the grouping reads wrong
  however the borders are drawn.
- **Alignment.** Things that belong to a column should share an edge — labels, numbers, and the
  left edge of every card in a stack. A ragged edge reads as sloppiness even when nobody can say
  why the screen feels off.
- **Type.** Sizes come off the scale in `system.css`; Syne uppercase for labels, DM Mono for
  figures. A heading two steps above its body text reads as a heading; one step above reads as an
  accident.
- **Colour with intent.** Colour should carry meaning (status, emphasis) or recede. A screen where
  four things are gold has no emphasis left. Neutral is the default; accent is earned.
- **Weight matched to importance.** The biggest, boldest, most saturated element on a panel should
  be the thing that matters most on it. When it isn't, that is the bug.
- **A complete state set.** Rest, hover, `:focus-visible`, active, disabled, loading, empty — a
  polished component has all of them considered, not just the two you happened to see.
- **Density.** A dense financial tool should be dense evenly. Slack at the top and a crush at the
  bottom is worse than uniform tightness.

State the design intent in one line in the pull request — "the totals row now leads the card
instead of competing with the store name" — so the change can be judged against what it meant to do.

### The constraints

- **Use the existing token families** — `--emerald`, `--rose`, `--orange`, `--violet`, `--slate`,
  and the `--gold*`/`--ink*`/`--cream*` surfaces. Never introduce a new raw hex, ad-hoc shadow, or
  one-off easing curve: `npm run lint:tokens` is a ratchet and will fail on new debt. Do **not**
  introduce `oklch()` — piecemeal colour-space mixing is explicitly not wanted (`UX_PATTERNS.md`
  §8), whatever `AGENTS.md` says in the abstract.
- **Theme every colour you touch.** `--cream*` and `--ink*` both flip. Text on a permanently dark
  surface uses `--on-inverse`; text on a saturated accent fill uses `--on-accent`; never
  `color: var(--cream)`. Theme-specific rules live in
  [src/styles/theme-dark.css](../../src/styles/theme-dark.css) — never a `prefers-color-scheme`
  block in `style.css`. `tests/theme.test.js` and `tests/tokens.test.js` enforce both.
- **WCAG AA contrast in both themes.** `npm run lint:contrast` sweeps light and dark separately;
  a pairing that clears on cream can still fail on charcoal.
- **Touch targets:** `.btn` deliberately stays at ~33px — do **not** add `min-height` to it. Apply
  `.sys-target` to individual controls that genuinely need a full 44px target.
- **Container queries** over viewport media queries for new components; native Popover API for
  menus and tooltips; `:has()` for derived visual state (keep explicit JS classes for state that
  carries domain meaning).
- **Spring easing curves only**, never linear. Wrap all motion in
  `@media (prefers-reduced-motion: reduce)`.
- **Tabular figures** on every monetary value, quantity, stock balance, and timestamp.
- **Feedback** goes through `showToast()` / `confirmDialog()` / `promptDialog()` — never a raw
  `alert()` or `confirm()`.
- Guard dynamic template output with nullish coalescing so `undefined` never renders.
- Verify property key names against the real data models before referencing them.

### Ship a test with it — sized to the change

Every change gets a regression test as `tests/<slug>.test.js` (vitest, jsdom). **Match the test to
the kind of change; do not pick the change to suit the test.**

- **A visual/CSS change** asserts on the stylesheet directly: read `src/style.css` and match the
  rule block, pinning the specific declarations that carry the design decision — the shared rail
  width, the grid template, the `min-width: 0` that stops the overflow.
  [tests/book-strip-kpi-alignment.test.js](../../tests/book-strip-kpi-alignment.test.js) is the
  model, and it is a complete and sufficient test. Pin what would silently undo the fix, not every
  property in the block.
- **A behavioural change** puts the logic in a pure module under `src/lib/` and tests that
  directly; `tests/consignment-ledger-filter.test.js` and `tests/store-balance-flag.test.js` are
  the models. `tests/helpers/extract-decl.js` lifts a declaration out of `main.js` when the logic
  cannot move.

> [!WARNING]
> A pure-CSS improvement needing only a stylesheet assertion is **not** a lesser change, and the
> test requirement is never a reason to add logic a design fix didn't need. Reaching for a
> behavioural change because it produces a more satisfying test is how this skill drifted away from
> design work in the first place.

### Record any new pattern

If the change introduces a reusable pattern, or settles a question someone will hit again, add it to
[.agents/UX_PATTERNS.md](../../.agents/UX_PATTERNS.md) in the same commit. That file is the only
thing keeping the app converging on one system instead of drifting into one-off CSS every session.

### Hard constraints — do not violate

- **Vanilla JS only.** No framework, no runtime dependencies, no heavier toolchain on top
  of Vite.
- **Do not rewrite, simplify, or refactor the data aggregation functions** (`buildOrderTimeline`,
  `deriveOnHand`, `inventoryBreakdown`, and peers). Read from them, render around them, leave their
  arithmetic alone. Adding a new pure helper in `src/lib/` alongside them is fine and is the
  established pattern — the rule is about not disturbing money that already adds up.
- Must keep working **fully offline** (PWA) and sync queued state later.
- If you touch [apps-script/Code.gs](../../apps-script/Code.gs), mirror it **verbatim** into
  [public/gas-code.txt](../../public/gas-code.txt) and bump all three version markers in the
  same commit, per CLAUDE.md.

## 5. Verify before shipping

Run all five, cheapest-first. Every one must pass:

```sh
npm run lint
npm run lint:contrast
npm run lint:tokens
npm test
npm run build
```

The first, second, fourth and fifth are exactly what CI runs, so a failure here is a failure you
would otherwise discover after pushing. **`npm run lint:tokens` is not in CI** — this run is the
only thing standing between the design system and token drift, so never skip it.

Fix failures rather than pushing broken work. If you cannot get them green, stop, push nothing, and
report what broke.

**Optional, best-effort:** if time allows, `npm run preview` and screenshot the screen you changed
in both light and dark using the preinstalled Chromium at `/opt/pw-browsers/chromium`, and attach
the images to the pull request. This is a nice-to-have — a screenshot that won't capture must never
block a change the five checks above already verified.

## 6. Ship it

Always start from a **brand-new branch** off the latest default branch — never reuse or
stack onto merged history:

```sh
git fetch origin main
git checkout -B claude/ux-daily-<yyyy-mm-dd>-<short-slug> origin/main
```

Append your row to [docs/ux-daily-log.md](../../docs/ux-daily-log.md) **in the same commit** as the
change — a log written in a separate commit is a log that eventually doesn't get written. Fill in
the `Kind` column honestly: `visual` only if a screenshot with the words blurred out would show the
difference. Marking behavioural work as visual defeats the balance rule for every run after this
one.

Commit with a descriptive message, push with `git push -u origin <branch>`, then open a
**draft pull request** via the GitHub MCP tools. Check for a PR template first and mirror
its headings if one exists. The body should explain what changed and why it matters to the
shop owner.

## 7. Close out

Finish with the **"Next moves"** list. [CLAUDE.md](../../CLAUDE.md) holds the full specification —
follow it there rather than from memory. The three rules most often broken:

1. **What** and **Why it matters to you** are two separate, complete sentences, each on its own
   line. Never merged, never a fragment.
2. No function names, class names, colour values, measurements, or file names anywhere in those two
   sentences — a trailing parenthetical after both sentences is the only place they may appear.
3. Strip the parenthetical and reread: it must still make sense to someone who has never opened the
   code.

Tie the suggestions to what you just changed, and don't repeat anything in the run log.
