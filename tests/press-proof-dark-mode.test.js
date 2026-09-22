import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import postcss from 'postcss';
import {
  makeColorResolver, contrastRatio, paletteFor,
} from '../scripts/check-contrast.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const styleCss = readFileSync(join(root, 'src/style.css'), 'utf8');
const darkCss = readFileSync(join(root, 'src/styles/theme-dark.css'), 'utf8');

// The redesign this file covers: on the shipping dark theme, an object's own
// background (--surface-card) measured 1.05:1 against the page behind it —
// visually the same colour, which is why a card, a button or the modal had
// no findable edge at night. The fix stops trying to tune that ramp and
// instead gives every OBJECT the app's own light-mode surface — "paper" —
// while the page, header and sidebar (the "desk") stay exactly as dark as
// they always were. It is not a new palette: --paper is close kin to
// --cream, --on-paper is exactly --ink.
//
// IMPORTANT LIMIT ON WHAT THIS FILE CAN PROVE. The mechanism that applies
// this — `.theme-dark .card { --content-primary: var(--on-paper); … }` —
// locally re-declares a semantic token so every descendant reading
// `var(--content-primary)` picks up the new value through ordinary CSS
// custom-property inheritance. That is standard, spec-defined cascade
// behaviour (the app already relies on the same trick for `--local-accent`
// in `.modal`), but neither this test file nor scripts/check-contrast.mjs
// can execute real CSS cascade — the sweep script reads a FLAT palette from
// the top-level `:root[data-theme="dark"]` block, and jsdom's getComputedStyle
// does not resolve var() at all (verified directly: it echoes the literal
// string back rather than computing it). So what follows verifies every raw
// token PAIR this redesign introduces really does clear AA, and pins the
// exact source lines that perform the re-scoping — but an actual browser
// check of the real app in dark mode is still the only thing that confirms
// the cascade wires up the way this file assumes it does.

const darkVars = paletteFor('dark', styleCss, darkCss);
const resolve = makeColorResolver(darkVars);
const rgb = (token) => {
  const c = resolve(token);
  return { r: c.r, g: c.g, b: c.b };
};

