// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeEach, expect, test } from 'vitest';
import { salesForDay as salesForDayFn } from '../src/lib/today-summary.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const html = readFileSync(path.join(__dirname, '../index.html'), 'utf8');
const styles = readFileSync(path.join(__dirname, '../src/style.css'), 'utf8');
const mainJs = readFileSync(path.join(__dirname, '../src/main.js'), 'utf8');

// Run the real phone-nav block from main.js against the real markup, without
// booting the whole app (which needs Firebase).
const start = mainJs.indexOf('const MNAV_TABS');
const end = mainJs.indexOf('Object.assign(window, { openMoreSheet, closeMoreSheet });');
const block = mainJs.slice(start, end).replace(/export function/g, 'function');
const api = new Function(`${block}; return { openMoreSheet, closeMoreSheet, syncMoreNavState, refreshMoreDot };`);

let nav;
beforeEach(() => {
  document.body.innerHTML = html.slice(html.indexOf('<body'), html.lastIndexOf('</body>')).replace(/^<body[^>]*>/, '');
  nav = api();
});

const moreLabels = () => [...document.querySelectorAll('#more-sheet-body .snav:not([hidden]) .snav-label')].map((n) => n.textContent);

test('bottom bar has three everyday destinations plus More', () => {
  const buttons = [...document.querySelectorAll('#mnav .mnav-btn')];
  expect(buttons.map((b) => b.querySelector('.mnav-label').textContent)).toEqual(['Home', 'Sell', 'Manual entry', 'More']);
});

test('More sheet lists every sidebar tool not already on the bottom bar', () => {
  nav.openMoreSheet();
  expect(document.getElementById('more-sheet').hasAttribute('open')).toBe(true);
  const labels = moreLabels();
  for (const tool of ['Dashboard', 'To-do', 'Tax Centre', 'Payments', 'Customers', 'Shipping', 'Backups', 'History', 'Expenses', 'Website orders']) {
    expect(labels).toContain(tool);
  }
  for (const onBar of ['Event POS', 'Manual entry']) {
    expect(labels).not.toContain(onBar);
  }
  // Cloned ids would duplicate the sidebar's (badges are looked up by id).
  expect(document.querySelectorAll('#more-sheet-body [id]').length).toBe(0);
});

test('reopening the sheet does not duplicate its contents', () => {
  nav.openMoreSheet();
  const first = moreLabels().length;
  nav.closeMoreSheet();
  nav.openMoreSheet();
  expect(moreLabels().length).toBe(first);
});

test('More lights up when the open screen lives inside it', () => {
  const more = document.getElementById('mnav-more');
  nav.syncMoreNavState('taxcenter');
  expect(more.classList.contains('active')).toBe(true);
  nav.syncMoreNavState('pos');
  expect(more.classList.contains('active')).toBe(false);
});

test('switchTab keeps the bottom bar in sync', () => {
  expect(mainJs).toMatch(/querySelectorAll\('[^']*\.mnav-btn'\)/);
  expect(mainJs).toMatch(/syncMoreNavState\(name\);/);
});

test('phone nav only replaces the pill strip for publishers', () => {
  expect(styles).toMatch(/\.pub-shell \.tab-bar\{display:none;\}/);
  expect(styles).toMatch(/\.mnav\{display:none;\}/);
});

test('Home on the bottom bar opens the Today page', () => {
  const home = document.querySelector('#mnav .mnav-btn');
  expect(home.getAttribute('onclick')).toBe("switchTab('today')");
  expect(document.getElementById('tab-today')).not.toBeNull();
  expect(mainJs).toMatch(/if \(name === 'today'\) renderTodayHub\(\);/);
});

test('Today gives selling, orders, tasks and receipt capture a real button', () => {
  const cards = [...document.querySelectorAll('#tab-today .today-card')];
  expect(cards.map((c) => c.querySelector('.today-card-name').textContent)).toEqual(['Sell', 'Orders', 'To-do', 'Snap a receipt']);
  expect(cards.every((c) => c.tagName === 'BUTTON')).toBe(true);
  // The To-do count rides the same badge class the sidebar uses, so it stays live.
  expect(cards[2].querySelector('.todo-nav-badge')).not.toBeNull();
});

// Run the Today renderers from main.js against the real markup, with the app's
// own state stood in for.
function todayApi({ activeBook, renderOrders = () => {}, books = {}, states = {} }) {
  const start = mainJs.indexOf('// "Sold today · all books" on the phone home.');
  const end = mainJs.indexOf('// ── Phone "More" sheet');
  expect(start).toBeGreaterThan(-1);
  const src = mainJs.slice(start, end).replace('export function', 'function') + '; return { renderTodayHub, renderTodaySoFar };';
  const sync = [];
  const api = new Function('$', 'activeBook', 'renderOrders', 'BOOKS', 'states', 'getBookCurrencyCode', 'salesForDay', 'today', 'fairTotalsText', 'renderFairSyncPill', src)(
    (id) => document.getElementById(id), activeBook, renderOrders, books, states, () => 'CAD',
    salesForDayFn, () => '2026-10-08', (t) => Object.entries(t).map(([c, a]) => `${c} ${a.toFixed(2)}`).join(' + '), () => sync.push(1));
  return { ...api, sync };
}

test('Today shows the waiting-orders count from the Website orders panel', () => {
  const render = todayApi({ activeBook: 'book-a' }).renderTodayHub;
  document.querySelector('#web-orders-status .web-stat-value').textContent = '3';
  render();
  expect(document.getElementById('today-orders-count').hidden).toBe(false);
  expect(document.getElementById('today-orders-count').textContent).toBe('3');
  expect(document.getElementById('today-orders-sub').textContent).toBe('3 ready to apply');
  document.querySelector('#web-orders-status .web-stat-value').textContent = '0';
  render();
  expect(document.getElementById('today-orders-count').hidden).toBe(true);
  expect(document.getElementById('today-orders-sub').textContent).toBe('Review website orders');
});

test('authors never land on the publisher-only Today page', () => {
  expect(mainJs).toMatch(/name === 'today'\)\) name = 'dashboard';/);
});

