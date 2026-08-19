---
description: Ship one polished UX/UI improvement to the app, verified and opened as a draft PR.
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
- List **open** pull requests for `lyricalmyricalbooks/lyrical-inventory` via the GitHub MCP tools,
  to catch work that is in flight but not yet merged and so not yet in the log.
- Only if the log is missing or clearly stale, fall back to `git log --oneline -40`.

Every run must be a genuinely different improvement.

## 3. Choose ONE improvement

Survey the app's screens and pick the single highest-value UX/UI gap you can fully finish
and verify in one session.

Bias toward what the shop owner would actually feel:

- a screen that looks unfinished or inconsistent with the rest of the app
- an empty state with no guidance or call to action
- a cramped or hard-to-tap control
- misaligned numbers in a ledger or table
- a dark-mode gap
- a slow-feeling screen needing optimistic updates or a skeleton loader
- a queued or failed offline write with no visible state (`UX_PATTERNS.md` §7)

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

### Ship a test with it

Every change gets a regression test, matching the repo's convention: `tests/<slug>.test.js`, vitest
with jsdom. Put new behaviour in a **pure module under `src/lib/`** and test that directly rather
than reaching into rendering code; use `tests/helpers/extract-decl.js` to pull declarations out of
`index.html` when you need to assert on markup. `tests/consignment-ledger-filter.test.js` and
`tests/store-balance-flag.test.js` are good models.

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
change — a log written in a separate commit is a log that eventually doesn't get written.

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
