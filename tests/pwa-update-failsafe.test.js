// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const mainJs = readFileSync(path.join(__dirname, '../src/main.js'), 'utf8');

// Run the real update helper without booting the whole app.
const start = mainJs.indexOf('function revealUpdatingScreen');
const end = mainJs.indexOf('const _updateSW = registerSW(');
const src = mainJs.slice(start, end).replace(/export function/g, 'function');
const load = () => new Function(`${src}; return applyPwaUpdate;`)();

beforeEach(() => {
  vi.useFakeTimers();
  document.body.innerHTML = '<div id="updating-screen" aria-hidden="true"></div><div id="pwa-update-prompt" class="is-visible"></div>';
});
afterEach(() => vi.useRealTimers());

test('the updating screen always ends in a reload, even if the new version never takes over', () => {
  const reload = vi.fn();
  const updateSW = vi.fn(() => new Promise(() => {})); // never settles, never takes control
  load()(updateSW, { reload, failsafeMs: 3000 });
  expect(updateSW).toHaveBeenCalledWith(true); // asked immediately, no fixed pause first
  expect(document.getElementById('updating-screen').classList.contains('is-visible')).toBe(true);
  expect(reload).not.toHaveBeenCalled();
  vi.advanceTimersByTime(3000);
  expect(reload).toHaveBeenCalledTimes(1);
});

test('a failed update request reloads right away instead of hanging', async () => {
  const reload = vi.fn();
  load()(() => Promise.reject(new Error('no waiting worker')), { reload });
  await vi.waitFor(() => expect(reload).toHaveBeenCalledTimes(1));
  vi.advanceTimersByTime(5000);
  expect(reload).toHaveBeenCalledTimes(1); // never twice
});

test('the fixed half-second pause before updating is gone', () => {
  expect(mainJs).not.toMatch(/_updateSW\(true\);\s*\}, 520\)/);
});
