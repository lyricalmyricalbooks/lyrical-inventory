import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  stripRootBlocks, scanCss, scanAll, countByRule,
  loadBaseline, findRegressions, RULES, SCANNED_FILES,
} from '../scripts/check-tokens.mjs';

describe('stripRootBlocks', () => {
  it('blanks :root declarations so token definitions are not counted as drift', () => {
    const css = ':root{--gold:#c8913a;}\n.x{color:#ff0000;}';
    const out = stripRootBlocks(css);
    expect(out).not.toContain('#c8913a');
    expect(out).toContain('#ff0000');
  });

  it('preserves line numbering so reported lines stay accurate', () => {
    const css = ':root{\n  --a:#111;\n  --b:#222;\n}\n.x{color:#333;}';
    expect(stripRootBlocks(css).split('\n')).toHaveLength(css.split('\n').length);
    expect(scanCss(css, 'f.css').find((f) => f.sample === '#333').line).toBe(5);
  });

  it('handles the reduced-motion :root override block in system.css', () => {
    const css = '@media (prefers-reduced-motion: reduce){:root{--dur-base:1ms;}}\n.x{color:#abc;}';
    const found = scanCss(css, 'f.css');
    expect(found.map((f) => f.sample)).toEqual(['#abc']);
  });

  // src/styles/theme-dark.css defines the dark palette in a QUALIFIED :root.
  // If these didn't count as definitions the theme would read as ~90 raw-hex
  // violations and could only land by raising the baseline.
  it('treats qualified :root selectors as token definitions too', () => {
    const css = ':root[data-theme="dark"]{--gold:#dda548;}\n.x{color:#abc;}';
    expect(scanCss(css, 'f.css').map((f) => f.sample)).toEqual(['#abc']);
  });

  it('treats the follow-the-OS :root:not() block as definitions', () => {
    const css = '@media (prefers-color-scheme: dark){:root:not([data-theme="light"]){--gold:#dda548;}}';
    expect(scanCss(css, 'f.css')).toEqual([]);
  });

  it('still flags a plain class block that merely mentions root', () => {
    expect(scanCss('.root-ish{color:#bada55;}', 'f.css').map((f) => f.sample)).toEqual(['#bada55']);
  });
});

describe('scanCss rules', () => {
  const only = (css, rule) => scanCss(css, 'f.css').filter((f) => f.rule === rule).map((f) => f.sample);

  it('flags raw hex, z-index, font-size, easing', () => {
    expect(only('.a{color:#bada55;}', 'raw-hex')).toEqual(['#bada55']);
    expect(only('.a{z-index:9999;}', 'raw-zindex')).toEqual(['z-index:9999']);
    expect(only('.a{font-size:13px;}', 'raw-font-size')).toEqual(['font-size:13px']);
    expect(only('.a{transition:all .2s cubic-bezier(.4,0,.2,1);}', 'raw-easing'))
      .toEqual(['cubic-bezier(.4,0,.2,1)']);
  });

  it('accepts tokenised equivalents', () => {
    expect(scanCss(
      '.a{color:var(--content-primary);z-index:var(--z-modal);font-size:var(--text-base);'
      + 'transition:all var(--dur-fast) var(--ease-standard);box-shadow:var(--elev-2);}',
      'f.css',
    )).toEqual([]);
  });

  it('does not flag non-px font sizes', () => {
    expect(only('.a{font-size:1.2rem;}', 'raw-font-size')).toEqual([]);
    expect(only('.a{font-size:clamp(28px,1.4rem + 1.6vw,40px);}', 'raw-font-size')).toEqual([]);
  });

  it('ignores hex inside url() data URIs', () => {
    expect(only(".a{background-image:url(\"data:image/svg+xml,%3Csvg fill='#ff0000'%3E\");}", 'raw-hex'))
      .toEqual([]);
  });

  it('exempts inset accent bars and white/black scrims from the shadow rule', () => {
    expect(only('.a{box-shadow:inset 3px 0 0 var(--gold2);}', 'raw-shadow')).toEqual([]);
    expect(only('.a{box-shadow:0 0 0 3px rgba(255,255,255,.2);}', 'raw-shadow')).toEqual([]);
    expect(only('.a{box-shadow:0 2px 8px rgba(14,12,10,.07);}', 'raw-shadow')).toHaveLength(1);
  });

  it('honours a /* token-ok */ reviewed exception', () => {
    expect(scanCss('.a{color:#bada55;} /* token-ok */', 'f.css')).toEqual([]);
  });
});

