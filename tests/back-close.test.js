// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { installBackClose } from '../src/lib/back-close.js';
import { attemptCloseModal, closeM, configureModals, openM, topOpenModalId } from '../src/lib/modal.js';

// Stand-in for the browser's CloseWatcher: records what is armed and lets the
// test press "back" on the newest live one.
function fakeWatcherWindow() {
  const live = [];
  class CloseWatcher {
    constructor() { this.destroyed = false; this.onclose = null; live.push(this); }
    destroy() { this.destroyed = true; const i = live.indexOf(this); if (i >= 0) live.splice(i, 1); }
  }
  return {
    win: { CloseWatcher },
    live,
    async back() {
      const w = live.pop();
      if (!w) return false;
      w.destroyed = true;
      await w.onclose?.();
      await new Promise((r) => setTimeout(r, 0));
      return true;
    },
  };
}

const overlay = (id, extra = '') => `<div class="overlay${extra}" id="m-${id}" style="display:none"><div class="modal"><input id="${id}-field"></div></div>`;
// A closing pop-up animates out before it is hidden; for the person it is gone.
const isOpen = (id) => {
  const el = document.getElementById(`m-${id}`);
  return el.style.display === 'flex' && !el.classList.contains('closing');
};

let fake;
beforeEach(() => {
  // m-confirm comes first in the page, as in index.html, yet opens over others.
  document.body.innerHTML = `
    <div class="overlay" id="m-confirm" style="display:none"><div class="modal">
      <h3 id="m-confirm-title"></h3><div id="m-confirm-body"></div>
      <button id="m-confirm-ok"></button><button id="m-confirm-cancel"></button>
    </div></div>
    ${overlay('lower')}${overlay('upper')}
    <div class="overlay fk-workspace" id="m-fair-kit" style="display:none"></div>`;
  fake = fakeWatcherWindow();
  const back = installBackClose({ getTop: topOpenModalId, requestClose: attemptCloseModal, win: fake.win });
  configureModals({ onStackChange: () => back.sync() });
});

afterEach(() => {
  ['upper', 'lower', 'confirm', 'fair-kit'].forEach((id) => closeM(id));
  configureModals({});
});

describe('back gesture closes the pop-up on top', () => {
  test('does nothing where the browser has no CloseWatcher', () => {
    const back = installBackClose({ getTop: () => 'x', requestClose: () => {}, win: {} });
    expect(() => back.sync()).not.toThrow();
  });

  test('arms while a pop-up is open and lets go when it closes another way', () => {
    openM('lower');
    expect(fake.live).toHaveLength(1);
    closeM('lower');
    expect(fake.live).toHaveLength(0);
  });

  test('back closes the open pop-up', async () => {
    openM('lower');
    await fake.back();
    expect(isOpen('lower')).toBe(false);
    expect(fake.live).toHaveLength(0);
  });

  test('with two pop-ups open, back closes only the top one and re-arms for the other', async () => {
    openM('lower');
    openM('upper');
    expect(fake.live).toHaveLength(1);
    await fake.back();
    expect(isOpen('upper')).toBe(false);
    expect(isOpen('lower')).toBe(true);
    expect(fake.live).toHaveLength(1);
    await fake.back();
    expect(isOpen('lower')).toBe(false);
  });

  test('unsaved typing asks first; back on the question keeps the pop-up open and armed', async () => {
    openM('lower');
    document.getElementById('lower-field').value = 'half a sentence';
    const pending = fake.back();
    await new Promise((r) => setTimeout(r, 0));
    // The "Discard your unsaved changes?" question is up, and back reaches it.
    expect(isOpen('confirm')).toBe(true);
    expect(topOpenModalId()).toBe('confirm');
    expect(fake.live).toHaveLength(1);
    await fake.back();
    await pending;
    expect(isOpen('confirm')).toBe(false);
    expect(isOpen('lower')).toBe(true);
    expect(document.getElementById('lower-field').value).toBe('half a sentence');
    expect(fake.live).toHaveLength(1);
  });

  test('inline workspaces that reuse the pop-up markup never arm it', () => {
    openM('fair-kit');
    expect(topOpenModalId()).toBeNull();
    expect(fake.live).toHaveLength(0);
  });

  test('"on top" follows the order pop-ups opened, not their place in the page', () => {
    openM('upper');
    openM('confirm');
    expect(topOpenModalId()).toBe('confirm');
  });
});
