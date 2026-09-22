# Riso Press redesign — handoff

**Branch:** `claude/tender-sagan-heq8vh` · **Plan:** a full publisher-side redesign onto the
"Riso Press" direction (flat risograph inks, squared corners, 2px ink outlines, hard offset
shadows with no blur, condensed all-caps display type), light **and** dark, landing as one PR.

This file exists because the work was paused mid-flight. It records **what is done, what is
left, and the non-obvious things that will bite whoever picks it up.** Read it before touching
`src/style.css`.

---

## 0. Night mode direction change — "Press Proof" (2026-09-22)

The owner looked at the shipping dark theme and didn't like it: "dark on dark," specifically that
every object — a card, a button, the modal — was only a shade less dark than the page it sat on.
Measured: `--surface-card` vs `--cream` was **1.05:1**, visually the same colour.

Three dark-mode directions were mocked up as Design-canvas artifacts (Deep Print — same void,
wider ramp; Night Newsprint — a lighter warmer void; Press Proof — objects go light, page stays
black). **Press Proof was chosen** and is now implemented for the core component kit:
`.card`, `.modal` + its parts, `.btn` (+ `.ink` and `.danger-btn` variants), `.pill` + all six
tones, `.kpi`, `.tbl-wrap`/`.tbl`, and the segmented control / book-modal stepper.

**The idea:** the page, header and sidebar stay exactly as dark as they always were — that part
was never the complaint. Every *object* on top of them now uses the app's own **light-mode**
surface (`--paper` ≈ `--cream`, `--on-paper` = literally `--ink`) instead of a barely-different
dark tone. It is not a new palette; it's daylight mode's own cards, laid down on a black stage.
Elevation stops being a grey shadow (invisible on near-black) and becomes a **flare-red offset**
— a nod to a riso print's own registration drift, and the one place a monochrome shadow would
have vanished into the desk behind it.

**The mechanism, because it's easy to get wrong:** rather than redefining the shared
`--surface-card`/`--surface-page` primitives (which would ripple into every one of their 100+
call sites app-wide, most not yet converted), each `.theme-dark .card { … }`-style rule locally
**re-declares the semantic layer** — `--content-primary`, `--surface-sunken`, `--border`,
`--rule-ink`, etc. — so a descendant that reads `var(--content-primary)` picks up the paper-ink
value through ordinary CSS custom-property inheritance, without touching that descendant's own
rule. The app already relies on exactly this trick for `--local-accent` inside `.modal`; this is
the same pattern applied more broadly. See §5 landmine below for what this means for testing.

**What's covered:** the core kit above, verified with the real contrast/token scripts and a
dedicated `tests/press-proof-dark-mode.test.js` that checks every new token pair for AA and pins
the exact re-declaration lines.
**What's NOT yet covered — a real follow-up, not an oversight:** every screen-specific bespoke
card (the ~53 modal surfaces from Wave 3, the per-screen streams from Wave 2, dropdowns/toasts/
popovers, `.hist-kpi-card` and other stat-tile variants beyond `.kpi`) still uses the old dark
surface tokens and will look inconsistent — dark box next to a new paper one — until it gets the
same treatment. Do that the same way: locally re-declare the semantic layer on the object's own
class, don't touch the shared primitives.

**2026-09-22 follow-up — the owner reported "big failure," and they were right.** The Combined
Consignment Summary table and the Tax Centre master ledger both still showed dark-on-dark striped
rows, plus a category picker rendering as a solid black box. Root cause: `.all-consignment-table`,
`.con-group-row`, `.tc-ledger-tbl`'s zebra row and `.tc-ledger-cat-select` are bespoke,
pre-existing rules that read the **primitives** (`--cream`, `--cream2`, `--surface-card`,
`--text2`…) directly, not the semantic layer §0's mechanism redeclares — exactly the "only
something reading a primitive directly … would slip past this" risk flagged (and believed
absent) when this landed. Fixed by widening `.theme-dark .card`/`.modal`/`.tbl-wrap` to also
redeclare the primitives, one layer deeper than the semantic layer, so both kinds of call site
resolve correctly through ordinary inheritance. See landmine **-2** below for two more specific
things this surfaced. Verified this time against a real Chromium render via Playwright (see that
landmine) — not just the token-pair math jsdom can check.

