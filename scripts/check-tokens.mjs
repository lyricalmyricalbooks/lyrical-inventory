/**
 * check-tokens.mjs — static guard against design-token drift in the stylesheets.
 *
 * The design system in src/styles/system.css only stays a system if new CSS
 * consumes it. Without enforcement the measured debt at the time the system
 * landed (47 distinct font sizes, 105 raw hex colours, 139 ad-hoc box-shadows,
 * 8 easing curves, 15 z-index values) simply grows.
 *
 * This script counts token violations per category and compares against
 * scripts/token-baseline.json. It fails only when a category goes UP — so it
 * is a ratchet: pre-existing debt is tolerated, new debt is not, and every
 * migration that removes a violation tightens the baseline for everyone after.
 *
 * Deliberately NOT flagged:
 *   - Anything inside a `:root { … }` block. Tokens have to be defined in raw
 *     values somewhere, and that somewhere is :root.
 *   - `rgba(255,255,255,…)` / `rgba(0,0,0,…)` overlay scrims, which are
 *     compositing primitives rather than palette colours.
 *   - Lines marked `/​* token-ok *​/`, for reviewed exceptions.
 *
 * Usage:
 *   node scripts/check-tokens.mjs                  # check (exit 1 on regression)
 *   node scripts/check-tokens.mjs --write-baseline # accept current counts
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

export const SCANNED_FILES = [
  join(ROOT, 'src', 'style.css'),
  join(ROOT, 'src', 'styles', 'system.css'),
  join(ROOT, 'src', 'styles', 'theme-dark.css'),
];
export const BASELINE_JSON = join(__dirname, 'token-baseline.json');

/**
 * Blanks out every `:root { … }` block while preserving line numbering, so
 * token *definitions* are never reported as token *violations*.
 * :root blocks don't nest, so a non-greedy brace match is sufficient.
 *
 * Qualified forms count too — `:root[data-theme="dark"]` and
 * `:root:not([data-theme="light"])` are how src/styles/theme-dark.css defines
 * the dark palette. Without this the entire theme would read as ~90 raw-hex
 * violations, and the only way to land a theme would be to raise the baseline,
 * which the ratchet exists to prevent.
 */
export function stripRootBlocks(css) {
  const ROOT_BLOCK = /:root(?:\s*(?:\[[^\]]*\]|:not\([^)]*\)|\.[\w-]+))*\s*\{[^}]*\}/g;
  return css.replace(ROOT_BLOCK, (block) => block.replace(/[^\n]/g, ' '));
}

