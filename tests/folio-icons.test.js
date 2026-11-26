// @vitest-environment jsdom
import { afterEach, expect, test } from 'vitest';
import { folioIconFor, iconizeIn, initFolioIcons } from '../src/lib/folio-icons.js';

let stop;
afterEach(() => { stop?.(); stop = undefined; document.body.innerHTML = ''; });
const tick = () => new Promise(resolve => setTimeout(resolve, 0));

test('known emoji map to sprite icons, with or without the variation selector', () => {
  expect(folioIconFor('🖨️')).toBe('printer');
  expect(folioIconFor('🖨 ')).toBe('printer');
  expect(folioIconFor('✉️')).toBe('mail');
  expect(folioIconFor('♊')).toBeNull();
});

test('a lead emoji becomes a line icon and the words stay', () => {
  document.body.innerHTML = '<button id="b" class="btn"><span class="lead-emoji" aria-hidden="true">📋 </span>Copy segment</button>';
  iconizeIn(document.body);
  const b = document.getElementById('b');
  expect(b.textContent).toBe('Copy segment');
  expect(b.querySelector('.lead-emoji.lead-ic use').getAttribute('href')).toBe('#ic-copy');
});

test('a leading emoji typed straight into a button is wrapped and swapped', () => {
  document.body.innerHTML = '<button id="b">📦 Bulk send</button>';
  iconizeIn(document.body);
  const b = document.getElementById('b');
  expect(b.textContent.trim()).toBe('Bulk send');
  expect(b.querySelector('use').getAttribute('href')).toBe('#ic-shipping');
});

test('status marks, unknown emoji and plain text are left alone', () => {
  document.body.innerHTML = '<button id="a">✕ Cancel</button><button id="c"><span class="lead-emoji">♊ </span>Gemini</button><p id="p">📚 My poems</p>';
  iconizeIn(document.body);
  expect(document.getElementById('a').textContent).toBe('✕ Cancel');
  expect(document.getElementById('c').textContent).toBe('♊ Gemini');
  expect(document.getElementById('p').textContent).toBe('📚 My poems');
});

test('lone-emoji picture boxes become icons, and later renders are caught too', async () => {
  document.body.innerHTML = '<div id="root"><div class="dz-icon">🧾</div></div>';
  const root = document.getElementById('root');
  stop = initFolioIcons(root);
  expect(root.querySelector('.dz-icon use').getAttribute('href')).toBe('#ic-receipt-doc');
  root.insertAdjacentHTML('beforeend', '<div class="hist-kpi-icon">🖨️</div><button id="later">✨ AI Scan</button>');
  await tick();
  expect(root.querySelector('.hist-kpi-icon use').getAttribute('href')).toBe('#ic-printer');
  expect(document.getElementById('later').querySelector('use').getAttribute('href')).toBe('#ic-sparkles');
});

test('the Table switch uses a table icon', () => {
  expect(folioIconFor('▦')).toBe('table');
});
