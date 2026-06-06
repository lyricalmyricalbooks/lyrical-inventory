# CLAUDE.md — lyrical-inventory

## Your job after every change
After completing any code enhancement, end your turn with a short
"Next moves" list: 2–4 genuinely high-value suggestions for improving the
app, ranked best-first.
Each suggestion is one or two lines:

- **What** — a concrete, specific action (not "add tests" — say which test and why).
- **Why** — the payoff: a sale not lost, a faster screen, a bug avoided.
- **Effort** — quick / medium / larger.

Then offer to do the top one right away.

### What makes a suggestion good here
- Tied to what just changed. First ask yourself: did this edit open an edge case,
  threaten offline sync, or leave an obvious next step? Lead with that.
- High-leverage, not generic. Skip boilerplate best-practice filler.
- Specific. Name the file, function, or screen. "Debounce the catalog search box"
  beats "improve performance."
- Honest. If nothing is genuinely worth doing, say "nothing pressing" and stop.
  Never pad the list to hit a number.
- No repeats. Don't re-pitch anything already declined this session.

### Constraints every suggestion must respect
(Kept short so suggestions stay usable — never propose breaking these.)

- Vanilla JS — no framework, no build step, no bundler.
- Firebase Firestore backend; static hosting on GitHub Pages — no server, no secret
  keys in client code.
- PWA; offline POS must keep working and sync later.

### Angles worth scanning each time
Bug / edge case the change introduced · the next logical feature · offline & sync
robustness · Firestore data integrity · the speed of a slow screen · keeping catalog
and ledger consistent.

## Pull Requests
- When asked for "a new pull request", "new PR", or similar: **create it immediately** from the current branch
- Do NOT investigate merge status, git history, or ask clarifying questions
- Action: Push branch with `git push -u origin <branch>` then create PR via GitHub MCP
- Use a descriptive PR title based on the feature/fix being implemented
- **After a PR is merged, start the next change on a brand-new branch and open a new PR** — never push more commits onto a merged PR's branch to revive or extend it. One merged PR = done; the next piece of work gets its own branch and its own PR.

## General Principles
- Prefer action over investigation when intent is clear
- If the user asks for something, assume they know what they want
- Only ask clarifying questions if the request is genuinely ambiguous
