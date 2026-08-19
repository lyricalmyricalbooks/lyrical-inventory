import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  openM, closeM, attemptCloseModal, refreshUnsavedMarkers, modalFieldsChanged,
} from '../src/lib/modal.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const indexHtml = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const styleCss = fs.readFileSync(path.join(root, 'src/style.css'), 'utf8');

// Why this file exists:
//
// Esc and a backdrop click have always asked "Discard your unsaved changes?".
// The Cancel button sitting right there in the footer did not — it called
// closeM() directly and threw a half-filled shipment, sale or expense form away
// without a word. The Add Book form even *showed* an unsaved-changes flag and
// then discarded the work anyway.
//
// These tests lock in the fix from both ends: the markup can't regress to a
// bare closeM(), and the flag itself appears, disappears and cleans up.

describe('every dialog Cancel/Close button is guarded', () => {
  it('index.html routes inline dismiss buttons through attemptCloseModal', () => {
    // A bare closeM('…') in an onclick is the exact shape of the old bug.
    const unguarded = indexHtml
      .split('\n')
      .map((line, i) => [i + 1, line])
      .filter(([, line]) => /onclick="closeM\(/.test(line));
    expect(unguarded).toEqual([]);
  });

  it('still wires those buttons to something — the guard is not just deleted', () => {
    const guarded = indexHtml.match(/onclick="attemptCloseModal\(/g) || [];
    expect(guarded.length).toBeGreaterThan(25);
  });
});

describe('unsaved-changes flag', () => {
  beforeEach(() => {
    // closeM's animation path never resolves without a real animationend; ask
    // for reduced motion so the dialog hides synchronously.
    window.matchMedia = () => ({ matches: true, addEventListener() {}, removeEventListener() {} });
    // No #m-confirm markup here, so confirmDialog falls back to window.confirm.
    window.confirm = () => true;
    document.body.innerHTML = `
      <div class="overlay" id="m-demo" style="display:none;">
        <div class="modal">
          <input id="demo-note" value="" />
          <div class="modal-footer">
            <button class="btn">Cancel</button>
            <button class="btn gold">Save</button>
          </div>
        </div>
      </div>`;
  });

  afterEach(() => { document.body.innerHTML = ''; });

  const type = (value) => { document.getElementById('demo-note').value = value; };
  const flag = () => document.querySelector('#m-demo .save-indicator');

  it('stays out of the DOM until the owner actually types something', () => {
    openM('demo');
    refreshUnsavedMarkers();
    // An untouched footer keeps exactly the layout it had before this change.
    expect(flag()).toBeNull();
  });

  it('appears, visibly, once a field differs from what the dialog opened with', () => {
    openM('demo');
    type('two boxes to Munro Books');
    refreshUnsavedMarkers();
    expect(flag()).not.toBeNull();
    expect(flag().classList.contains('show')).toBe(true);
    expect(flag().getAttribute('aria-hidden')).toBe('false');
    expect(flag().textContent).toMatch(/unsaved/i);
  });

  it('drops away again when the field is put back', () => {
    openM('demo');
    type('typo');
    refreshUnsavedMarkers();
    type('');
    refreshUnsavedMarkers();
    expect(flag().classList.contains('show')).toBe(false);
    expect(flag().getAttribute('aria-hidden')).toBe('true');
  });

  it('is cleared away when the dialog closes, so the next open starts clean', () => {
    openM('demo');
    type('something');
    refreshUnsavedMarkers();
    expect(flag()).not.toBeNull();
    closeM('demo');
    expect(flag()).toBeNull();
  });

  it('ignores a dialog that is closed, and one that was never opened', () => {
    type('typed into a hidden dialog');
    refreshUnsavedMarkers();
    expect(flag()).toBeNull();
  });
});

describe('attemptCloseModal', () => {
  let answer;

  beforeEach(() => {
    answer = true;
    window.matchMedia = () => ({ matches: true, addEventListener() {}, removeEventListener() {} });
    window.confirm = () => answer;
    document.body.innerHTML = `
      <div class="overlay" id="m-demo" style="display:none;">
        <div class="modal">
          <input id="demo-note" value="" />
          <div class="modal-footer"><button class="btn">Cancel</button></div>
        </div>
      </div>`;
  });

  afterEach(() => { document.body.innerHTML = ''; });

  it('closes straight away and reports success when nothing was typed', async () => {
    openM('demo');
    expect(modalFieldsChanged('demo')).toBe(false);
    await expect(attemptCloseModal('demo')).resolves.toBe(true);
    expect(document.getElementById('m-demo').style.display).toBe('none');
  });

  it('keeps the dialog open and reports failure when the owner keeps editing', async () => {
    openM('demo');
    document.getElementById('demo-note').value = 'half a shipment';
    answer = false;
    await expect(attemptCloseModal('demo')).resolves.toBe(false);
    expect(document.getElementById('m-demo').style.display).toBe('flex');
    // And the typing survived — that is the whole point.
    expect(document.getElementById('demo-note').value).toBe('half a shipment');
  });

  it('discards only after an explicit confirmation', async () => {
    openM('demo');
    document.getElementById('demo-note').value = 'half a shipment';
    answer = true;
    await expect(attemptCloseModal('demo')).resolves.toBe(true);
    expect(document.getElementById('m-demo').style.display).toBe('none');
  });
});

describe('the flag is styled to the house status convention', () => {
  const block = styleCss.match(/\.save-indicator\{[\s\S]*?\}/)[0];

  it('uses the amber needs-attention role token, not the gold brand colour', () => {
    expect(block).toContain('var(--status-active)');
    expect(block).not.toContain('var(--gold)');
  });

  it('animates with motion tokens, so reduced motion collapses it automatically', () => {
    expect(block).toContain('var(--dur-base)');
    expect(block).toContain('var(--ease-entrance)');
  });

  it('keeps monospace figures and the shared pill radius', () => {
    expect(block).toContain("'DM Mono'");
    expect(block).toContain('border-radius:100px');
  });
});
