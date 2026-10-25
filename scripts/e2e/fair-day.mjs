#!/usr/bin/env node
// A fair day in a real browser: the app on a phone-sized screen with no
// network, driven by taps the way a seller uses it.
//
//   1. Sell two copies of Harbour Lights at the register.
//   2. Undo that sale from the bar that appears under the register.
//   3. Sell one more, then void it from History's edit window.
//
// After each step it checks the book's saved history and stock, and it fails
// on any uncaught error in the page. The unit tests run the same code in a
// simulated page (jsdom); this run is the one that would catch a register
// that only breaks in a real browser: layout hiding a button, a module that
// fails to load, an event that never fires.
//
// Uses the phone-shots dev server (scripts/phone-shots): the real index.html
// and src/, Firebase swapped for the test suite's fake cloud, signed in as
// the publisher with demo books.
//
//   npm run e2e
//   CHROME_PATH=/path/to/chrome npm run e2e
import { createServer } from 'vite';
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../..');
const BOOK = 'harbour';
const TITLE = 'Harbour Lights';

const chromePath = process.env.CHROME_PATH
  || ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/opt/pw-browsers/chromium/chrome-linux/chrome']
    .find(p => fs.existsSync(p));

const server = await createServer({
  configFile: path.join(ROOT, 'scripts/phone-shots/vite.shots.config.js'),
  server: { port: 5299, strictPort: false },
});
await server.listen();
const base = new URL('/', server.resolvedUrls?.local?.[0]).href;
// No CHROME_PATH and nothing in /opt: the Chromium `npx playwright-core install chromium` put in its cache.
const browser = await chromium.launch(chromePath ? { executablePath: chromePath } : {});

const pageErrors = [];
let failed = false;
const step = (name) => console.log(`\n▸ ${name}`);
const check = (ok, what, detail = '') => {
  console.log(`  ${ok ? '✓' : '✗'} ${what}${ok || !detail ? '' : ` — ${detail}`}`);
  if (!ok) failed = true;
};

try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const page = await context.newPage();
  page.on('pageerror', (err) => pageErrors.push(err.message));
  // Only the dev server answers; everything else fails like a phone with no signal.
  await page.route('**/*', (route) => (route.request().url().startsWith(base) ? route.continue() : route.abort()));

  await page.goto(base);
  await page.waitForFunction(() => window.__shotsReady === true, null, { timeout: 30000 });

  // Reads what the app holds for the book: its stock and the History rows
  // with a given sale number.
  const book = (saleNum) => page.evaluate(({ id, num }) => {
    const s = window.__shotsMain.states[id];
    return { stock: s.stock, rows: s.hist.filter(h => !num || h.num === num) };
  }, { id: BOOK, num: saleNum });

  async function sell(copies) {
    await page.evaluate(() => window.switchTab('pos'));
    // On a phone the register is a list of big book buttons; one tap adds a copy.
    const add = page.getByRole('button', { name: new RegExp(`^Add one: ${TITLE}`) });
    for (let i = 0; i < copies; i++) await add.tap();
    // Charge opens the pay sheet; tapping how they paid records the sale.
    await page.locator('#fm-charge-btn').tap();
    const total = (await page.locator('#fm-charge-total').innerText()).trim();
    await page.getByRole('button', { name: 'Card reader' }).tap();
    // The sale is on this device the moment it is confirmed.
    await page.waitForFunction((id) => window.__shotsMain.states[id].hist.some(h => h.chan === 'Book Fair' && !h.voided), BOOK);
    return total;
  }

  const start = await book();

  step('Sell two copies at the register');
  const total = await sell(2);
  check(/48/.test(total), `checkout shows the total for two copies (${total})`);
  const afterSale = await book();
  const sale = afterSale.rows.find(h => h.chan === 'Book Fair' && !h.voided);
  check(!!sale && Number(sale.qty) === 2, 'History has the sale, two copies, channel Book Fair', JSON.stringify(sale));
  check(afterSale.stock === start.stock - 2, `stock went down by two (${start.stock} → ${afterSale.stock})`);

  step('Undo it from the register');
  const undo = page.locator('#fm-undo-btn');
  check(await undo.isVisible(), 'the Undo bar is showing');
  await undo.tap();
  await page.waitForFunction(({ id, num }) => window.__shotsMain.states[id].hist.find(h => h.num === num)?.voided, { id: BOOK, num: sale.num });
  const afterUndo = await book(sale.num);
  check(afterUndo.rows[0]?.voidedReason === 'Undone at the register', 'the sale is voided, marked as undone at the register');
  check(afterUndo.stock === start.stock, `stock is back where it started (${afterUndo.stock})`);

  step('Sell one more, then void it from History');
  await sell(1);
  const second = (await book()).rows.find(h => h.chan === 'Book Fair' && !h.voided);
  check(!!second && Number(second.qty) === 1, 'History has the one-copy sale', JSON.stringify(second));
  await page.evaluate((id) => { window.switchBook(id); window.switchTab('history'); }, BOOK);
  const idx = await page.evaluate(({ id, num }) => window.__shotsMain.states[id].hist.findIndex(h => h.num === num), { id: BOOK, num: second.num });
  await page.locator(`button[onclick="openEditHist(${idx})"]`).first().tap();
  await page.locator('#edit-void-btn').tap();
  await page.waitForFunction(({ id, num }) => window.__shotsMain.states[id].hist.find(h => h.num === num)?.voided, { id: BOOK, num: second.num });
  const afterVoid = await book();
  check(afterVoid.stock === start.stock, `stock is back where it started (${afterVoid.stock})`);

  step('No errors in the page');
  check(pageErrors.length === 0, 'no uncaught errors', pageErrors.join(' | '));
} catch (err) {
  failed = true;
  console.error('\n✗ The run stopped:', err.message);
  if (pageErrors.length) console.error('  Page errors:', pageErrors.join(' | '));
} finally {
  await browser.close();
  await server.close();
}

console.log(failed ? '\nFair day: FAILED' : '\nFair day: passed');
process.exit(failed ? 1 : 0);
