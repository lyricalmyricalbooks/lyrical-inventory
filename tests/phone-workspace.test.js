// @vitest-environment jsdom
import { beforeEach, expect, test, vi } from 'vitest';
import { createPhonePageMemory, initPhoneWorkspace } from '../src/lib/phone-workspace.js';

beforeEach(() => { document.body.innerHTML = ''; });

test('remembers each page and book separately, with no desktop scrolling', () => {
  let phone = true, callback;
  const win = { scrollY: 560, matchMedia: () => ({ matches: phone }), requestAnimationFrame: fn => { callback = fn; return 1; }, cancelAnimationFrame: vi.fn(), scrollTo: vi.fn() };
  const pages = createPhonePageMemory(win);
  pages.leave('book-a:customers'); pages.enter('book-a:pos'); callback();
  expect(win.scrollTo).toHaveBeenLastCalledWith({ top: 0, left: 0, behavior: 'instant' });
  pages.enter('book-a:customers'); callback();
  expect(win.scrollTo).toHaveBeenLastCalledWith({ top: 560, left: 0, behavior: 'instant' });
  pages.enter('book-b:customers'); callback();
  expect(win.scrollTo).toHaveBeenLastCalledWith({ top: 0, left: 0, behavior: 'instant' });
  phone = false; win.scrollTo.mockClear(); pages.enter('book-a:customers');
  expect(win.scrollTo).not.toHaveBeenCalled();
});

test('rapid navigation cancels an old restoration and clearing drops saved positions', () => {
  const callbacks = new Map(); let id = 0;
  const win = { scrollY: 300, matchMedia: () => ({ matches: true }), requestAnimationFrame: fn => { callbacks.set(++id, fn); return id; }, cancelAnimationFrame: n => callbacks.delete(n), scrollTo: vi.fn() };
  const pages = createPhonePageMemory(win);
  pages.leave('old'); pages.enter('old'); pages.enter('new');
  expect(callbacks.size).toBe(1); pages.clear(); expect(callbacks.size).toBe(0);
  pages.enter('old'); [...callbacks.values()][0]();
  expect(win.scrollTo).toHaveBeenCalledWith({ top: 0, left: 0, behavior: 'instant' });
});

test('compact account moves original controls and sync chip, then restores desktop and author views', async () => {
  document.body.innerHTML = '<div id="app" class="pub-shell"><header class="app-header"><div id="original"><button id="profile-toggle-group">Profile</button><button id="role-toggle-btn" style="display:none">Role</button></div><div id="phone-account-tools"></div></header></div><div id="sync-chip" hidden>Offline</div>';
  const media = { matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() };
  const root = document.getElementById('app'), profile = document.getElementById('profile-toggle-group');
  const click = vi.fn(); profile.addEventListener('click', click);
  const cleanup = initPhoneWorkspace(root, { matchMedia: () => media });
  expect(profile.parentElement.id).toBe('phone-account-tools'); profile.click(); expect(click).toHaveBeenCalledOnce();
  expect(document.getElementById('role-toggle-btn').style.display).toBe('none');
  expect(document.getElementById('sync-chip').previousElementSibling.className).toBe('app-header');
  expect(document.getElementById('sync-chip').hidden).toBe(true);
  root.classList.remove('pub-shell'); await Promise.resolve();
  expect(profile.parentElement.id).toBe('original');
  root.classList.add('pub-shell'); await Promise.resolve();
  media.matches = false; media.addEventListener.mock.calls[0][1]();
  expect(profile.parentElement.id).toBe('original');
  expect(document.getElementById('sync-chip').parentElement).toBe(document.body);
  cleanup(); expect(media.removeEventListener).toHaveBeenCalled();
});
