#!/usr/bin/env node
// Phone screenshot rig: boots the real app (signed in, demo data, offline) in
// Chromium at phone sizes and saves a full-page PNG of every screen and the
// main pop-ups, in light and dark, plus a layout report per shot.
//
//   npm run shots                         every screen, 375 + 414 wide, both themes
//   npm run shots -- --only=reconcile,consignment
//   npm run shots -- --widths=375 --themes=light --modals=none --out=shots/before
//   npm run shots -- --widths=1280 --only=reconcile      (desktop sanity check)
//   --slices=N  screenfuls per screen (default 6)   --full  also one tall picture
//   --storage=key=value,…  extra device settings, e.g. --storage=allConGrouped=1
//   --session=key=value,…  per-visit choices, e.g. --session=lm-con-section=ledger
//
// Output (gitignored): <out>/<theme>-<width>/<screen>-NN.png (one per screenful)
// and <out>/report.json.
// The report lists, per shot: sideways overflow, primary controls smaller than
// a fingertip, text under 11px, boxes that poke past the screen edge, table
// rows left as unlabelled stacked cells on a phone, and silently clipped text.
// Dev-only: needs playwright-core (devDependency) and a local Chromium.
import { createServer } from 'vite';
import { chromium } from 'playwright-core';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../..');

const args = Object.fromEntries(process.argv.slice(2).map(a => {
  const [k, ...v] = a.replace(/^--/, '').split('=');
  return [k, v.join('=') || 'true'];
}));
const list = (v, fallback) => (v ? v.split(',').map(s => s.trim()).filter(Boolean) : fallback);

// Every tab panel the publisher can reach (SHELL_TAB_LABELS in src/main.js).
// --only=menu also shoots the phone side menu, opened over Today.
// --click=.store-row taps the first match on each screen before shooting.
const ALL_TABS = ['today', 'pos', 'manual', 'dashboard', 'all-overview', 'todo', 'intel', 'website',
  'consignment', 'history', 'expenses', 'reconcile', 'customers', 'opencall', 'taxcenter', 'shipping',
  'bigcartel', 'webanalytics', 'sheets', 'backups', 'help', 'qrcodes'];
// Pop-ups opened bare with openM(); the ones that need a record are filled with demo data.
const ALL_MODALS = ['add-store', 'send-books', 'bulk-send', 'record-sale', 'consign-payment', 'return',
  'edit-expense', 'invoice-edit', 'invoice-settings', 'shipping-label', 'import', 'add-book',
  'stock-transfer', 'batch-expense', 'tc-new-trip', 'notifications'];

const widths = list(args.widths, ['375', '414']).map(Number);
const themes = list(args.themes, ['light', 'dark']);
const tabs = list(args.only, ALL_TABS);
const modals = args.modals === 'none' ? [] : list(args.modals, args.only ? [] : ALL_MODALS);
const outDir = path.resolve(ROOT, args.out || 'shots');
const port = Number(args.port || 5199);
const maxSlices = Number(args.slices || 6);
const chromePath = process.env.CHROME_PATH
  || ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/opt/pw-browsers/chromium/chrome-linux/chrome']
    .find(p => fs.existsSync(p));
if (!chromePath) throw new Error('phone-shots: no Chromium found; set CHROME_PATH');