---

## 0b. The last permanently-dark blocks, repainted (2026-09-22)

The owner looked at the dashboard and said the KPI strip had never been changed. It hadn't —
and neither had three other blocks, for the same reason. `.kpi`, `.metric-banner`,
`.stock-block` and `.payment-methods-card` were **deliberately dark in BOTH themes**: "the one
bold accent on an otherwise light page", a rule written before the Riso repaint and never
revisited by it. Every sweep skipped them because they were correct *by their own comment*.
On newsprint, next to paper cards and a paper table, they read as a row of black boxes.

All four are now paper: `--surface-card`, square corners, a 2px ink outline and a hard offset.
The dashboard's one accent is spent as the **lead KPI tile's fill** (`--book-accent`, with the
figure on `--book-accent-contrast`) rather than the 34%-transparent border it used to be, which
was invisible once a 2px ink outline sat over it. In dark mode all four join the Press Proof
group in `theme-dark.css`.

**The non-obvious part, and the thing to copy:** unlike `.card`, these four read the
**primitives** directly — `--text`/`--text2`/`--text3` for their figures and labels,
`--gold-text`/`--red`/`--green`/`--amber`/`--orange-ink` and the matching `-bg` tints for their
statuses. Re-declaring only the semantic layer (§0's mechanism) would have left light-on-dark
text on a paper block. The dark rule therefore re-declares the primitives too, to the light
palette's own values.

**And the landmine that cost a cycle here, now landmine 11:** a `/* token-ok */` comment was
appended to those re-declarations *without* the terminating semicolon. A custom property
swallows everything up to the semicolon, so the value became garbage **and ate the next
declaration** — the metric banner's headline figure silently fell back to the inherited dark
value, near-invisible on paper. Neither the contrast sweep nor the token check nor 4,291 tests
saw it; a browser screenshot did, in about ten seconds.
`tests/press-proof-dark-mode.test.js` now pins that every declaration in that block terminates
before its comment.

Also swept with them: the break-even alert's inline colours in `updateBreakEven()`
(`src/main.js`) were all light-on-ink literals — `--gold2`/`--gold3`, raw `#fb923c`/`#fdba74` —
because that alert renders inside `.stock-block`. They are ink grades now.

**Still dark, and deliberately so:** the app header, tab bar, book switcher, sync bar,
publisher sidebar, toasts, tooltips, the log console and the selected-state chips that invert
to solid ink. That chrome was never the complaint. The Open Call screen's dark popovers remain
the judgement call §1 already records.

---

## 1. Where the work actually stands

Waves 0 and 1 are **done and merged to `main`**. Everything since sits on this branch.

| Wave | What it was | State |
| :-- | :-- | :-- |
| 0 — Foundation | Palette, both `:root` blocks merged, night mode rebuilt, fonts, 117 stale gold literals | ✅ merged (PR #850, #852) |
| 1 — Component kit | `.btn` `.card` `.pill` `.kpi` `.modal` `.tbl-wrap` `.sec-head` `.snav` etc. onto the ink stroke + hard offsets | ✅ merged |
| — Printed invoice | Full Riso redesign of the invoice sheet | ✅ merged (PR #853) |
| 3 — shape/motion/type/colour sweeps | radii, borders, shadows, fonts, easing, font-size, inline colours → tokens | ✅ merged (PR #854) |
| — residue sweeps | old-ink `rgba()`, blurred shadows, markup font sizes, retired brand colours, the three bespoke dialogs | ✅ **on this branch** (PR #861) |
| 2 — per-screen passes | Each screen's own components: gradients flattened, the register squared, panel glass removed | ✅ **on this branch** (PR #862) |
| 4 — manual pass, log, dead tab | `ux-daily-log.md` ✅ · chart palette validated ✅ · **manual pass still outstanding** · dead `financials` tab deferred | ⚠️ mostly done |

### What is genuinely left

1. **The manual pass** — all 21 tabs, light and dark, at three widths, triggering the states
   static review misses (empty, loading, toast, offline chip, failed-sync row). Nothing
   automated substitutes for it. **This is the only substantial item outstanding.**
2. **The dead `financials` tab**, deliberately deferred to its own change.
3. Three judgement calls left open on purpose, each noted where it lives: the Open Call
   sidebar's glass (at 4.5% surface opacity the blur is doing nearly all the work, so
   flattening it is a visible decision about that screen), the Open Call avatar's gloss, and
   the two brand marks that keep a gradient (the header logo tile and the account avatar).

### What the per-screen pass found, beyond styling

Worth knowing, because none of it was visible to any sweep:

- **Eleven `var()` references named tokens that do not exist.** A missing custom property makes
  the whole declaration invalid, so those rules never applied: a success banner rendering
  transparent with inherited text, a popover with no scrim, a dead hover state, and a radius
  asking for `--shipping-pnl-r` when the family defines `--shipping-pnl-radius`.
  `tests/no-undefined-tokens.test.js` now checks every reference resolves.
- **A measured performance decision that lived only in a comment** — no full-viewport
  `backdrop-filter` (55ms/frame and 79ms/keystroke when measured) — had been missed twice.
  `tests/no-fullviewport-blur.test.js` enforces it now.
- **Two blurs rendered nothing at all**, sitting behind fully opaque backgrounds.

### Gate status as of writing

`npm run lint` ✅ · `check-tokens` ✅ · `check-contrast` ✅ (light: 1 accepted, dark: ok) ·
`npx vitest run` ✅ 4268 tests · `npm run build` ✅

---

## 2. How to work on this — the method that has been working

**Re-theme, don't re-markup.** No class name and no DOM structure changes. The redesign happens
by re-pointing tokens and rewriting rule *bodies*. This is not a shortcut: 96 test files assert
on exact markup strings and 65 on literal `class="…"` values, so restructuring markup means
rewriting ~150 test files and throwing away the guardrails mid-redesign.

**Sweeps are written as throwaway scripts, not done by hand.** Each sweep in wave 3 was a small
Node script that walked the files, mapped literals onto tokens, and printed a count of what it
changed, what it skipped, and what it deliberately guarded. Write the script, read its skip
list, then run the gates. Doing a thousand of these by hand invites exactly the kind of error
§3 describes.

**Map by property, never by value alone.** This is the single most important rule learned here.
`#fff` as a *background* is the card surface; `#fff` as a *text colour* is the label sitting on
a saturated fill. They are different tokens that behave differently when the theme flips. A
blanket value→token map would have been wrong roughly half the time in dark mode.

**Run the gates after every sweep, and believe them.** The contrast sweep caught two real
regressions that no amount of reading the diff would have. Order:

```
npm run lint && node scripts/check-tokens.mjs && node scripts/check-contrast.mjs \
  && npx vitest run && npm run build
```

**Tests get retargeted, never deleted or weakened.** ~45 test files have been retargeted so far
— pointed at the new value or at the token that now carries it. If a test fails, the question is
"what is it protecting?", not "how do I make it pass".

---

## 3. The bug that was found while writing this — read this one

While documenting the left-raw colours, the inline-colour sweep in `4f9842c` turned out to have
broken the **printed and downloaded invoice** in two opposite ways. Both are fixed; the pattern
is the thing to remember.

The sweep mapped three backgrounds onto `var(--surface-card)`:

1. `buildStandaloneInvoiceHTML` writes a **whole document into a new window** and carries over
   only the font links — its `<head>` has no app stylesheet, so there is no `:root` for a custom
   property to resolve against. The token resolved to **nothing** and the invoice lost its white
   paper. (Two sites: the `.invoice-paper` rule and the `@media print` `html,body` rule.)
2. `buildInvoiceJsPdf`'s off-screen holder **is** in the app page, so the token resolved fine —
   to the **dark** card whenever the publisher happened to be in night mode, baking a dark ground
   into a PDF that every customer receives.

**The generalisable rule: a token is only meaningful inside a document that loads `:root`, and
only correct on a surface that is *supposed* to follow the theme.** Anything printed, emailed,
downloaded, or rasterised fails one of those two tests. Those live on the `DOCUMENT_BUILDERS`
list in `scripts/check-contrast.mjs`, which is a **colour** exemption list — not a shape one.
Both functions were missing from it and have been added, with `tests/printed-invoice-theme-immune.test.js`
pinning the behaviour so the next sweep cannot silently redo it.

`tests/contrast.test.js` ratchets that list's size ("if this grows, something is being excused
rather than fixed") — the ceiling moved 14 → 15 with the reasoning written into the test. Do not
raise it again without the same justification.

---

## 4. What is left, in the order to do it

**2026-09-22 — 4a/4b/4c below are stale; verified done, not re-deleted so the record stays
intact.** §1's table already said as much (waves 2/3/residue "✅ merged" / "✅ on this branch"),
but this section was never cleaned up to match, so it kept reading as an open TODO. Spot-checked
just now: two `.overlay` modal bodies (`#m-tc-trip-detail`, `#m-tc-new-trip`) read clean — every
element on `.modal`/`.btn`/`.tbl-wrap`/`.form-group` and friends, zero raw colour or shape inline.
The ~91 raw-hex hits still findable in `src/main.js`/`src/features/*.js` today are, on inspection,
not the same debt 4b describes: email/invoice HTML (must stay raw — no `:root` to resolve
against, see §3), and the Open Call template editor's text/highlight colour **swatch picker**
(`opencall.js` ~951–977 — a fixed palette of picker options, not themed chrome; converting it to
app tokens would be wrong, the same way `renderMockSpreadsheet`'s Sheets imitation in 4b is
correct to leave alone). Neither category is what 4a/4b were originally warning about. If a
future pass finds a *bespoke live-UI* component still on raw values, that's still real debt —
just confirm it's not one of these two categories first, the way this check did.
The one genuinely open item from this whole section is **4d's manual pass** — still true, see
below — and the ratchet counts in 4d are now stale too; `scripts/token-baseline.json` is the live
source of truth, not the numbers printed here.

### 4a. Finish wave 3 — the modal surfaces (~53) — superseded, see note above

Nothing deliberate has been done to these yet and they are the most likely thing to be missed:

- **46 static `.overlay` blocks** in `index.html`
- the inline `#m-fair-kit` workspace
- **5 Open Call modals built at runtime** — `src/features/opencall.js` (they are constructed in
  JS, so every `index.html` grep misses them)
- the Shipping manual-link overlay in `src/features/shipping.js`

Respect the modal contract: `.modal` owns horizontal padding only, no vertical padding on
sub-classes (`tests/modal-shell-seams.test.js`), and only the six real `--surface-*` tokens.

### 4b. The colours deliberately left raw

The sweep left 13 sites raw because no mapping was clearly right. They are **not** oversights —
each needs a human decision:

- `renderMockSpreadsheet` (`src/main.js` ~13260–13336) paints `#22222e` / `#1d1d26` / `#3b82f6`.
  This is a deliberate **imitation of Google Sheets' own chrome**, like a carrier logo plate. It
  should probably stay raw with a `/* token-ok */` note explaining that, rather than be themed —
  a Sheets mock that follows our palette stops looking like Sheets.
- The rest sit inside functions already on the `DOCUMENT_BUILDERS` list and are correct as-is.

There are also ~144 hex occurrences that are **not** in a simple `property:#hex` shape —
gradients, `rgba()`, multi-value shorthands. No sweep has touched them. They need a parser that
understands the value, not a regex.

### 4c. Wave 2 — the per-screen passes (the big one)

Seven streams over disjoint line zones of `src/style.css` plus disjoint render functions.
`src/style.css` is partitioned by comment banners into screen zones — **re-derive the exact
boundaries from the banners at the branch tip**, because waves 0–1 shifted every line number.

| Stream | Screens |
| :-- | :-- |
| A | Dashboard, All-books overview, Catalogue / book switcher |
| B | Consignment, Invoices, Customers |
| C | Order History, Website orders, Big Cartel, Manual entry |
| D | Shipping (3 zones), Payments / Reconcile |
| E | Tax Centre (4 zones), Expenses |
| F | Event POS + Fair Kit, QR codes, Intelligence, To-do |
| G | Open Call, Web Analytics, Settings / Sheets, Backups |

**Serialised, not parallel:** the global responsive block (≤768px, ≤480px, ≤360px — every screen
has rules there) and the final baseline regeneration. Of 69 `@media` blocks the other ~66 are
screen-local and belong to their owning stream.

**Don't forget the sub-tab systems** — each is effectively its own screen: Tax Centre
(Ledger · Receipts · Deductions · Integrations), Customers (Audience · Mailing · Campaign),
Settings (Catalog · Profit · Sync), Event POS (Register · Fair Kit), and the Big Cartel sub-tabs.

**And the states, not just the screens:** empty · loading/skeleton · offline queue chip ·
failed-sync row · conflict row · toast · disabled control · focus ring · validation error. This
is where a redesign half-lands.

### 4d. Wave 4 — verification and cleanup

- Manual pass: all 21 tabs + the all-books overview, light and dark, at desktop / tablet / phone.
  **This is the one substantial item still outstanding** — everything below it is done.
- ~~`renderChannelAnalytics` draws to `<canvas>`~~ — **this was wrong.** It builds ordinary
  markup (`.ch-table` / `.ch-row` divs), touches no canvas, and is therefore swept like
  everything else. The only canvases in the app handle receipt photos. Its palette was validated
  rather than eyeballed: the Okabe-Ito set passes every check on the light page, and passes
  CVD separation and contrast on dark while sitting outside the validator's preferred dark
  lightness band — it is accessible in both, but has never been re-stepped for dark. Doing that
  means a theme-aware palette in JS, which is a feature, not a sweep. `tests/channel-chart-palette.test.js`
  pins the set and the direct labels that let three below-3:1 hues be legal at all.
- ~~`docs/ux-daily-log.md` has no entry~~ — added.
- The dead `financials` tab: it is in `SHELL_TAB_LABELS`, `PUBLISHER_ONLY_IDS` and the render
  dispatch, but `#tab-financials` does not exist and `renderFinancials()` would throw. ~9
  references. It deserves its own change, not a drive-by deletion inside a redesign PR.
- Ratchet: after the sweeps, lower the limits with `node scripts/check-tokens.mjs --write-baseline`.
  **Only ever to lower them.** ~~Now: raw-hex 131 · raw-zindex 40 · raw-font-size 99 ·
  raw-easing 0 · raw-shadow 6 (was 140 / 40 / 99 / 0 / 12).~~ Stale the moment it was written —
  `scripts/token-baseline.json` is the live number, not this line. As of 2026-09-22: raw-shadow
  cleared to 0 (the 6 remaining sites were reviewed exceptions never marked `token-ok`, plus one
  genuinely dead fallback value, removed outright — see the PR that landed this note).

---

## 5. Landmines — the things that have already caused a wasted cycle

-2. **A local re-declaration only reaches code that reads the layer it redeclares — this shipped
   a real regression once already.** §0's mechanism redeclared the *semantic* layer
   (`--content-primary`, `--surface-raised`…). Real, pre-existing, bespoke CSS elsewhere in the
   app (`.all-consignment-table`, `.con-group-row`, `.tc-ledger-tbl`'s even-row rule) reads the
   *primitives* (`--cream2`, `--surface-card`, `--text2`) directly, bypassing the semantic layer
   entirely — those call sites stayed dark while the text inside them (routed through the
   semantic layer) correctly flipped to dark ink, producing illegible dark-on-dark. The fix
   redeclares both layers on `.card`/`.modal`/`.tbl-wrap`. **If you add a new `.theme-dark`
   correction block, redeclare the primitives too, or grep for `var(--cream` / `var(--surface-card`
   / `var(--text2` etc. inside whatever selector you're scoping to before assuming the semantic
   layer alone is enough.**
   Two things found alongside it, worth knowing before you touch this file again:
   - **A CSS comment that happens to contain the two characters `*/` closes early — silently.**
     An explanatory comment above the primitive-widening fix contained `--text*/` mid-sentence,
     which closed the comment there instead of at its real end. Every regex-based test in
     `tests/press-proof-dark-mode.test.js` still passed (the raw text was untouched), but a real
     CSS parser — and every browser — stopped there and silently dropped every rule after it:
     `.card`, `.modal`, `.btn`, `.pill`, `.kpi`, `.tbl-wrap`, all of it, through to the end of the
     file. Caught only by rendering the real file in Chromium via Playwright and reading
     `getComputedStyle` — not by any of this repo's own checks. A new
     `describe('the stylesheet actually parses (not just matches by regex)')` block now parses
     `theme-dark.css` with `postcss` (added as a devDependency) and pins the rules that would go
     missing if this ever recurs — regex assertions on the source text cannot catch it, only
     parsing can.
   - **`.theme-dark :where(select, textarea, input…)` is not actually zero-specificity.** Its own
     comment claims `:where()` carries no specificity so "every real rule in style.css still
     wins" — true of the `:where()` part alone, but the `.theme-dark` prefix in front of it is an
     ordinary class selector and does contribute (0,1,0). Any one-class selector elsewhere
     (`.tc-ledger-cat-select`) ties with it and then loses on source order, since this file loads
     after `style.css`. Don't trust that comment's specificity claim for a one-class selector;
     give it its own `.theme-dark .that-class { … }` rule instead, the way `.tc-ledger-cat-select`
     now has one.
-1. **Neither the contrast sweep nor jsdom can verify a locally-scoped custom-property
   re-declaration** — the exact mechanism Press Proof (§0) is built on. `scripts/check-contrast.mjs`
   reads a FLAT palette from the top-level `:root[data-theme="dark"]` block; it has no model of a
   `.theme-dark .card { --content-primary: … }` override cascading to descendants, so it will
   neither confirm nor deny that the mechanism works — a clean run from it proves nothing about
   this specific pattern. jsdom is worse than silent: `getComputedStyle` was tested directly
   against it and it does **not** resolve `var()` at all — it echoes the literal string
   `"var(--content-primary)"` back rather than computing a colour, so a jsdom-based test would
   appear to run and would not be testing anything real. The only genuine verification available
   was: (a) the CSS spec itself — custom-property inheritance and shadowing is standard, not
   experimental; (b) the app's own precedent, `--local-accent` inside `.modal`, already shipping
   on exactly this trick; and (c) resolving the real token *values* this pass introduces against
   the actual file with `paletteFor()`/`contrastRatio()` (what `tests/press-proof-dark-mode.test.js`
   does) — which proves the colours are right, not that the cascade wires up in a live DOM.
   **A real browser look at the app in dark mode is still owed before trusting this is correct.**
0. **A sweep only ever finds the shape it was written to match — and that has been the single
   biggest source of missed work here, three times over.** The colour sweeps matched
   `property:#hex`, so every `rgba()` spelling of a colour was invisible to all of them: the ink
   (28 sites, including the scrim behind every dialog), then the whole retired brand palette
   (49 more), then a gold declared local to a component rather than in `:root`. The shadow sweep
   required a `px` on the first value, so `0 4px 12px` read as two-valued and was skipped — and
   that same bug was then re-introduced in the grep used to scope the follow-up. The type sweep
   only read `src/style.css`, leaving 709 sizes in the markup.
   **Before trusting a sweep's count, check what its pattern cannot see.** A useful cross-check:
   enumerate every distinct colour triplet in the stylesheets and compare it against the live
   palette, rather than searching for the values you already suspect. Two gradients were found
   carrying the new flare beside an old green in the same declaration, which no targeted search
   would have surfaced.
1. **Never reformat `src/style.css`.** Tests anchor on exact whitespace (`/^\.btn\{/m`) and one on
   a byte-exact minified rule. A formatter over that file breaks tests that have nothing to do
   with your change.
2. **The gold ramp runs LIGHT-ward.** `--gold2` / `--gold3` are *lighter* than `--gold` and are
   used as **text on dark chrome**. Inverting the ramp to "make it darker like the others" broke
   the tab bar. It is not a mistake; leave the direction alone.
3. **Fill and ink are different values.** Every status family has a bright fill (`--red-light`)
   and a darker text-grade base (`--red`, `--gold-text`). They are not interchangeable — using a
   fill as a text colour is what caused 23 contrast failures in one sweep.
4. **`src/style.css` had two `:root` blocks** and the contrast checker + dark-completeness guard
   read **only the first**. They are merged now. Do not add a second one — anything in it would
   be silently unchecked.
5. **Dark mode is written twice** in `theme-dark.css` (an explicit `[data-theme="dark"]` block and
   a follow-the-OS block) and `tests/theme.test.js` requires the two to cover identical token
   sets. Move them together, ideally with a script, so they cannot drift.
6. **The exemption lists are about colour, not shape.** `renderOpenCall` is on `DOCUMENT_BUILDERS`
   for a fixed-dark console *inside* it, but the function renders the whole Open Call screen — so
   treating that list as a blanket "skip" left 799 lines of a real screen sitting out of a sweep.
7. **Don't eyeball a categorical palette.** The Riso brand inks failed as chart colours — the
   flare sat within ΔE 2–3 of the warm hues under protan/deutan, the yellow was 1.4:1, and violet
   vs blue read as two blues. Hand-nudging them toward Okabe-Ito broke it differently. The
   reference set is tuned; run the validator instead of adjusting by eye. Channel colours are
   now the Okabe-Ito set in `src/main.js`.
8. **Buttons stay ~33px with no `min-height`** — confirmed with the owner, enforced by
   `tests/tokens.test.js`. The mockup's 44px is a deliberate deviation. Individual controls that
   need a real touch target get `.sys-target` one at a time.
9. **View Transitions stay unwired.** Settled and enforced. Don't wire them.
11. **A `/* token-ok */` comment goes AFTER the semicolon, never before it.** `--x: #fff /* note */`
    is not a commented declaration — the custom property swallows the comment into its value and
    then eats the following declaration too, so the element falls back to whatever it inherits.
    See §0b: this shipped, silently, past every automated gate in the repo.
10. **`src/styles/receipt-finder.css` loads last**, after `theme-dark.css`, via a deep import
    chain — equal-specificity conflicts resolve in its favour.
11. **Merged PR ≠ finished branch.** PR #850 was merged at commit 2 of 5, which shipped a live
    font regression to `main` (the font link had dropped Playfair/Syne while 123 declarations
    still named them). If a PR for this branch is already merged, start the follow-up from a
    fresh branch off the latest `main` — never stack onto merged history.

---

## 6. Where the decisions are written down

- `.agents/UX_PATTERNS.md` — existing classes and patterns. **Read before inventing a new list,
  dropdown, button, pill, table or empty state.** Its "Decisions on record" section is binding.
- `.agents/skills/ux-designer/SKILL.md` — spacing, empty/loading states, contrast, touch targets.
- `.agents/skills/backend-architect/SKILL.md` — offline-first sync rules.
- `.agents/skills/ledger-auditor/SKILL.md` — ledger precision and role-based security.
- `docs/ux-daily-log.md` — its "Considered and rejected" table records dead ends. **Check it
  before proposing anything**; re-proposing a settled idea costs a run.
