#!/usr/bin/env node
/**
 * check-contrast.mjs — static guard against light-on-light text.
 *
 * The app body background is cream (`--cream`), and default text is dark.
 * Several panels are intentionally dark-themed: they set a dark background
 * (`var(--ink*)`, near-black hex) on a container and then use white / cream
 * text inside it. That is fine.
 *
 * The bug this catches (see PR #303, the author "My QR Code" panel) is text
 * styled with a LIGHT colour — `rgba(255,255,255,*)`, `var(--cream*)`, `#fff`,
 * `white` — that sits on the default LIGHT background because neither it nor
 * any ancestor establishes a dark background. That text is washed out and
 * effectively invisible.
 *
 * This is a lightweight tokenizer, not a full CSS cascade. It only reasons
 * about inline `style` backgrounds plus a small allowlist of known dark
 * component classes. Run standalone (`node scripts/check-contrast.mjs`) or
 * via the Vitest suite (test/contrast.test.js).
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
export const INDEX_HTML = join(__dirname, '..', 'index.html');

// Classes whose CSS rules paint a dark (ink) background. Light text inside
// these is correct. Keep in sync with src/style.css if new dark shells appear.
const DARK_CLASSES = new Set([
  'app-header',
  'gas-code-container',
  'gas-code-header',
]);

const VOID_TAGS = new Set([
  'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
  'link', 'meta', 'param', 'source', 'track', 'wbr',
]);

const TAG_RE = /<\/?([a-zA-Z][\w-]*)((?:[^>"']|"[^"]*"|'[^']*')*?)(\/?)>/g;

function getStyle(attrs) {
  const m = attrs.match(/style\s*=\s*("([^"]*)"|'([^']*)')/i);
  return (m ? (m[2] ?? m[3]) : '') || '';
}

function getClasses(attrs) {
  const m = attrs.match(/class\s*=\s*("([^"]*)"|'([^']*)')/i);
  return (m ? (m[2] ?? m[3]) : '').split(/\s+/).filter(Boolean);
}

function hasDarkBackground(style, classes) {
  if (classes.some(c => DARK_CLASSES.has(c))) return true;
  const m = style.match(/(?:^|;)\s*background(?:-color)?\s*:\s*([^;]+)/i);
  if (!m) return false;
  const v = m[1].toLowerCase();
  return /var\(--ink/.test(v)
    || /#0e0c0a|#1c1917|#2a2723|#3d3a35|#000\b|#000000\b/.test(v)
    || /\bblack\b/.test(v)
    || /rgba?\(\s*0\s*,\s*0\s*,\s*0/.test(v);
}

function lightTextColor(style) {
  const m = style.match(/(?:^|;)\s*color\s*:\s*([^;]+)/i);
  if (!m) return null;
  const v = m[1].toLowerCase().trim();
  if (/rgba?\(\s*255\s*,\s*255\s*,\s*255/.test(v)) return v;
  if (/var\(--cream/.test(v)) return v;
  if (/#fff(f{0,3})?\b/.test(v)) return v;
  if (/\bwhite\b/.test(v)) return v;
  return null;
}

function lineOf(html, index) {
  return html.slice(0, index).split('\n').length;
}

/** Returns an array of { line, tag, color } findings. */
export function findLowContrastText(html) {
  const findings = [];
  // stack of booleans: is a dark background in effect at this depth?
  const stack = [false]; // document default: light (cream) body
  let m;
  TAG_RE.lastIndex = 0;
  while ((m = TAG_RE.exec(html)) !== null) {
    const [, rawTag, attrs, selfClose] = m;
    const tag = rawTag.toLowerCase();
    const isClose = m[0].startsWith('</');

    if (isClose) {
      if (stack.length > 1) stack.pop();
      continue;
    }

    const parentDark = stack[stack.length - 1];
    const style = getStyle(attrs);
    const classes = getClasses(attrs);
    const effectiveDark = parentDark || hasDarkBackground(style, classes);

    const light = lightTextColor(style);
    // `/* contrast-ok */` marks a reviewed, intentional exception (e.g. a
    // light default colour that only ever applies inside dark child cards).
    if (light && !effectiveDark && !/contrast-ok/i.test(style)) {
      findings.push({ line: lineOf(html, m.index), tag, color: light });
    }

    const isVoid = VOID_TAGS.has(tag) || selfClose === '/';
    if (!isVoid) stack.push(effectiveDark);
  }
  return findings;
}

// Run standalone.
if (import.meta.url === `file://${process.argv[1]}`) {
  const html = readFileSync(INDEX_HTML, 'utf8');
  const findings = findLowContrastText(html);
  if (findings.length === 0) {
    console.log('✓ check-contrast: no light-on-light text found in index.html');
    process.exit(0);
  }
  console.error(`✗ check-contrast: ${findings.length} low-contrast text element(s) in index.html:`);
  for (const f of findings) {
    console.error(`  index.html:${f.line}  <${f.tag}> color:${f.color} on a light background`);
  }
  console.error('\nLight text needs a dark background ancestor (var(--ink*)), or use a dark text colour (var(--text*)).');
  process.exit(1);
}