// Web fonts are the one outside request worth making — the type is half the
// design. Fetched with curl (which honours the environment's proxy and CA
// bundle) and cached; every other outside request fails, like a phone offline.
const fontCache = path.join(ROOT, 'node_modules/.cache/phone-shots-fonts');
fs.mkdirSync(fontCache, { recursive: true });
function cachedFetch(url) {
  const file = path.join(fontCache, Buffer.from(url).toString('base64url').slice(0, 200));
  if (!fs.existsSync(file)) {
    try {
      // A desktop Chrome UA gets woff2 from Google Fonts.
      execFileSync('curl', ['-sSfL', '-A', 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36', '-o', file, url], { stdio: 'ignore' });
    } catch { return null; }
  }
  return fs.readFileSync(file);
}

// strictPort off: when several runs (or agents) shoot at once, each takes the
// next free port instead of failing.
const server = await createServer({ configFile: path.join(HERE, 'vite.shots.config.js'), server: { port, strictPort: false } });
await server.listen();
const base = new URL('/', server.resolvedUrls?.local?.[0] || `http://localhost:${port}/`).href;
const browser = await chromium.launch({ executablePath: chromePath });
const report = [];

async function prepare(page) {
  await page.route('**/*', (route) => {
    const url = route.request().url();
    if (url.startsWith(base)) return route.continue();
    if (/^https:\/\/fonts\.(googleapis|gstatic)\.com\//.test(url)) {
      const body = cachedFetch(url);
      if (!body) return route.abort();
      const type = url.includes('googleapis') ? 'text/css' : 'font/woff2';
      return route.fulfill({ status: 200, body, headers: { 'content-type': type, 'access-control-allow-origin': '*' } });
    }
    return route.abort();
  });
}

// Facts a screenshot alone hides. Run inside the page.
function measure() {
  const vw = document.documentElement.clientWidth;
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none';
  };
  const label = (el) => {
    const id = el.id ? '#' + el.id : '';
    const cls = el.classList.length ? '.' + [...el.classList].slice(0, 3).join('.') : '';
    const text = (el.innerText || el.value || el.getAttribute('aria-label') || '').trim().replace(/\s+/g, ' ').slice(0, 40);
    return `${el.tagName.toLowerCase()}${id}${cls}${text ? ` "${text}"` : ''}`;
  };
  const scope = document.querySelector('.overlay[style*="flex"] .modal') || document.querySelector('.tab-panel.active, #tab-all-overview.active') || document.body;
  const smallTargets = [];
  for (const el of scope.querySelectorAll('button, a[href], select, input:not([type=hidden]), [role=button], [role=tab]')) {
    if (!visible(el)) continue;
    const r = el.getBoundingClientRect();
    // The test is the box a finger hits, so a sub-44 visual with a ::after hit area still counts as small here.
    if (r.height < 32 || r.width < 32) smallTargets.push(`${label(el)} ${Math.round(r.width)}×${Math.round(r.height)}`);
  }
  const tinyText = new Set();
  const offscreen = [];
  for (const el of scope.querySelectorAll('*')) {
    if (!visible(el)) continue;
    const hasText = [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim());
    if (hasText && parseFloat(getComputedStyle(el).fontSize) < 11) tinyText.add(`${label(el)} ${getComputedStyle(el).fontSize}`);
    const r = el.getBoundingClientRect();
    if (r.right > vw + 1 && !el.closest('.tbl-wrap, [style*="overflow"], .recon-chips, .sys-scroll-x')) offscreen.push(`${label(el)} right=${Math.round(r.right)}`);
  }
  // The "bare stacked numbers" signature: a row of a phone-card table that was
  // not turned into a card (or a labelled heading strip), so its cells fall
  // down the screen as unlabelled blocks. Found by the owner on All books →
  // Group by book; flagged here so every run catches the next one.
  const unlabelledRows = [];
  for (const row of scope.querySelectorAll('table.phone-records :is(tbody, tfoot) > tr')) {
    if (!visible(row) || row.matches('.phone-record, .phone-group-row')) continue;
    const cells = [...row.cells].filter(visible);
    if (cells.length < 2) continue; // a single full-width message row is fine
    unlabelledRows.push(`${label(row)} — ${cells.length} cells stacked without labels`);
  }
  // Text cut off by a box that hides its overflow (no ellipsis = silently lost).
  const clipped = [];
  for (const el of scope.querySelectorAll('*')) {
    if (!visible(el) || el.children.length) continue;
    const cs = getComputedStyle(el);
    if (cs.overflow === 'visible' || cs.textOverflow === 'ellipsis') continue;
    if (el.scrollWidth > el.clientWidth + 2 && (el.textContent || '').trim()) clipped.push(`${label(el)} ${el.scrollWidth}>${el.clientWidth}`);
  }
  return {
    viewport: vw,
    unlabelledRows: unlabelledRows.slice(0, 30),
    clipped: clipped.slice(0, 30),
    pageWidth: document.documentElement.scrollWidth,
    sidewaysOverflow: document.documentElement.scrollWidth > vw + 1,
    smallTargets: smallTargets.slice(0, 40),
    tinyText: [...tinyText].slice(0, 30),
    offscreen: offscreen.slice(0, 30),
    errors: (window.__shotsErrors || []).slice(0, 10),
  };
}

for (const theme of themes) {
  for (const width of widths) {
    const phone = width < 769;
    const context = await browser.newContext({
      viewport: { width, height: phone ? 812 : 900 },
      deviceScaleFactor: 2,
      isMobile: phone,
      hasTouch: phone,
      colorScheme: theme,
      // The shop is in Canada: the register picks its charging currency (and dates
      // their format) from the device, so shoot as a Canadian phone would.
      locale: 'en-CA',
      timezoneId: 'America/Halifax',
    });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(String(e.message || e)));
    await prepare(page);
    await page.addInitScript(() => {
      window.__shotsErrors = [];
      window.addEventListener('error', e => window.__shotsErrors.push(String(e.message)));
    });
    const storage = [
      ...list(args.storage, []).map(pair => 'ls=' + encodeURIComponent(pair)),
      ...list(args.session, []).map(pair => 'ss=' + encodeURIComponent(pair)),
    ].join('&');
    await page.goto(storage ? `${base}?${storage}` : base, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.__shotsReady === true, null, { timeout: 30000 });
    await page.evaluate(() => document.fonts.ready);
    const dir = path.join(outDir, `${theme}-${width}`);
    fs.mkdirSync(dir, { recursive: true });

    const shoot = async (name) => {
      await page.waitForTimeout(350);
      // One picture per screenful, scrolled the way a thumb would, so the
      // sticky header and bottom menu sit where they really do. --full also
      // keeps one tall picture of the whole page.
      await page.evaluate(() => { const t = document.getElementById('toast'); if (t) t.classList.remove('show'); });
      const facts = await page.evaluate(measure);
      const scroller = name.startsWith('modal-')
        ? `document.querySelector('.overlay[style*="flex"] .modal-body') || document.querySelector('.overlay[style*="flex"] .modal')`
        : 'document.scrollingElement';
      const { total, view } = await page.evaluate((expr) => { const el = eval(expr); return { total: el.scrollHeight, view: el.clientHeight }; }, scroller);
      const step = Math.max(200, view - 96);
      const files = [];
      for (let i = 0, y = 0; i < maxSlices && (i === 0 || y < total - view + step); i++, y += step) {
        await page.evaluate(([expr, top]) => { eval(expr).scrollTop = top; window.scrollTo(0, top); }, [scroller, y]);
        await page.waitForTimeout(120);
        const file = path.join(dir, `${name}-${String(i + 1).padStart(2, '0')}.png`);
        await page.screenshot({ path: file, animations: 'disabled' });
        files.push(path.relative(ROOT, file));
        if (y + view >= total) break;
      }
      if (args.full) {
        const file = path.join(dir, `${name}-full.png`);
        await page.screenshot({ path: file, fullPage: true, animations: 'disabled' });
        files.push(path.relative(ROOT, file));
      }
      await page.evaluate((expr) => { eval(expr).scrollTop = 0; window.scrollTo(0, 0); }, scroller);
      report.push({ theme, width, screen: name, files, pageHeight: total, ...facts, pageErrors: errors.splice(0) });
      process.stdout.write(`  ${theme}-${width} ${name}${facts.sidewaysOverflow ? '  ⚠ sideways scroll' : ''}\n`);
    };
    const closeOverlays = () => page.evaluate(() => {
      document.querySelectorAll('.overlay').forEach(o => { if (o.style.display === 'flex') window.closeM?.(o.id.replace(/^m-/, '')); });
      document.querySelectorAll('dialog[open]').forEach(d => d.close());
    });

    for (const tab of tabs) {
      await closeOverlays();
      await page.evaluate((t) => {
        window.switchBook?.(t === 'all-overview' ? 'all' : 'harbour');
        // 'menu' is not a screen: it is Today with the phone side menu open.
        window.switchTab?.(t === 'all-overview' ? 'dashboard' : t === 'menu' ? 'today' : t);
        window.scrollTo(0, 0);
        if (t === 'menu') window.openMoreSheet?.();
      }, tab);
      // --click=selector[,selector…] taps those controls first (e.g. open a store row).
      for (const sel of list(args.click, [])) {
        await page.evaluate((q) => document.querySelector(`.tab-panel.active ${q}`)?.click(), sel);
      }
      await shoot(`tab-${tab}`);
    }
    for (const id of modals) {
      await closeOverlays();
      await page.evaluate(() => { window.switchBook?.('harbour'); window.switchTab?.('consignment'); });
      const opened = await page.evaluate((m) => {
        try { window.openM(m); } catch { return false; }
        return document.getElementById('m-' + m)?.style.display === 'flex';
      }, id);
      if (opened) await shoot(`modal-${id}`);
    }
    await context.close();
  }
}

fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'report.json'), JSON.stringify(report, null, 2));
const flagged = report.filter(r => r.sidewaysOverflow || r.pageErrors.length);
const unlabelled = report.filter(r => r.unlabelledRows?.length);
console.log(`\n${report.length} shots → ${path.relative(ROOT, outDir)}/  (${flagged.length} with sideways scroll or page errors, ${unlabelled.length} with unlabelled stacked rows)`);
for (const r of unlabelled) console.log(`  ⚠ ${r.theme}-${r.width} ${r.screen}: ${r.unlabelledRows[0]}${r.unlabelledRows.length > 1 ? ` (+${r.unlabelledRows.length - 1} more)` : ''}`);
await browser.close();
await server.close();
