// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeEach, expect, test } from 'vitest';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const html = readFileSync(path.join(__dirname, '../index.html'), 'utf8');
const styles = readFileSync(path.join(__dirname, '../src/style.css'), 'utf8');
const mainJs = readFileSync(path.join(__dirname, '../src/main.js'), 'utf8');

// Run the real phone-nav block from main.js against the real markup, without
// booting the whole app (which needs Firebase).
const start = mainJs.indexOf('const MNAV_TABS');
const end = mainJs.indexOf('Object.assign(window, { openMoreSheet, closeMoreSheet });');
const block = mainJs.slice(start, end).replace(/export function/g, 'function');
const api = new Function(`${block}; return { openMoreSheet, closeMoreSheet, syncMoreNavState };`);

let nav;
beforeEach(() => {
  document.body.innerHTML = html.slice(html.indexOf('<body'), html.lastIndexOf('</body>')).replace(/^<body[^>]*>/, '');
  nav = api();
});

const moreLabels = () => [...document.querySelectorAll('#more-sheet-body .snav:not([hidden]) .snav-label')].map((n) => n.textContent);

test('bottom bar has four everyday destinations plus More', () => {
  const buttons = [...document.querySelectorAll('#mnav .mnav-btn')];
  expect(buttons.map((b) => b.querySelector('.mnav-label').textContent)).toEqual(['Home', 'Sell', 'Add sale', 'Orders', 'More']);
});

test('More sheet lists every sidebar tool not already on the bottom bar', () => {
  nav.openMoreSheet();
  expect(document.getElementById('more-sheet').hasAttribute('open')).toBe(true);
  const labels = moreLabels();
  for (const tool of ['Dashboard', 'To-do', 'Tax Centre', 'Payments', 'Customers', 'Shipping', 'Backups', 'History', 'Expenses']) {
    expect(labels).toContain(tool);
  }
  for (const onBar of ['Event POS', 'Manual entry', 'Website orders']) {
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

test('Today puts the four everyday jobs first, each a real button', () => {
  const cards = [...document.querySelectorAll('#tab-today .today-card')];
  expect(cards.map((c) => c.querySelector('.today-card-name').textContent)).toEqual(['Sell', 'Add sale', 'Orders', 'To-do']);
  expect(cards.every((c) => c.tagName === 'BUTTON')).toBe(true);
  // The To-do count rides the same badge class the sidebar uses, so it stays live.
  expect(cards[3].querySelector('.todo-nav-badge')).not.toBeNull();
});

test('Today shows the waiting-orders count from the Website orders panel', () => {
  const start = mainJs.indexOf('export function renderTodayHub');
  const end = mainJs.indexOf('// ── Phone "More" sheet');
  const render = new Function('$', mainJs.slice(start, end).replace('export function', 'function') + '; return renderTodayHub;')((id) => document.getElementById(id));
  document.querySelector('#web-orders-status .web-stat-value').textContent = '3';
  render();
  expect(document.getElementById('today-orders-count').hidden).toBe(false);
  expect(document.getElementById('today-orders-count').textContent).toBe('3');
  expect(document.getElementById('today-orders-sub').textContent).toBe('3 ready to apply');
  document.querySelector('#web-orders-status .web-stat-value').textContent = '0';
  render();
  expect(document.getElementById('today-orders-count').hidden).toBe(true);
  expect(document.getElementById('today-orders-sub').textContent).toBe('Website orders');
});

test('authors never land on the publisher-only Today page', () => {
  expect(mainJs).toMatch(/name === 'today'\)\) name = 'dashboard';/);
});