test('manual entry has its own destination and only one destination is announced', () => {
  nav.syncMoreNavState('manual');
  const selected = document.querySelectorAll('#mnav [aria-current="page"]');
  expect(selected).toHaveLength(1);
  expect(selected[0].textContent).toContain('Manual entry');
  expect(document.querySelector('#tab-pos .phone-sell-head [onclick="switchTab(\'manual\')"]')).not.toBeNull();
});

test('Home in All books does not reuse another book’s order count', () => {
  const render = todayApi({ activeBook: 'all', renderOrders: () => { throw new Error('must not render a book-specific queue'); } }).renderTodayHub;
  document.querySelector('#web-orders-status .web-stat-value').textContent = '8';
  render();
  expect(document.getElementById('today-orders-count').hidden).toBe(true);
  expect(document.getElementById('today-orders-sub').textContent).toBe('Choose a book to review');
});

test('reopening a manual sale preserves its entered price; a different book gets its own price', () => {
  const start = mainJs.indexOf('function updateManualForm()');
  const end = mainJs.indexOf('// Keeps the live order-preview', start);
  let bookId = 'first';
  const make = () => new Function('$', 'getBook', 'activeBook', 'isAuthor', 'phint', mainJs.slice(start, end) + '; return updateManualForm;')((id) => document.getElementById(id), () => ({ title: bookId, listPrice: bookId === 'first' ? 20 : 30 }), bookId, () => false, () => {});
  make()();
  document.getElementById('m-price').value = '13.25';
  make()();
  expect(document.getElementById('m-price').value).toBe('13.25');
  bookId = 'second'; make()();
  expect(document.getElementById('m-price').value).toBe('30.00');
});

test('the More dot lights up as soon as a badge appears, without a screen change', async () => {
  const { observeSidebarBadges } = await import('../src/lib/phone-workspace.js');
  const observer = observeSidebarBadges(document.getElementById('pub-sidebar'), nav.refreshMoreDot);
  const dot = document.getElementById('mnav-more-dot');
  const more = document.getElementById('mnav-more');
  expect(dot.hidden).toBe(true);
  expect(more.hasAttribute('aria-label')).toBe(false);
  document.querySelector('#todo-sidebar-btn .nav-badge').hidden = false;
  await Promise.resolve();
  expect(dot.hidden).toBe(false);
  expect(more.getAttribute('aria-label')).toBe('More, something needs your attention');
  document.querySelector('#todo-sidebar-btn .nav-badge').hidden = true;
  await Promise.resolve();
  expect(dot.hidden).toBe(true);
  expect(more.hasAttribute('aria-label')).toBe(false);
  // Open Call's badge is shown through its inline style, not `hidden`.
  document.getElementById('oc-nav-badge').style.display = '';
  await Promise.resolve();
  expect(dot.hidden).toBe(false);
  observer.disconnect();
});

test('More says it is closed before it is ever opened', () => {
  expect(document.getElementById('mnav-more').getAttribute('aria-expanded')).toBe('false');
});

test('Today so far totals the day across every book and refreshes the upload pill', () => {
  const day = '2026-10-08';
  const { renderTodaySoFar, sync } = todayApi({
    activeBook: 'all',
    books: { a: {}, b: {} },
    states: {
      a: { hist: [{ num: 'S1', chan: 'In Person', qty: 2, price: 20, date: day }, { num: 'G', chan: 'Gratuity', qty: 1, price: 0, date: day, gratuity: true }] },
      b: { hist: [{ num: 'S2', chan: 'Website', qty: 1, price: 15, date: day }] },
    },
  });
  renderTodaySoFar();
  expect(document.getElementById('today-sold-sum').textContent).toBe('2 sales · 3 books · CAD 55.00');
  expect(sync).toHaveLength(1);
});

test('Today so far says so when nothing has sold yet', () => {
  const { renderTodaySoFar } = todayApi({ activeBook: 'all', books: { a: {} }, states: { a: { hist: [] } } });
  renderTodaySoFar();
  expect(document.getElementById('today-sold-sum').textContent).toBe('No sales yet today');
});