describe('Press Proof — the new paper tokens are defined and correct', () => {
  it('both dark :root blocks define the same six paper tokens', () => {
    // theme-dark.css carries the dark palette twice — an explicit
    // [data-theme="dark"] block and a follow-the-OS block — and they must
    // stay identical or one path silently ships the old dark-on-dark look.
    const names = ['--paper', '--paper2', '--paper3', '--on-paper', '--on-paper2', '--on-paper3'];
    const explicitBlock = darkCss.match(/:root\[data-theme="dark"\]\s*\{([\s\S]*?)\n\}/)[1];
    const followOsBlock = darkCss.match(/:root:not\(\[data-theme="light"\]\)\s*\{([\s\S]*?)\n\s{2}\}/)[1];
    for (const name of names) {
      const inExplicit = explicitBlock.match(new RegExp(`${name}:\\s*(#[0-9A-Fa-f]{6})`));
      const inFollowOs = followOsBlock.match(new RegExp(`${name}:\\s*(#[0-9A-Fa-f]{6})`));
      expect(inExplicit, `${name} missing from the explicit dark block`).not.toBeNull();
      expect(inFollowOs, `${name} missing from the follow-the-OS block`).not.toBeNull();
      expect(inFollowOs[1], `${name} drifted between the two dark blocks`).toBe(inExplicit[1]);
    }
  });

  it('--on-paper is exactly light mode\'s own ink, not a new colour', () => {
    // The whole pitch is "the light theme, laid on a black stage" — if this
    // ever drifts from the real --ink value it stops being that.
    const lightInkMatch = styleCss.match(/:root\s*\{[\s\S]*?--ink:\s*(#[0-9A-Fa-f]{6})/);
    expect(lightInkMatch, 'expected to find --ink in the light :root block').not.toBeNull();
    const onPaperMatch = darkCss.match(/--on-paper:\s*(#[0-9A-Fa-f]{6})/);
    expect(onPaperMatch, 'expected --on-paper in theme-dark.css').not.toBeNull();
    expect(onPaperMatch[1].toUpperCase()).toBe(lightInkMatch[1].toUpperCase());
  });

  it.each([
    ['--on-paper on --paper (primary text)', 'var(--on-paper)', rgb('var(--paper)')],
    ['--on-paper2 on --paper (secondary text)', 'var(--on-paper2)', rgb('var(--paper)')],
    ['--on-paper on --paper2 (text in a recessed tray)', 'var(--on-paper)', rgb('var(--paper2)')],
    ['ink on --gold fill (a solid pill/button)', 'var(--on-paper)', rgb('var(--gold)')],
    ['ink on --green fill (a solid status pill)', 'var(--on-paper)', rgb('var(--green)')],
    ['ink on --red fill (a solid status pill)', 'var(--on-paper)', rgb('var(--red)')],
    ['ink on --amber fill (a solid status pill)', 'var(--on-paper)', rgb('var(--amber)')],
    ['ink on --blue fill (a solid status pill)', 'var(--on-paper)', rgb('var(--blue)')],
    ['--on-paper2 on --paper2 (a muted grey pill)', 'var(--on-paper2)', rgb('var(--paper2)')],
  ])('%s clears 4.5:1', (_label, fg, bg) => {
    expect(contrastRatio(rgb(fg), bg)).toBeGreaterThanOrEqual(4.5);
  });

  it('--on-paper3 is a muted caption grade, not body copy — matches --text3\'s own precedent', () => {
    // Sits a hair under 4.5:1, same situation as the app's existing --text3
    // on --surface-card (also ~4.48:1) — reserved for captions and small
    // labels, never for anything read as a sentence.
    const ratio = contrastRatio(rgb('var(--on-paper3)'), rgb('var(--paper)'));
    expect(ratio).toBeGreaterThanOrEqual(4.4);
    expect(ratio).toBeLessThan(4.5);
  });

  it('paper reads as a genuinely different object from the black page behind it', () => {
    // The number the whole redesign answers: shipping dark mode measured
    // 1.05:1 between --surface-card and --cream. This must not be that.
    const page = rgb('var(--cream)');
    const paper = rgb('var(--paper)');
    expect(contrastRatio(paper, page)).toBeGreaterThan(10);
  });
});

describe('Press Proof — component corrections exist and use the paper tokens', () => {
  // Each of these locally re-declares the semantic layer (--content-*,
  // --surface-*, --border*, --rule-ink) so descendants resolve correctly
  // without a line-by-line rewrite of every consumer. Pinning the
  // re-declaration is what stops a future edit from quietly reverting an
  // object back to reading the page-level (dark) tokens.
  const rule = (selector) => {
    const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const m = darkCss.match(new RegExp(`${escaped}\\s*\\{([\\s\\S]*?)\\n\\}`));
    expect(m, `expected a .theme-dark rule for ${selector}`).not.toBeNull();
    return m[1];
  };

  it('.theme-dark .card and .modal repaint as paper with a flare registration fringe', () => {
    const combined = darkCss.match(/\.theme-dark \.card,\n\.theme-dark \.modal \{([\s\S]*?)\n\}/)[1];
    expect(combined).toMatch(/background:\s*var\(--paper\);/);
    expect(combined).toMatch(/--content-primary:\s*var\(--on-paper\);/);
    expect(combined).toMatch(/--surface-raised:\s*var\(--paper\);/);
    expect(combined).toMatch(/--surface-sunken:\s*var\(--paper2\);/);
    expect(combined).toMatch(/--rule-ink:\s*var\(--on-paper\);/);
    expect(darkCss).toMatch(/\.theme-dark \.card \{ box-shadow: 4px 4px 0 var\(--gold\); \}/);
    expect(darkCss).toMatch(/\.theme-dark \.modal \{ box-shadow: 6px 6px 0 var\(--gold\); \}/);
  });

  it('.theme-dark .btn goes to paper, including the .ink variant that would otherwise vanish', () => {
    const base = rule('.theme-dark .btn');
    expect(base).toMatch(/background:\s*var\(--paper\);/);
    expect(base).toMatch(/color:\s*var\(--on-paper\);/);
    const inkVariant = rule('.theme-dark .btn.ink');
    expect(inkVariant).toMatch(/background:\s*var\(--paper\);/);
    // .btn.gold is deliberately untouched: ink on a bright fill was already
    // the Press Proof pattern before this redesign existed.
    expect(darkCss).not.toMatch(/\.theme-dark \.btn\.gold\s*\{/);
  });

  it('.theme-dark .pill tones are solid fills with ink text, never a translucent wash', () => {
    // These rules are one-liners (`.theme-dark .pill.green { … }` closes on
    // its own line), so the multi-line `rule()` helper — built for blocks
    // that close with a bare `\n}` — would over-match into whatever follows.
    // Capture to the first `}` instead.
    const oneLiner = (selector) => {
      const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const m = darkCss.match(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`));
      expect(m, `expected a one-line .theme-dark rule for ${selector}`).not.toBeNull();
      return m[1];
    };
    for (const tone of ['green', 'amber', 'red', 'blue', 'gold']) {
      const decl = oneLiner(`.theme-dark .pill.${tone}`);
      expect(decl, tone).toMatch(/color:\s*var\(--on-paper\);/);
      // A wash (rgba/--*-bg) is exactly the dark-on-dark failure this
      // redesign exists to remove — assert the fill is opaque.
      expect(decl, tone).not.toMatch(/-bg\)|rgba\(/);
    }
  });

  it('.theme-dark .kpi stops being permanently ink and joins the rest of the objects', () => {
    // .kpi is the one component that was ALREADY dark in light mode too (the
    // deliberate "bold chrome" tile). Once the page itself goes dark, an
    // always-ink tile on an always-ink page is invisible — the same failure
    // as everything else here — so it gets the paper treatment as well.
    const kpi = rule('.theme-dark .kpi');
    expect(kpi).toMatch(/background:\s*var\(--paper\);/);
    expect(darkCss).toMatch(/\.theme-dark \.kpi-value \{ color:\s*var\(--on-paper\); \}/);
  });

  it('.theme-dark .tbl-wrap repaints its rows and keeps the ink header bar', () => {
    const wrap = rule('.theme-dark .tbl-wrap');
    expect(wrap).toMatch(/--content-primary:\s*var\(--on-paper\);/);
    expect(wrap).toMatch(/--surface-raised:\s*var\(--paper\);/);
    // thead is deliberately NOT touched: --surface-inverse stays ink in
    // every theme, and an ink header bar over a now-light table body is the
    // exact same relationship light mode has always had.
    expect(darkCss).not.toMatch(/\.theme-dark \.tbl thead/);
  });

  it('the segmented control and book-modal stepper redeclare --rule-ink locally', () => {
    // Missed once already this session: their .active rule borrows
    // --rule-ink for its stroke, and without a local redeclaration here that
    // stays the page-level cream — invisible on the now-light paper2 tab strip.
    const decl = rule('.theme-dark .modal-tabs.segmented-control,\n.theme-dark .book-modal-stepper');
    expect(decl).toMatch(/--rule-ink:\s*var\(--on-paper\);/);
    expect(decl).toMatch(/background:\s*var\(--paper2\);/);
  });

  // A real bug, filed by the shop owner after this landed: the Combined
  // Consignment Summary table and the Tax Centre master ledger both still
  // showed dark-on-dark striping, because .all-consignment-table,
  // .con-group-row and .tc-ledger-tbl's zebra row read the PRIMITIVES
  // (--cream2, --surface-card, --text2…) directly, not the semantic layer
  // the rules above redeclare. Verified against a real Chromium render
  // (jsdom can't resolve var()) before this was pinned here.
  it('.theme-dark .card/.modal and .tbl-wrap also redeclare the primitives, not just the semantic layer', () => {
    const cardModal = darkCss.match(/\.theme-dark \.card,\n\.theme-dark \.modal \{([\s\S]*?)\n\}/)[1];
    const wrap = rule('.theme-dark .tbl-wrap');
    for (const decl of [cardModal, wrap]) {
      expect(decl).toMatch(/--cream:\s*var\(--paper\);/);
      expect(decl).toMatch(/--cream2:\s*var\(--paper2\);/);
      expect(decl).toMatch(/--cream3:\s*var\(--paper3\);/);
      expect(decl).toMatch(/--surface-card:\s*var\(--paper\);/);
      expect(decl).toMatch(/--text:\s*var\(--on-paper\);/);
      expect(decl).toMatch(/--text2:\s*var\(--on-paper2\);/);
      expect(decl).toMatch(/--text3:\s*var\(--on-paper3\);/);
    }
  });

  it('the tax ledger\'s inline category picker gets its own paper treatment', () => {
    // Ties the generic dark-mode `:where(select, textarea, input…)` floor
    // at one-class specificity and would lose to it on source order without
    // its own rule — see the comment above this rule in theme-dark.css.
    const decl = rule('.theme-dark .tc-ledger-cat-select');
    expect(decl).toMatch(/background:\s*var\(--paper\);/);
    expect(decl).toMatch(/color:\s*var\(--on-paper\);/);
  });
});

describe('Press Proof — the stylesheet actually parses (not just matches by regex)', () => {
  // The primitive-widening fix above shipped once already with a byte that
  // broke it invisibly: an explanatory comment contained the literal
  // sequence `*/` mid-sentence, closing the CSS comment early. Every regex
  // test in this file still passed — the raw text was untouched — but a
  // real CSS parser (and every real browser) stopped there and silently
  // dropped every rule after it, including all of .card/.modal/.btn/.pill/
  // .kpi/.tbl-wrap, through to the end of the file. Regex assertions on the
  // source text can't catch that; only parsing it can.
  it('parses with no syntax errors', () => {
    expect(() => postcss.parse(darkCss)).not.toThrow();
  });

  it('every rule this file pins is a real, cleanly-parsed rule — not text swallowed by a broken comment', () => {
    const root = postcss.parse(darkCss);
    const selectors = new Set();
    root.walkRules((r) => { selectors.add(r.selector); });
    for (const sel of [
      '.theme-dark .card,\n.theme-dark .modal',
      '.theme-dark .btn',
      '.theme-dark .pill.gray',
      '.theme-dark .kpi',
      '.theme-dark .tbl-wrap',
      '.theme-dark .tc-ledger-cat-select',
      '.theme-dark .modal-tabs.segmented-control,\n.theme-dark .book-modal-stepper',
    ]) {
      expect(selectors, `expected a clean, standalone rule for ${JSON.stringify(sel)}`).toContain(sel);
    }
    // The last real rule in the file — if a broken comment ever swallows
    // the tail again, this is the thing that goes missing.
    let hasPrintGuard = false;
    root.walkAtRules('media', (r) => { if (r.params === 'print') hasPrintGuard = true; });
    expect(hasPrintGuard, 'expected the @media print guard near the end of the file').toBe(true);
  });
});