/** Pure-white / pure-black rgba() — a compositing scrim, not a palette colour. */
const OVERLAY_RGBA = /^rgba?\(\s*(255\s*,\s*255\s*,\s*255|0\s*,\s*0\s*,\s*0)\b/;

/**
 * True when every colour in a box-shadow value is a white/black scrim.
 * Colours sit *after* the offsets (`0 0 0 3px rgba(…)`), so the declaration
 * has to be searched for colour tokens rather than matched from its start.
 */
function onlyScrimColours(decl) {
  const colours = decl.match(/rgba?\([^)]*\)|#[0-9a-fA-F]{3,8}\b/g) || [];
  return colours.length > 0 && colours.every((c) => OVERLAY_RGBA.test(c));
}

export const RULES = [
  {
    id: 'raw-hex',
    label: 'raw hex colour',
    hint: 'use a --status-*/--surface-*/--content-* token, or add one to :root',
    // Skips hex inside url(...) data URIs (e.g. the inline SVG noise texture).
    match: (line) => (line.replace(/url\([^)]*\)/g, '').match(/#[0-9a-fA-F]{3,8}\b/g) || []),
  },
  {
    id: 'raw-zindex',
    label: 'raw z-index',
    hint: 'use --z-base/--z-sticky/--z-dropdown/--z-overlay/--z-modal/--z-toast/--z-tooltip',
    match: (line) => (line.match(/z-index\s*:\s*-?\d+/g) || []),
  },
  {
    id: 'raw-font-size',
    label: 'raw font-size',
    hint: 'use --text-3xs … --text-3xl',
    // rem/em/% and clamp() are fine; only literal px sizes are drift.
    match: (line) => (line.match(/font-size\s*:\s*[\d.]+px/g) || []),
  },
  {
    id: 'raw-easing',
    label: 'literal easing curve',
    hint: 'use --ease-standard/--ease-entrance/--ease-exit/--ease-spring',
    match: (line) => (line.match(/cubic-bezier\([^)]*\)/g) || []),
  },
  {
    id: 'raw-shadow',
    label: 'ad-hoc box-shadow colour',
    hint: 'use --elev-1 … --elev-4 or --elev-hover',
    match: (line) => {
      const m = line.match(/box-shadow\s*:\s*[^;}]+/g) || [];
      // `inset` accent bars are a layout device, not an elevation — and a
      // shadow already built from a var() is by definition tokenised.
      return m.filter((decl) => /rgba?\(|#[0-9a-fA-F]{3,8}\b/.test(decl)
        && !/var\(--elev/.test(decl)
        && !/\binset\b/.test(decl)
        && !onlyScrimColours(decl));
    },
  },
];

export function scanCss(css, filename) {
  const lines = stripRootBlocks(css).split('\n');
  const findings = [];
  lines.forEach((line, i) => {
    if (line.includes('token-ok')) return;
    for (const rule of RULES) {
      for (const sample of rule.match(line)) {
        findings.push({ file: filename, line: i + 1, rule: rule.id, sample: sample.trim().slice(0, 70) });
      }
    }
  });
  return findings;
}

export function scanAll(files = SCANNED_FILES) {
  const findings = [];
  for (const file of files) {
    findings.push(...scanCss(readFileSync(file, 'utf8'), relative(ROOT, file)));
  }
  return findings;
}

export function countByRule(findings) {
  const counts = {};
  for (const rule of RULES) counts[rule.id] = 0;
  for (const f of findings) counts[f.rule]++;
  return counts;
}

export function loadBaseline() {
  try {
    return JSON.parse(readFileSync(BASELINE_JSON, 'utf8')).limits || {};
  } catch (_) {
    return {};
  }
}

/** Categories where the current count exceeds the accepted baseline. */
export function findRegressions(counts, baseline) {
  return RULES
    .map((rule) => ({
      rule: rule.id,
      label: rule.label,
      hint: rule.hint,
      current: counts[rule.id] || 0,
      allowed: baseline[rule.id] ?? 0,
    }))
    .filter((r) => r.current > r.allowed);
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

if (import.meta.url === `file://${process.argv[1]}`) {
  const findings = scanAll();
  const counts = countByRule(findings);

  if (process.argv.includes('--write-baseline')) {
    writeFileSync(BASELINE_JSON, JSON.stringify({
      _comment: [
        'Accepted design-token debt in the stylesheets, as of the last regeneration.',
        'check-tokens.mjs fails when a category exceeds its limit here, so this is a',
        'RATCHET: pre-existing violations are tolerated, new ones are not.',
        'After migrating rules onto tokens, re-run with --write-baseline to lock in',
        'the lower numbers so the debt can never climb back:',
        '  node scripts/check-tokens.mjs --write-baseline',
        'Never raise a limit to make a build pass — tokenise the new CSS instead, or',
        'mark a reviewed exception on the line with a /* token-ok */ comment.',
      ],
      limits: counts,
    }, null, 2) + '\n');
    console.log(`Wrote token baseline (${findings.length} accepted violations):`);
    for (const rule of RULES) console.log(`  ${String(counts[rule.id]).padStart(4)}  ${rule.label}`);
    process.exit(0);
  }

  const regressions = findRegressions(counts, loadBaseline());

  if (regressions.length === 0) {
    console.log(`✓ check-tokens: no new token drift (${findings.length} pre-existing, accepted via scripts/token-baseline.json)`);
    process.exit(0);
  }

  console.error('✗ check-tokens: design-token drift increased:\n');
  for (const r of regressions) {
    console.error(`  ${r.label}: ${r.current} (allowed ${r.allowed}) — ${r.hint}`);
    findings
      .filter((f) => f.rule === r.rule)
      .slice(-Math.min(8, r.current - r.allowed))
      .forEach((f) => console.error(`      ${f.file}:${f.line}  ${f.sample}`));
    console.error('');
  }
  console.error('Tokenise the new CSS (see src/styles/system.css), or mark a reviewed');
  console.error('exception on the line with /* token-ok */. Do not raise the baseline.');
  process.exit(1);
}
