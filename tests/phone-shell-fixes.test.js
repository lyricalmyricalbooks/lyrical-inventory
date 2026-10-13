import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from 'vitest';

// Phone shell pass: pop-up sheets clear the on-screen keyboard, every bar above
// the bottom nav is positioned from one height token, publishers between 769px
// and 860px get the bottom nav, landscape phones don't zoom on focus, phone
// header labels are 11px, and the installed app opens standalone.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const read = (p) => readFileSync(path.join(__dirname, '..', p), 'utf8');
const phone = read('src/styles/phone.css');
const style = read('src/style.css');
const html = read('index.html');
const viteConfig = read('vite.config.js');
const darkTheme = read('src/styles/theme-dark.css');

// A bar or padding positioned from a literal nav height instead of --mnav-h.
const literalNavOffset = /calc\((?:72|84|96|104)px \+ [^;]*env\(safe-area-inset-bottom\)/;

test('no pop-up in index.html sets a height cap inline, so the phone sheet can win', () => {
  const modalTags = html.match(/<div class="[^"]*\bmodal\b[^"]*"[^>]*>/g) || [];
  expect(modalTags.length).toBeGreaterThanOrEqual(8);
  for (const tag of modalTags) {
    expect(tag).not.toMatch(/max-height:\s*\d+d?vh/);
  }
});

test('the height-capped pop-up classes exist in both units and are used by the markup', () => {
  for (const vh of [80, 85, 90, 92, 94]) {
    expect(style).toMatch(new RegExp(`\\.modal\\.modal-max-${vh}\\{max-height:${vh}vh;\\}`));
    expect(style).toMatch(new RegExp(`\\.modal\\.modal-max-${vh}\\{max-height:${vh}dvh;\\}`));
  }
  expect(html).toMatch(/class="modal modal-max-92" role="dialog"/);
  expect(html).toMatch(/class="modal modal-max-85" role="dialog"/);
});

test('the phone sheet keeps its keyboard-aware height at 600px and below', () => {
  expect(phone).toMatch(/@media \(max-width: 600px\) \{[\s\S]*?\.overlay \.modal \{ max-height: min\(92dvh, calc\(100dvh - env\(safe-area-inset-top\) - var\(--kb-inset, 0px\)\)\); \}/);
});

test('one token sets the bottom nav height, and every bar above it is built from that token', () => {
  const tokenAt = style.indexOf('--mnav-h: 74px;');
  expect(tokenAt).toBeGreaterThan(style.indexOf(':root {'));
  expect(tokenAt).toBeLessThan(style.indexOf('--ink:#100F0D; --ink2'));
  expect(style).toMatch(/\.pub-shell \.mnav\{[^}]*height:calc\(var\(--mnav-h\) \+ env\(safe-area-inset-bottom\)\)/);
  expect(style).not.toMatch(literalNavOffset);
  expect(phone).not.toMatch(literalNavOffset);
  const uses = (style + phone).match(/var\(--mnav-h\)/g) || [];
  expect(uses.length).toBeGreaterThanOrEqual(10);
});

test('publishers from 769px to 860px get the bottom nav, not the old tab bar', () => {
  const start = style.indexOf('@media (max-width: 860px){');
  expect(start).toBeGreaterThan(-1);
  const block = style.slice(start, start + 1500);
  expect(block).toMatch(/\.pub-shell \.tab-bar\{display:none;\}/);
  expect(block).toMatch(/\.pub-shell \.mnav\{\s*display:grid;grid-template-columns:repeat\(4,minmax\(0,1fr\)\);/);
  expect(block).toMatch(/\.pub-shell \.tab-panel\{padding-bottom:calc\(var\(--mnav-h\) \+ 30px \+ env\(safe-area-inset-bottom\)\);\}/);
  // The slimmer header stays phone-only: it moved into its own 768px block.
  expect(style).toMatch(/\/\* Phone-only header[^*]*\*\/\s*@media \(max-width: 768px\)\{/);
});

test('landscape phones and small tablets get the 16px input floor on touch screens', () => {
  expect(style).toMatch(/@media \(pointer: coarse\)\s*\{\s*input:not\(\[type=checkbox\]\):not\(\[type=radio\]\):not\(\[type=range\]\):not\(\[type=color\]\), select, textarea\{font-size:max\(16px,1em\) !important;\}/);
});

test('phone header labels use the 11px phone type token, not 8px', () => {
  expect(style).toMatch(/\.header-tag\{font-size:var\(--text-3xs\);/);
  expect(style).toMatch(/\.hs-label\{font-size:var\(--text-3xs\);/);
  expect(phone).toMatch(/@media \(max-width: 768px\) \{\s*:root \{ --text-3xs: 11px; --text-2xs: 11px; \}/);
});

test('the installed app opens standalone, with the night-mode page colour as its splash', () => {
  expect(viteConfig).toMatch(/display:\s*'standalone'/);
  expect(viteConfig).toMatch(/start_url:\s*'\.\/'/);
  expect(viteConfig).toMatch(/background_color:\s*'#262624'/);
  expect(darkTheme).toMatch(/:root\[data-theme="dark"\] \{[\s\S]*?--cream: #262624;/);
});

test('toasts and the update prompt clear the bottom nav on 769-860px screens too', () => {
  const css = read('src/style.css');
  const block = css.match(/@media \(min-width: 769px\) and \(max-width: 860px\)\{([\s\S]*?)\n\}/);
  expect(block).not.toBeNull();
  expect(block[1]).toMatch(/#pw-app\.pub-shell ~ \.toast/);
  expect(block[1]).toMatch(/#pw-app\.pub-shell ~ \.pwa-prompt/);
  expect(block[1]).toMatch(/var\(--mnav-h\)/);
});
