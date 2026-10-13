// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { afterEach, expect, test } from 'vitest';
import { initPhoneLayouts } from '../src/lib/phone-layout.js';

// The author view's bottom menu holds more tabs than a phone shows. Its right
// edge fades while tabs remain off-screen, and the fade goes once the strip is
// scrolled to the end.
let stop;
afterEach(() => { stop?.(); document.body.innerHTML = ''; });

function strip({ scrollWidth, clientWidth }) {
  document.body.innerHTML = '<div id="app"><nav class="tab-bar" id="tab-bar"><button class="tab-btn">Sell</button></nav></div>';
  const nav = document.getElementById('tab-bar');
  Object.defineProperty(nav, 'scrollWidth', { configurable: true, value: scrollWidth });
  Object.defineProperty(nav, 'clientWidth', { configurable: true, value: clientWidth });
  return nav;
}

test('a strip with tabs off to the right is marked, and unmarked at the end', () => {
  const nav = strip({ scrollWidth: 900, clientWidth: 375 });
  stop = initPhoneLayouts(document.getElementById('app'));
  expect(nav.classList.contains('has-more-right')).toBe(true);
  nav.scrollLeft = 525;
  nav.dispatchEvent(new Event('scroll'));
  expect(nav.classList.contains('has-more-right')).toBe(false);
  nav.scrollLeft = 100;
  nav.dispatchEvent(new Event('scroll'));
  expect(nav.classList.contains('has-more-right')).toBe(true);
});

test('a strip whose tabs all fit carries no fade', () => {
  const nav = strip({ scrollWidth: 375, clientWidth: 375 });
  stop = initPhoneLayouts(document.getElementById('app'));
  expect(nav.classList.contains('has-more-right')).toBe(false);
});

test('the fade is phone-only, painted in the menu colour, and lets taps through', () => {
  const css = readFileSync(`${process.cwd()}/src/styles/phone.css`, 'utf8');
  const section = css.slice(css.indexOf('Batch 4H'));
  expect(section).toMatch(/@media \(max-width: 768px\)/);
  expect(section).toMatch(/\.tab-bar::after \{[^}]*position: sticky;[^}]*var\(--ink2\)[^}]*pointer-events: none;/);
  expect(section).toMatch(/\.tab-bar\.has-more-right::after \{ opacity: 1; \}/);
});