describe('ratchet behaviour', () => {
  it('passes when counts equal the baseline and fails when any category grows', () => {
    const counts = countByRule(scanAll());
    const baseline = loadBaseline();

    expect(findRegressions(counts, baseline)).toEqual([]);

    const worse = { ...counts, 'raw-hex': counts['raw-hex'] + 1 };
    const regressions = findRegressions(worse, baseline);
    expect(regressions).toHaveLength(1);
    expect(regressions[0].rule).toBe('raw-hex');
  });

  it('treats an absent baseline entry as zero tolerance', () => {
    expect(findRegressions({ 'raw-hex': 1 }, {})[0].allowed).toBe(0);
  });

  it('covers every rule in the committed baseline', () => {
    const baseline = loadBaseline();
    for (const rule of RULES) expect(baseline).toHaveProperty(rule.id);
  });
});

describe('migrated core primitives', () => {
  const css = readFileSync(SCANNED_FILES[0], 'utf8');
  const ruleFor = (sel) => css.match(new RegExp(`^\\${sel}\\{[^}]*\\}`, 'm'))?.[0] || '';

  it('.btn, .pill, .card and .tbl consume type/motion/elevation tokens', () => {
    expect(ruleFor('.btn')).toContain('var(--text-xs)');
    expect(ruleFor('.btn')).toContain('var(--dur-fast)');
    expect(ruleFor('.pill')).toContain('var(--text-xs)');
    expect(ruleFor('.card')).toContain('var(--elev-2)');
    expect(ruleFor('.tbl')).toContain('var(--text-base)');
  });

  it('legacy --shadow aliases resolve onto the elevation scale', () => {
    expect(css).toMatch(/--shadow:\s*var\(--elev-2\)/);
    expect(css).toMatch(/--shadow2:\s*var\(--elev-3\)/);
  });
});

// These two guards encode reviewed decisions that deliberately DIVERGE from
// .agents/AGENTS.md, so they read as bugs to anyone following the written
// guideline alone. See .agents/UX_PATTERNS.md § Decisions on record before
// changing either — a failure here means a settled call is being reopened.
describe('reviewed decisions that diverge from AGENTS.md', () => {
  const styleCss = readFileSync(SCANNED_FILES[0], 'utf8');
  const systemCss = readFileSync(SCANNED_FILES[1], 'utf8');

  it('.btn keeps its ~33px height rather than AGENTS.md §3\'s 44px minimum', () => {
    const btnRule = styleCss.match(/^\.btn\{[^}]*\}/m)?.[0] || '';
    expect(btnRule).not.toContain('min-height');
    // The opt-in utility remains available for controls that do need the target.
    expect(systemCss).toContain('.sys-target');
  });

  // SUPERSEDED (was: "dark mode stays groundwork-only — no theme block ships").
  // Dark mode shipped; see .agents/UX_PATTERNS.md § Decisions on record. What
  // survives of the original ruling is the reason it was made: the theme must
  // live in ONE place, not be sprinkled through style.css as per-rule
  // `@media (prefers-color-scheme)` blocks, which is how a half-themed app
  // happens. tests/theme.test.js covers the palette itself.
  it('keeps the theme confined to src/styles/theme-dark.css', () => {
    expect(styleCss).not.toContain('prefers-color-scheme');
    expect(systemCss).not.toContain('prefers-color-scheme');
    expect(styleCss).not.toContain('[data-theme=');
    expect(systemCss).not.toContain('[data-theme=');
  });
});
