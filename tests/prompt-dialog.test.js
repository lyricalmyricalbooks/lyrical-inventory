import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildHarness } from './helpers/extract-decl.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const indexHtml = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

// A behaviour test rather than another source grep — the point of the jsdom
// environment. tests/handler-wiring.test.js proves promptDialog is defined and
// reachable from a button; nothing proved it actually resolves, which is the
// half that matters to whoever clicks "Relink".
//
// main.js can't be imported (30k lines, top-level Firebase side effects), so
// the function is lifted out of the source by the shared extractor and run
// against the real m-prompt markup from index.html, with only its three
// collaborators stubbed.
function loadPromptDialog() {
  return buildHarness({
    names: ['promptDialog'],
    deps: {
      $: (id) => document.getElementById(id),
      openM: () => {},
      closeM: () => {},
    },
    returns: 'promptDialog',
  });
}

// Mount the actual dialog markup rather than a hand-written copy, so renaming
// an id in index.html fails this test instead of silently bypassing it.
function mountPromptMarkup() {
  const m = indexHtml.match(/<div class="overlay" id="m-prompt"[\s\S]*?\n<\/div>\n/);
  if (!m) throw new Error('m-prompt markup not found in index.html');
  document.body.innerHTML = m[0];
}

describe('promptDialog', () => {
  let promptDialog;

  beforeEach(() => {
    mountPromptMarkup();
    promptDialog = loadPromptDialog();
  });

  it('mounts the real markup from index.html', () => {
    expect(document.getElementById('m-prompt-input')).not.toBeNull();
    expect(document.getElementById('m-prompt-ok')).not.toBeNull();
    expect(document.getElementById('m-prompt-cancel')).not.toBeNull();
  });

  it('resolves with the typed value when OK is clicked', async () => {
    const p = promptDialog('Enter a path', 'old.jpg');
    const input = document.getElementById('m-prompt-input');
    expect(input.value).toBe('old.jpg');          // seeded with the default
    input.value = 'Business/2026-06-03_receipt.jpg';
    document.getElementById('m-prompt-ok').click();
    await expect(p).resolves.toBe('Business/2026-06-03_receipt.jpg');
  });

  it('resolves null when cancelled, so callers can tell that from an empty string', async () => {
    const p = promptDialog('Enter a path', 'old.jpg');
    document.getElementById('m-prompt-cancel').click();
    await expect(p).resolves.toBeNull();
  });

  it('resolves an empty string when the user deliberately clears the field', async () => {
    const p = promptDialog('Enter a path', 'old.jpg');
    document.getElementById('m-prompt-input').value = '';
    document.getElementById('m-prompt-ok').click();
    await expect(p).resolves.toBe('');
  });

  it('submits on Enter and cancels on Escape', async () => {
    const input = document.getElementById('m-prompt-input');

    const p1 = promptDialog('Enter a path', 'a.jpg');
    input.value = 'typed.jpg';
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await expect(p1).resolves.toBe('typed.jpg');

    const p2 = promptDialog('Enter a path', 'a.jpg');
    document.getElementById('m-prompt-input')
      .dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await expect(p2).resolves.toBeNull();
  });

  it('applies title and button labels from opts', () => {
    promptDialog('msg', '', { title: 'Relink Receipt File', okLabel: 'Update Link', cancelLabel: 'Nope' });
    expect(document.getElementById('m-prompt-title').textContent).toBe('Relink Receipt File');
    expect(document.getElementById('m-prompt-ok').textContent).toBe('Update Link');
    expect(document.getElementById('m-prompt-cancel').textContent).toBe('Nope');
  });

  it('detaches its listeners once resolved, so a later dialog is unaffected', async () => {
    const first = promptDialog('first', 'x');
    document.getElementById('m-prompt-cancel').click();
    await first;

    // If the first call's handlers were still attached, this Enter would settle
    // the stale promise too and the resolved value would be wrong.
    const second = promptDialog('second', 'y');
    const input = document.getElementById('m-prompt-input');
    input.value = 'second-value';
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await expect(second).resolves.toBe('second-value');
  });
});
