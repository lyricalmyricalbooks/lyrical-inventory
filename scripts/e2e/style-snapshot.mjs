#!/usr/bin/env node
// Records the computed style of every element on the main screens, so a
// stylesheet change that should look identical can be proved identical.
//
//   npm run check:styles -- --out=before.json
//   … change the CSS …
//   npm run check:styles -- --compare=before.json
//   --only=today,history   a shorter list of screens (use the same list for both runs)
//
// It boots the app on the phone-shots dev server (demo books, offline) and,
// for each screen at phone and desktop width in light and dark, stores a
// fingerprint of every computed property of every element. --compare lists
// each element whose style differs and exits 1 if any did. A full run takes
// about ten minutes.
//
// Made for moving stylesheets into cascade layers (@layer), or any other
// clean-up that should change nothing on screen: it is safe when this
// reports no differences.
import { createServer } from 'vite';
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../..');
const args = Object.fromEntries(process.argv.slice(2).map(a => {
  const [k, ...v] = a.replace(/^--/, '').split('=');
  return [k, v.join('=') || 'true'];
}));

const TABS = (args.only || 'today,pos,manual,dashboard,consignment,history,expenses,reconcile,customers,taxcenter,shipping,sheets,help').split(',');
const WIDTHS = [390, 1280];
const THEMES = ['light', 'dark'];
const chromePath = process.env.CHROME_PATH
  || ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/opt/pw-browsers/chromium/chrome-linux/chrome']
    .find(p => fs.existsSync(p));

const server = await createServer({
  configFile: path.join(ROOT, 'scripts/phone-shots/vite.shots.config.js'),
  server: { port: 5399, strictPort: false },
});
await server.listen();
const base = new URL('/', server.resolvedUrls?.local?.[0]).href;
const browser = await chromium.launch(chromePath ? { executablePath: chromePath } : {});

// Runs in the page: one entry per element, keyed by its position in the tree.
function snapshot() {
  const out = {};
  const keyOf = (el) => {
    const parts = [];
    for (let n = el; n && n !== document.documentElement; n = n.parentElement) {
      const i = n.parentElement ? [...n.parentElement.children].indexOf(n) : 0;
      parts.unshift(`${n.tagName.toLowerCase()}${n.id ? '#' + n.id : ''}:${i}`);
    }
    return parts.join('>');
  };
  const skip = new Set(['transition', 'transition-duration', 'transition-delay', 'animation', 'animation-name', 'caret-color']);
  for (const el of document.querySelectorAll('body, body *')) {
    // The splash screen is mid-fade or already removed, depending on timing.
    if (el.closest('script, style, svg defs, #splash-screen')) continue;
    const cs = getComputedStyle(el);
    // Kept as a short fingerprint per element (FNV-1a over every value);
    // the full styles of a whole screen would not fit in memory many times over.
    // Sorted: Chrome lists custom properties in an order that changes from
    // one page load to the next.
    const names = Array.from(cs).filter(p => !skip.has(p)).sort();
    let h = 0x811c9dc5;
    for (const p of names) {
      const v = p + ':' + cs.getPropertyValue(p) + ';';
      for (let j = 0; j < v.length; j++) { h ^= v.charCodeAt(j); h = Math.imul(h, 0x01000193); }
    }
    const props = (h >>> 0).toString(36);
    out[keyOf(el)] = props;
  }
  return out;
}

const result = {};
try {
  for (const width of WIDTHS) {
    for (const theme of THEMES) {
      const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: 'reduce' });
      const page = await context.newPage();
      await page.route('**/*', (route) => (route.request().url().startsWith(base) ? route.continue() : route.abort()));
      await page.goto(`${base}?ls=lm-theme=${theme}`);
      await page.waitForFunction(() => window.__shotsReady === true, null, { timeout: 30000 });
      await page.evaluate((t) => document.documentElement.setAttribute('data-theme', t), theme);
      // Freeze motion so a colour half-way through a transition (the theme
      // switch above sets one off on every element) or a pulsing dot can't
      // read differently from one run to the next. The same rule is added on
      // both sides of a comparison, so it hides nothing but motion.
      await page.addStyleTag({ content: '*, *::before, *::after { transition: none !important; animation: none !important; }' });
      for (const tab of TABS) {
        await page.evaluate((name) => window.switchTab(name), tab);
        await page.waitForTimeout(150);
        result[`${theme}-${width}/${tab}`] = await page.evaluate(snapshot);
      }
      await context.close();
    }
  }
} finally {
  await browser.close();
  await server.close();
}

// The screens visited earlier change what later ones contain (and so their
// layout), so only runs over the same list of screens can be compared.
if (args.out) fs.writeFileSync(path.resolve(args.out), JSON.stringify({ tabs: TABS.join(','), screens: result }));
const elements = Object.values(result).reduce((n, s) => n + Object.keys(s).length, 0);
console.log(`Recorded ${elements} elements across ${Object.keys(result).length} screens.`);

if (args.compare) {
  const saved = JSON.parse(fs.readFileSync(path.resolve(args.compare), 'utf8'));
  if (saved.tabs !== TABS.join(',')) {
    console.error(`Recorded with --only=${saved.tabs}; run the comparison with the same list.`);
    process.exit(2);
  }
  const before = saved.screens;
  let changed = 0;
  for (const [screen, els] of Object.entries(result)) {
    const old = before[screen] || {};
    for (const [key, props] of Object.entries(els)) {
      if (!old[key]) continue; // drawn only this time (a clock, a toast)
      if (props === old[key]) continue;
      changed++;
      if (changed <= 40) console.log(`✗ ${screen} ${key.split('>').slice(-4).join(' > ')}`);
    }
  }
  console.log(changed ? `\n${changed} element(s) look different.` : '\nNo element looks different.');
  process.exit(changed ? 1 : 0);
}
