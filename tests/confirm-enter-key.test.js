// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { confirmDialog } from '../src/lib/modal.js';

function mount() {
  document.body.innerHTML = `
    <div class="overlay" id="m-confirm" style="display:none">
      <div id="m-confirm-title"></div><div id="m-confirm-body"></div>
      <button id="m-confirm-cancel">Go back</button>
      <button id="m-confirm-ok">Buy</button>
    </div>`;
}
const enter = (el) => el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
const settled = (p) => Promise.race([p, new Promise(r => setTimeout(() => r('pending'), 20))]);

describe('confirmDialog Enter key', () => {
  beforeEach(mount);

  it('Enter on the focused Go back button does not confirm; its click cancels', async () => {
    const p = confirmDialog('Buy another label?', { danger: true });
    const cancel = document.getElementById('m-confirm-cancel');
    enter(cancel);
    expect(await settled(p)).toBe('pending');
    cancel.click(); // what the browser does for Enter on a button
    expect(await p).toBe(false);
  });

  it('Enter with focus elsewhere still confirms', async () => {
    const p = confirmDialog('Sure?');
    enter(document.body);
    expect(await p).toBe(true);
  });
});
